import { FrameReassembler } from '../framing'
import type { FrameFormat } from '../framing'
import type { BleDiag, Transport } from '../ble'
import { toHex } from '../bytes'
import type { Gen } from '../crypto/nbcrypto'
import { HandshakeSession } from './handshake'
import type { HandshakeConfig } from './handshake'

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

    // Phase D: AUTH. Nonce-Offset (0/8) + Zähler sind für SN-Frames unbelegt → durchprobieren.
    hooks.onProgress({ step: 'auth', status: 'Schalte frei (AUTH) …' })
    let auth: { success: boolean; index: number } | null = null
    // [sync2, counter, nonce-offset] — die SN-Unbekannten durchprobieren.
    const authTries: [number, number, number][] = [
      [0xb5, 2, 0],
      [0xb5, 2, 8],
      [0xa5, 2, 0],
      [0xa5, 2, 8],
      [0xb5, 3, 0],
      [0xb5, 3, 8],
      [0xa5, 3, 0],
      [0xa5, 3, 8],
    ]
    for (const [sy, c, o] of authTries) {
      const frame = session.buildAuthFrame(c, o, sy)
      hooks.onSent?.(frame)
      await writeAll(frame)
      let resp: Uint8Array
      try {
        resp = await ch.next(2500)
      } catch {
        continue
      }
      hooks.onRecvRaw?.(resp)
      for (const testO of [0, 8]) {
        try {
          auth = session.readAuthResp(resp, testO)
          break
        } catch {
          // falscher Offset — nächster
        }
      }
      if (auth) break
    }
    if (!auth) {
      return { ok: false, message: 'AUTH: keine passende Antwort. Der ZT3 nutzt evtl. andere Zähler/Nonce — nochmal versuchen.' }
    }
    if (!auth.success) return { ok: false, message: `Freischaltung abgelehnt (AUTH index=${auth.index}).` }
    hooks.onProgress({ step: 'done', status: 'Freigeschaltet — verschlüsselter Kanal steht!', ok: true })
    return {
      ok: true,
      message: 'Handshake erfolgreich — der Roller ist offen! 🔓',
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
