import { FrameReassembler } from '../framing'
import type { FrameFormat } from '../framing'
import type { BleDiag, Transport } from '../ble'
import { toHex } from '../bytes'
import type { Gen } from '../crypto/nbcrypto'
import { HandshakeSession } from './handshake'
import type { HandshakeConfig } from './handshake'
import { BOARD, REG } from './frame'

// Bindet einen BLE-Transport an den Handshake: sendet Rahmen, sammelt die
// (verschlüsselten) Antwort-Rahmen wieder zusammen und fährt den 3-Schritt-Ablauf.

// Verschlüsseltes Wire-Frame: 3 Kopf + (4+LEN) Nutzlast + 6 Anhang = LEN+13.
// Reassembler: 2-Byte-Kopf [5A, sync2] + LEN-Byte, Rest = LEN + 10.
function encFormat(sync2: number): FrameFormat {
  return { header: [0x5a, sync2], trailerLen: 10 }
}

/** Sammelt vollständige Rahmen aus dem Notification-Strom, mit Warteschlange. */
class FrameChannel {
  private re: FrameReassembler
  private queue: Uint8Array[] = []
  private waiter: ((f: Uint8Array) => void) | null = null
  private readonly unsub: () => void

  constructor(transport: Transport, fmt: FrameFormat) {
    this.re = new FrameReassembler(fmt)
    this.unsub = transport.subscribe((chunk) => {
      for (const f of this.re.push(chunk)) {
        if (this.waiter) {
          const w = this.waiter
          this.waiter = null
          w(f)
        } else {
          this.queue.push(f)
        }
      }
    })
  }

  next(timeoutMs: number): Promise<Uint8Array> {
    const queued = this.queue.shift()
    if (queued) return Promise.resolve(queued)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null
        reject(new Error('Zeitüberschreitung — keine Antwort vom Roller'))
      }, timeoutMs)
      this.waiter = (f) => {
        clearTimeout(timer)
        resolve(f)
      }
    })
  }

  close(): void {
    this.unsub()
  }
}

export interface HandshakeProgress {
  step: 'pre' | 'setpwd' | 'auth' | 'done'
  status: string
  ok?: boolean
}

export interface HandshakeHooks {
  onProgress: (p: HandshakeProgress) => void
  /** Wird aufgerufen, wenn der Roller auf den Tastendruck wartet (index=0). */
  onWaitForButton?: () => void
  /** Jeder gesendete Rahmen (roh), für den Monitor. */
  onSent?: (bytes: Uint8Array) => void
  /** Jedes empfangene Notification-Häppchen (roh), auch unvollständige. */
  onRecvRaw?: (bytes: Uint8Array) => void
  timeoutMs?: number
  now?: () => number
}

export interface HandshakeOutcome {
  ok: boolean
  message: string
  paired?: boolean
  serialAscii?: string
  channel?: string
}

function toAscii(bytes: Uint8Array): string {
  return Array.from(bytes)
    .filter((b) => b >= 0x20 && b < 0x7f)
    .map((b) => String.fromCharCode(b))
    .join('')
}

