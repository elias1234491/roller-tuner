// Virtueller ZT3 Pro — ein Roller-Emulator, der Enc2 wie das echte Gerät spricht.
//
// WOZU: Unsere Krypto ist byte-genau geprüft (KATs), aber der *Ablauf* drumherum
// (Zähler, welcher Schlüssel je Schritt, wie die AUTH-Antwort erwartet wird) war
// nie end-to-end gegengeprüft. Der Simulator baut die GERÄTESEITE laut Referenz
// nach und lässt unseren echten Client (runHandshake / crackHandshake) komplett
// durchlaufen — inklusive Rahmen-Zusammenbau über 20-Byte-BLE-Häppchen.
//
// EHRLICHE GRENZE: Der Sim kann nur nachbilden, was wir am Protokoll KENNEN. Die
// 3 gerätefacing Unbekannten (Antwort-Zähler-Disziplin, ob die Challenge sofort
// verfällt, eine evtl. Firmware-Eigenheit des echten ZT3) kann er nicht erfinden.
// Läuft der Handshake hier grün, ist unser Client protokollkorrekt; bleibt der
// ECHTE Roller danach trotzdem stumm, ist es zu 100 % eine Firmware-Eigenheit
// → dann brauchen wir den Bluetooth-Mitschnitt. Beides ist Fortschritt.
//
// WICHTIG (Anti-Spiegel): Der Sim verifiziert JEDE eingehende Prüfsumme/MAC und
// bleibt bei falscher Krypto oder falschem AUTH STUMM — genau wie der echte ZT3.
// Er antwortet nicht einfach, was der Client hören will.

import { FrameReassembler } from '../framing'
import type { Transport } from '../ble'
import type { BleDiag, WriteTarget } from '../ble'
import { FW_DATA, decryptFrame, deriveKey, encryptFrame } from '../crypto/nbcrypto'
import type { Gen } from '../crypto/nbcrypto'
import type { AuthKeyMode } from './handshake'
import { BOARD, CMD, buildResponse, parseRequest } from './frame'
import type { ParsedRequest } from './frame'
import { concatBytes, toHex } from '../bytes'

export interface SimConfig {
  /** Gerätename (wie im BLE-Advertising) — Grundlage des PRE_COMM-Schlüssels. */
  btName: string
  /** 14-stellige Seriennummer, die der Roller in der PRE-Antwort mitschickt. */
  serial: string
  /** Feste 16-Byte-Challenge (deterministisch für Tests). */
  challenge: Uint8Array
  sync2: number
  gen: Gen
  /** FW_DATA als 2. Schlüsselteil in der PRE-Ableitung (der echte ZT3 braucht das). */
  preKey2Fw: boolean
  authOffset: number
  /** Schon mit einem Handy gekoppelt? Dann PRE-index != 0 und AUTH ohne SET_PWD. */
  paired: boolean
  /** Bei `paired`: das gespeicherte Sitzungspasswort (für den Reconnect). */
  storedPassword?: Uint8Array

  // ---- Hypothesen-Schalter: was der ECHTE ZT3 bei AUTH heimlich verlangen könnte.
  //      Passt der Client nicht, bleibt der Sim STUMM — genau wie das echte Gerät. ----
  /** Welchen AUTH-Schlüssel der Roller erwartet (unsere Annahme: 'derived'). */
  authKeyMode?: AuthKeyMode
  /** Welches Ziel-Board der Roller im AUTH-Rahmen erwartet (Standard: BLE 0x04). */
  authTarget?: number
  /** Exakt geforderter AUTH-Zähler (null = beliebig). Fresh üblich 3, Reconnect 2. */
  requireAuthCounter?: number | null
  /** Die ersten N AUTH-Versuche stumm ignorieren (wie „Verbindung A" im Mitschnitt:
   *  Challenge veraltet, App muss PRE+AUTH neu machen). Testet den Neuversuch. */
  failFirstAuth?: number
}

const DEFAULT_CHALLENGE = Uint8Array.from([
  0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x07, 0x18, 0x29, 0x3a, 0x4b, 0x5c, 0x6d, 0x7e, 0x8f, 0x90,
])

export function makeSimConfig(over: Partial<SimConfig> = {}): SimConfig {
  return {
    btName: 'NBZT300000000',
    serial: '1K1DA2551P2788',
    challenge: DEFAULT_CHALLENGE,
    sync2: 0xa5,
    gen: 'gen2',
    preKey2Fw: true,
    authOffset: 0,
    paired: false,
    authKeyMode: 'derived',
    authTarget: 0x04, // BOARD.BLE
    requireAuthCounter: null,
    ...over,
  }
}

interface SimEvent {
  dir: '←' | '→' | '·'
  text: string
}

export class ScooterSim {
  readonly cfg: SimConfig
  readonly log: SimEvent[] = []
  private readonly name: Uint8Array
  private readonly serialBytes: Uint8Array
  private password: Uint8Array | null
  private opened = false // PRE_COMM gesehen -> ab jetzt SN-Modus erwartet
  private authTries = 0 // wie oft AUTH schon versucht wurde (für failFirstAuth)

  constructor(cfg: Partial<SimConfig> = {}) {
    this.cfg = makeSimConfig(cfg)
    this.name = new TextEncoder().encode(this.cfg.btName)
    this.serialBytes = new TextEncoder().encode(this.cfg.serial.padEnd(14, '\0')).slice(0, 14)
    this.password = this.cfg.storedPassword ? this.cfg.storedPassword.slice() : null
  }

  private preKey(): Uint8Array {
    return deriveKey(this.name, this.cfg.preKey2Fw ? FW_DATA : null)
  }

  private note(dir: SimEvent['dir'], text: string): void {
    this.log.push({ dir, text })
  }

  /** Kernstück: einen kompletten (verschlüsselten) Anfrage-Rahmen verarbeiten.
   *  Rückgabe = Antwort-Wire, oder null = der echte Roller bliebe hier STUMM. */
  handleFrame(wire: Uint8Array): Uint8Array | null {
    this.note('←', toHex(wire))
    // Zähler aus dem Anhang lesen: 0 = non-SN (PRE), >0 = SN.
    const counter = (wire[wire.length - 2] << 8) | wire[wire.length - 1]

    if (counter === 0) return this.handlePre(wire)
    return this.handleSn(wire, counter)
  }

  private handlePre(wire: Uint8Array): Uint8Array | null {
    const { plaintext, rc } = decryptFrame(this.preKey(), wire, { gen: this.cfg.gen })
    if (rc !== 0) {
      this.note('·', 'PRE: Prüfsumme falsch (falscher Dialekt/Schlüssel) — STUMM')
      return null
    }
    const f = parseRequest(plaintext)
    if (f.cmd !== CMD.PRE_COMM) {
      this.note('·', `PRE-Kanal, aber cmd=0x${f.cmd.toString(16)} — STUMM`)
      return null
    }
    this.opened = true
    const index = this.cfg.paired ? 0x01 : 0x00
    const data = concatBytes(this.cfg.challenge, this.serialBytes)
    const pt = buildResponse(this.cfg.sync2, BOARD.BLE, CMD.PRE_COMM, index, data)
    const resp = encryptFrame(this.preKey(), pt, { counter: 0, gen: this.cfg.gen })
    this.note('→', `PRE-Antwort (${this.cfg.paired ? 'gekoppelt' : 'frisch'})`)
    return resp
  }

  /** Der Schlüssel, mit dem der Roller (laut Hypothese) AUTH entschlüsselt. */
  private authKey(): Uint8Array {
    const auth = this.cfg.challenge
    const pw = this.password!
    if (this.cfg.authKeyMode === 'direct') return pw.slice(0, 16)
    if (this.cfg.authKeyMode === 'swapped') return deriveKey(auth, pw)
    return deriveKey(pw, auth)
  }

  private handleSn(wire: Uint8Array, counter: number): Uint8Array | null {
    if (!this.opened) {
      this.note('·', 'SN-Rahmen ohne vorheriges PRE — STUMM')
      return null
    }
    const auth = this.cfg.challenge
    const off = this.cfg.authOffset

    // Erst als SET_PWD deuten (Schlüssel aus Name+Challenge), sonst als AUTH
    // (Schlüssel je nach Hypothese). Passt keiner -> STUMM.
    const setKey = deriveKey(this.name, auth)
    const set = decryptFrame(setKey, wire, { auth, authOffset: off })
    if (set.rc === 0) {
      const f = parseRequest(set.plaintext)
      if (f.cmd === CMD.SET_PWD) return this.onSetPwd(f, counter)
    }

    if (this.password) {
      const a = decryptFrame(this.authKey(), wire, { auth, authOffset: off })
      if (a.rc === 0) {
        const f = parseRequest(a.plaintext)
        if (f.cmd === CMD.AUTH) return this.onAuth(f, counter)
      }
    }

    this.note('·', 'SN-Rahmen: kein Schlüssel entschlüsselt (MAC falsch) — STUMM')
    return null
  }