export async function runHandshake(
  transport: Transport,
  btName: Uint8Array,
  cfg: HandshakeConfig,
  hooks: HandshakeHooks,
): Promise<HandshakeOutcome> {
  const timeout = hooks.timeoutMs ?? 8000
  const now = hooks.now ?? (() => Date.now())
  const ch = new FrameChannel(transport, encFormat(cfg.sync2))
  const rawTap = transport.subscribe((c) => hooks.onRecvRaw?.(c))
  const send = async (f: Uint8Array): Promise<void> => {
    hooks.onSent?.(f)
    await transport.send(f)
  }
  const s = new HandshakeSession(btName, cfg)

  try {
    // Schritt 1: PRE_COMM
    hooks.onProgress({ step: 'pre', status: 'Öffne Kanal (PRE_COMM) …' })
    await send(s.preCommFrame())
    const pre = s.handlePreResp(await ch.next(timeout))
    hooks.onProgress({
      step: 'pre',
      status: `Kanal offen. Serial ${toAscii(pre.serial)}, ${pre.paired ? 'bereits gekoppelt' : 'frisch (kein Passwort)'}.`,
      ok: true,
    })
    if (pre.paired) {
      return {
        ok: false,
        paired: true,
        serialAscii: toAscii(pre.serial),
        message:
          'Der Roller ist bereits mit einem anderen Handy gekoppelt (index != 0) und lehnt ein neues Passwort ab. Er muss zuerst zurückgesetzt/entkoppelt werden (Unlock-Kabel / SHU).',
      }
    }

    // Schritt 2: SET_PWD (evtl. Tastendruck nötig)
    hooks.onProgress({ step: 'setpwd', status: 'Setze Sitzungspasswort (SET_PWD) …' })
    await send(s.setPwdFrame(now()))
    let set = s.handleSetPwdResp(await ch.next(timeout))
    if (!set.accepted) {
      hooks.onWaitForButton?.()
      hooks.onProgress({ step: 'setpwd', status: 'Roller wartet — drücke jetzt die Ein/Aus-Taste am Roller.' })
      set = s.handleSetPwdResp(await ch.next(Math.max(timeout, 40000)))
    }
    if (!set.accepted) {
      return { ok: false, message: 'Passwort wurde nicht bestätigt (kein Tastendruck?).' }
    }
    hooks.onProgress({ step: 'setpwd', status: 'Passwort gesetzt.', ok: true })

    // Schritt 3: AUTH
    hooks.onProgress({ step: 'auth', status: 'Schalte frei (AUTH) …' })
    await send(s.authFrame())
    const auth = s.handleAuthResp(await ch.next(timeout))
    if (!auth.success) {
      return { ok: false, message: 'Freischaltung abgelehnt (AUTH index != 1).' }
    }
    hooks.onProgress({ step: 'done', status: 'Freigeschaltet — verschlüsselter Kanal steht.', ok: true })
    return { ok: true, message: 'Handshake erfolgreich — der Roller ist offen.', serialAscii: toAscii(s.getSerial()) }
  } finally {
    rawTap()
    ch.close()
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Schickt dasselbe PRE_COMM-Frame nacheinander an JEDEN Schreib-Kanal und lauscht
 * dabei auf allen Melde-Kanälen. Findet heraus, ob überhaupt ein Kanal antwortet.
 */
export async function scanPreComm(
  diag: BleDiag,
  preFrame: Uint8Array,
  hooks: { onLog: (s: string) => void; perChannelMs?: number },
): Promise<{ respondedOn: string[] }> {
  const wait = hooks.perChannelMs ?? 2500
  const respondedOn: string[] = []
  const rawUnsub = diag.subscribe((chunk, fromUuid) => hooks.onLog(`   ← ${fromUuid.slice(0, 8)}: ${toHex(chunk)}`))
  try {
    for (const target of diag.writeChars) {
      hooks.onLog(`→ Kanal ${target.uuid.slice(0, 8)} …`)
      let got = false
      const probe = diag.subscribe(() => {
        got = true
      })
      try {
        await diag.writeTo(target, preFrame)
      } catch (e) {
        hooks.onLog(`   (Schreiben ging nicht: ${e instanceof Error ? e.message : String(e)})`)
        probe()
        continue
      }
      await sleep(wait)
      probe()
      if (got) {
        respondedOn.push(target.uuid)
        hooks.onLog(`   ✓ Antwort auf ${target.uuid.slice(0, 8)}!`)
      }
    }
  } finally {
    rawUnsub()
  }
  return { respondedOn }
}

export interface SweepHit {
  sync2: number
  preKey2Fw: boolean
  gen: Gen
  authOffset: number
  channel: string
}

/**
 * Probiert ALLE Krypto-Varianten (2 Kopf × 2 Schlüssel × 2 Keystream × 2 Nonce =
 * 16) an ALLEN Schreib-Kanälen durch, bis eine eine Antwort auslöst.
 */
export async function sweepPreComm(
  diag: BleDiag,
  btName: Uint8Array,
  hooks: { onLog: (s: string) => void; perTryMs?: number },
): Promise<{ hit: SweepHit | null }> {
  const wait = hooks.perTryMs ?? 1200
  const syncs = [0xa5, 0xb5]
  const keys = [true, false]
  const ecbs: Gen[] = ['gen3', 'gen2']
  const offs = [0, 8]
  let hit: SweepHit | null = null

  const rawUnsub = diag.subscribe((chunk, fromUuid) => hooks.onLog(`   ← ${fromUuid.slice(0, 8)}: ${toHex(chunk)}`))
  try {
    outer: for (const sync2 of syncs) {
      for (const preKey2Fw of keys) {
        for (const gen of ecbs) {
          for (const authOffset of offs) {
            const frame = new HandshakeSession(btName, { sync2, gen, authOffset, preKey2Fw }).preCommFrame()
            const label = `Kopf=${sync2.toString(16)} Schlüssel=${preKey2Fw ? 'FW' : '0'} Keystream=${gen === 'gen2' ? 'FW' : '0'} Nonce=${authOffset}`
            for (const target of diag.writeChars) {
              let got = false
              const probe = diag.subscribe(() => {
                got = true
              })
              try {
                await diag.writeTo(target, frame)
              } catch {
                probe()
                continue
              }
              await sleep(wait)
              probe()
              if (got) {
                hit = { sync2, preKey2Fw, gen, authOffset, channel: target.uuid }
                hooks.onLog(`✓ TREFFER: ${label} auf ${target.uuid.slice(0, 8)}`)
                break outer
              }
            }
            hooks.onLog(`· ${label} — still`)
          }
        }
      }
    }
  } finally {
    rawUnsub()
  }
  return { hit }
}

/**
 * Der robuste ZT3-Knacker: erzwingt EINE gültige PRE-Antwort, bestimmt die echte
 * Krypto-Variante durch ENTSCHLÜSSELN der Antwort (nicht per Timing) und fährt mit
 * genau dieser Antwort direkt SET_PWD → AUTH weiter (kein zweites PRE_COMM).
 */
export async function crackHandshake(
  diag: BleDiag,
  btName: Uint8Array,
  hooks: HandshakeHooks,
  knownPassword?: Uint8Array,
  derestrictKmh?: number,
): Promise<HandshakeOutcome> {
  const now = hooks.now ?? (() => Date.now())
  if (diag.writeChars.length === 0) return { ok: false, message: 'Keine Schreib-Kanäle am Gerät.' }

  const ch = new FrameChannel(diagAsTransport(diag, diag.writeChars[0].uuid), { header: [0x5a, -1], trailerLen: 10 })
  const rawTap = diag.subscribe((chunk) => hooks.onRecvRaw?.(chunk))

  const combos: { k: boolean; g: Gen }[] = [
    { k: true, g: 'gen2' },
    { k: true, g: 'gen3' },
    { k: false, g: 'gen2' },
    { k: false, g: 'gen3' },
  ]

  const writeAll = async (frame: Uint8Array): Promise<void> => {
    for (const t of diag.writeChars) {
      try {
        await diag.writeTo(t, frame)
      } catch {
        // Kanal überspringen
      }
    }
  }

  try {
    // Phase A: die richtige Krypto-Variante finden (per Entschlüsselung, nicht Timing).
    hooks.onProgress({ step: 'pre', status: 'Öffne Kanal (PRE_COMM) …' })
    let session: HandshakeSession | null = null
    for (const combo of combos) {
      const probe = new HandshakeSession(btName, { sync2: 0xa5, gen: combo.g, authOffset: 0, preKey2Fw: combo.k })
      const frame = probe.preCommFrame()
      hooks.onSent?.(frame)
      await writeAll(frame)
      let resp: Uint8Array
      try {
        resp = await ch.next(2500)
      } catch {
        continue
      }
      hooks.onRecvRaw?.(resp)
      // Variante bestimmen, die die Antwort entschlüsselt — und GENAU diese Sitzung
      // (mit frischer Challenge) direkt weiterverwenden. Kein zweites PRE_COMM!
      for (const test of combos) {
        const s = new HandshakeSession(btName, { sync2: 0xa5, gen: test.g, authOffset: 0, preKey2Fw: test.k })
        try {
          const pr = s.handlePreResp(resp)
          session = s
          hooks.onProgress({
            step: 'pre',
            status: `Kanal offen! Serial ${toAscii(pr.serial)} · ${pr.paired ? 'GEKOPPELT (index != 0)' : 'FRISCH (index = 0)'}`,
            ok: true,
          })
          if (pr.paired && !knownPassword) {
            return {
              ok: false,
              paired: true,
              serialAscii: toAscii(pr.serial),
              message:
                'Kanal offen — aber der Roller ist GEKOPPELT (index != 0) und du hast KEIN vorhandenes Passwort eingetragen. Entweder das Passwort aus dem Handy-Backup unten eintragen, oder den Roller entkoppeln/zurücksetzen (Segway-App / Unlock-Kabel).',
            }
          }
          break
        } catch {
          // Variante passt nicht zur Antwort
        }
      }
      if (session) break
    }
    if (!session) {
      return { ok: false, message: 'Keine gültige Antwort — Roller reagiert nicht. An? In Reichweite? Sonst neu starten und nochmal.' }
    }

    // Phase C: Anmelden. Mit BEKANNTEM Schlüssel → direkt zu AUTH (kein SET_PWD).
    if (knownPassword) {
      session.usePassword(knownPassword)
      hooks.onProgress({ step: 'setpwd', status: 'Melde mit vorhandenem Schlüssel an (SET_PWD übersprungen) …', ok: true })
    } else {
      hooks.onWaitForButton?.()
      hooks.onProgress({
        step: 'setpwd',
        status: 'Setze eigenen Schlüssel — falls nötig KURZ die Ein/Aus-Taste antippen (nicht halten) …',
      })
      const setFrame = session.setPwdFrame(now())
      let accepted = false
      const deadline = now() + 30000
      while (now() < deadline && !accepted) {
        hooks.onSent?.(setFrame)
        await writeAll(setFrame)
        try {
          const set = session.handleSetPwdResp(await ch.next(3000))
          if (set.accepted) accepted = true
        } catch {
          // keine Antwort — nochmal senden
        }
      }
      if (!accepted) {
        return {
          ok: false,
          message: 'Der Roller war FRISCH, hat aber nicht bestätigt. Roller neu starten und nochmal „ZT3 knacken".',
        }
      }
      hooks.onProgress({ step: 'setpwd', status: 'Sitzungsschlüssel gesetzt!', ok: true })
    }

    // Phase D: AUTH — aus dem ECHTEN Segway-Mitschnitt (S26 btsnoop) byte-genau bekannt:
    //   abgeleiteter Schlüssel, Nonce-Offset 0, Board BLE, sync2 A5, Daten = Serial,
    //   Zähler 2 (Reconnect) bzw. 3 (nach SET_PWD).  KEIN Raten mehr.
    // Der Mitschnitt zeigte außerdem: der ERSTE Versuch scheitert oft (Challenge veraltet)
    // — die offizielle App macht dann einfach PRE+AUTH neu. Genau das machen wir hier:
    // mehrfach, jedes Mal mit FRISCHER Challenge.
    hooks.onProgress({ step: 'auth', status: 'Schalte frei (AUTH) …' })
    const preWaitMs = hooks.timeoutMs ?? 2000
    const respWaitMs = hooks.timeoutMs ?? 4000 // dem Roller GENUG Zeit lassen (Antwort ~2 s Latenz!)
    const authCounter = knownPassword ? 2 : 3
    let auth: { success: boolean; index: number } | null = null

    // Globaler Wächter: fängt JEDE verschlüsselte SN-Antwort (Zähler > 0) des Rollers —
    // egal wann sie kommt. Ihre bloße Existenz beweist: der Roller hat unser AUTH
    // akzeptiert (er verschlüsselt nur, wenn unser MAC stimmte; im echten Mitschnitt
    // byte-genau bestätigt). Reste von PRE-Antworten (Zähler 0) zählen NICHT.
    let sawSn = false
    let lastSn: Uint8Array | null = null
    const snRe = new FrameReassembler({ header: [0x5a, -1], trailerLen: 10 })
    const snWatch = diag.subscribe((chunk) => {
      for (const f of snRe.push(chunk)) {
        if (((f[f.length - 2] << 8) | f[f.length - 1]) !== 0) {
          sawSn = true
          lastSn = f
        }
      }
    })
    const attempts = knownPassword ? 6 : 2

    for (let tryNo = 0; tryNo < attempts && !sawSn; tryNo++) {
      // Ab dem 2. Versuch (nur Reconnect) eine FRISCHE Challenge holen — neues PRE.
      if (tryNo > 0 && knownPassword) {
        const pf = session.preCommFrame()
        hooks.onSent?.(pf)
        await writeAll(pf)
        try {
          const pr = await ch.next(preWaitMs)
          hooks.onRecvRaw?.(pr)
          session.handlePreResp(pr)
          session.usePassword(knownPassword)
        } catch {
          continue // kein frisches PRE — nächster Versuch
        }
      }
      const frame = session.buildAuthFrame({
        counter: authCounter,
        authOffset: 0,
        sync2: 0xa5,
        keyMode: 'derived',
        target: BOARD.BLE,
      })
      hooks.onSent?.(frame)
      await writeAll(frame)
      // GEDULDIG auf die Antwort warten — KEINE PREs dazwischen (die setzen die gerade
      // etablierte Sitzung zurück; genau das hat den echten Versuch vermasselt).
      const deadline = now() + respWaitMs
      while (now() < deadline && !sawSn) await sleep(100)
    }
    snWatch()

    if (sawSn && lastSn) {
      // Antwort da → AUTH akzeptiert. Falls dekodierbar (Sim), Index lesen; sonst roh.
      try {
        auth = session.readAuthResp(lastSn, 0, 'derived')
      } catch {
        auth = { success: true, index: -1 } // device→app noch nicht lesbar, aber akzeptiert
      }
    }
    if (!auth) {
      return {
        ok: false,
        message:
          'AUTH: keine verschlüsselte Antwort nach mehreren Versuchen. Meist ist das gespeicherte Passwort veraltet — Roller in der Segway-App einmal entkoppeln, dann neu koppeln, und nochmal.',
      }
    }
    if (!auth.success) return { ok: false, message: `Freischaltung abgelehnt (AUTH index=${auth.index}).` }
    hooks.onProgress({ step: 'done', status: 'AUTH akzeptiert — verschlüsselter Kanal steht!', ok: true })

    // ENTDROSSELN: ALLE Geschwindigkeits-Grenzen hochsetzen (effektiv = min(alle)).
    // Der ZT3 kappt v.a. am MCU (0x20/GearTopSpeed 0x31) — nicht am Display (0x93).
    // WRITE ohne Antwort → jeden Wert 2× senden, Zähler laufend hochzählen.
    if (derestrictKmh && derestrictKmh > 0) {
      hooks.onProgress({ step: 'done', status: `Setze alle Speed-Grenzen auf ${derestrictKmh} km/h …` })
      const targets = [
        { board: BOARD.ESC, reg: REG.GEAR_TOP_SPEED, name: 'MCU GearTopSpeed' },
        { board: BOARD.ESC, reg: REG.SPEED_SAFE_LOCK, name: 'MCU SpeedSafeLock' },
        { board: BOARD.DISPLAY, reg: REG.LIMIT_SPEED, name: 'Display LimitSpeed' },
      ]
      let writeCounter = authCounter + 1 // erster SN-Frame nach dem AUTH
      for (let round = 0; round < 2; round++) {
        for (const t of targets) {
          const wf = session.buildRegWrite(t.board, t.reg, derestrictKmh, writeCounter, 0xa5)
          hooks.onSent?.(wf)
          await writeAll(wf)
          hooks.onProgress({ step: 'done', status: `→ ${t.name} (Board 0x${t.board.toString(16)}, Reg 0x${t.reg.toString(16)}) = ${derestrictKmh}` })
          writeCounter += 1
          await sleep(180)
        }
      }
      hooks.onProgress({ step: 'done', status: `Alle Grenzen auf ${derestrictKmh} km/h geschrieben.`, ok: true })
      return {
        ok: true,
        message: `🔓🛴 Kanal offen UND alle Speed-Grenzen (MCU GearTopSpeed 0x31, SafeLock 0x53, Display 0x93) auf ${derestrictKmh} km/h gesetzt! Effektiv gilt min(Motorlimit, ${derestrictKmh}). Jetzt kurz auf PRIVATEM Gelände testen — geht er über 25?`,
        serialAscii: toAscii(session.getSerial()),
      }
    }

    return {
      ok: true,
      message:
        auth.index === -1
          ? 'AUTH akzeptiert — der Roller antwortet verschlüsselt, der Kanal steht! 🔓 (Antwort-Telemetrie noch roh; Speed setzen geht trotzdem — Wert oben eintragen.)'
          : 'Handshake erfolgreich — der Roller ist offen! 🔓',
      serialAscii: toAscii(session.getSerial()),
    }
  } finally {
    rawTap()
    ch.close()
  }
}

/** Macht aus einer Diagnose-Verbindung + festem Schreib-Kanal einen Transport. */
export function diagAsTransport(diag: BleDiag, writeUuid: string): Transport {
  const target = diag.writeChars.find((w) => w.uuid === writeUuid) ?? diag.writeChars[0]
  return {
    name: diag.name,
    connected: true,
    send: (data) => diag.writeTo(target, data),
    subscribe: (h) => diag.subscribe((chunk) => h(chunk)),
    disconnect: () => diag.disconnect(),
  }
}