  private onSetPwd(req: ParsedRequest, counter: number): Uint8Array | null {
    this.password = req.data.slice(0, 16)
    const auth = this.cfg.challenge
    const key = deriveKey(this.name, auth)
    const pt = buildResponse(this.cfg.sync2, BOARD.BLE, CMD.SET_PWD, 0x01)
    const resp = encryptFrame(key, pt, { counter, auth, authOffset: this.cfg.authOffset })
    this.note('→', 'SET_PWD bestätigt (Schlüssel gespeichert)')
    return resp
  }

  private onAuth(req: ParsedRequest, counter: number): Uint8Array | null {
    this.authTries += 1
    if (this.cfg.failFirstAuth && this.authTries <= this.cfg.failFirstAuth) {
      this.note('·', `AUTH-Versuch ${this.authTries} absichtlich ignoriert (wie Verbindung A) — STUMM`)
      return null
    }
    if (req.target !== this.cfg.authTarget) {
      this.note('·', `AUTH an Board 0x${req.target.toString(16)} (erwartet 0x${this.cfg.authTarget!.toString(16)}) — STUMM`)
      return null
    }
    if (this.cfg.requireAuthCounter != null && counter !== this.cfg.requireAuthCounter) {
      this.note('·', `AUTH mit Zähler ${counter} (erwartet ${this.cfg.requireAuthCounter}) — STUMM`)
      return null
    }
    if (toHex(req.data.slice(0, 14)) !== toHex(this.serialBytes)) {
      this.note('·', 'AUTH: Serial passt nicht — STUMM')
      return null
    }
    const auth = this.cfg.challenge
    const pt = buildResponse(this.cfg.sync2, BOARD.BLE, CMD.AUTH, 0x01) // index 1 = frei
    const resp = encryptFrame(this.authKey(), pt, { counter, auth, authOffset: this.cfg.authOffset })
    this.note('→', 'AUTH bestätigt — FREIGESCHALTET 🔓')
    return resp
  }

  // ---- Anbindung an unseren Client: als Transport bzw. BleDiag ----

  /** Ein Transport, den runHandshake direkt fahren kann. */
  asTransport(): Transport {
    const handlers = new Set<(chunk: Uint8Array) => void>()
    const re = new FrameReassembler({ header: [0x5a, -1], trailerLen: 10 })
    let connected = true

    const deliver = (wire: Uint8Array): void => {
      // In 20-Byte-BLE-Häppchen ausliefern — testet den Reassembler des Clients.
      for (let i = 0; i < wire.length; i += 20) {
        const chunk = wire.slice(i, i + 20)
        setTimeout(() => {
          for (const h of handlers) h(chunk)
        }, 0)
      }
    }

    return {
      name: this.cfg.btName,
      get connected() {
        return connected
      },
      send: (data) => {
        for (const frame of re.push(data)) {
          const resp = this.handleFrame(frame)
          if (resp) deliver(resp)
        }
        return Promise.resolve()
      },
      subscribe: (handler) => {
        handlers.add(handler)
        return () => handlers.delete(handler)
      },
      disconnect: () => {
        connected = false
        handlers.clear()
      },
    }
  }

  /** Ein BleDiag mit EINEM Schreib-Kanal — damit crackHandshake laufen kann. */
  asDiag(): BleDiag {
    const handlers = new Set<(chunk: Uint8Array, fromUuid: string) => void>()
    const re = new FrameReassembler({ header: [0x5a, -1], trailerLen: 10 })
    const uuid = '6e400002-0000-0000-006e-696e65626f74'
    // crackHandshake nutzt nur target.uuid + writeTo — die ch bleibt ein Dummy.
    const target: WriteTarget = { uuid, ch: {} as unknown as BluetoothRemoteGATTCharacteristic }

    const deliver = (wire: Uint8Array): void => {
      for (let i = 0; i < wire.length; i += 20) {
        const chunk = wire.slice(i, i + 20)
        setTimeout(() => {
          for (const h of handlers) h(chunk, uuid)
        }, 0)
      }
    }

    return {
      name: this.cfg.btName,
      writeChars: [target],
      report: [`sim / ${uuid.slice(0, 8)} [wNR,notify] ✓sub`],
      subscribe: (handler) => {
        handlers.add(handler)
        return () => handlers.delete(handler)
      },
      writeTo: (_t, data) => {
        for (const frame of re.push(data)) {
          const resp = this.handleFrame(frame)
          if (resp) deliver(resp)
        }
        return Promise.resolve()
      },
      disconnect: () => handlers.clear(),
    }
  }
}
