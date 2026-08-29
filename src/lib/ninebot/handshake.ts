import { FW_DATA, deriveKey, decryptFrame, encryptFrame } from '../crypto/nbcrypto'
import type { Gen } from '../crypto/nbcrypto'
import { generatePassword } from '../crypto/javaRandom'
import { BOARD, CMD, buildRequest, parseResponse } from './frame'

// Dreistufiger Enc2-Handshake: PRE_COMM -> SET_PWD -> AUTH.
// Die 3 gerätefacing Unbekannten (sync2, gen, authOffset) sind KONFIGURIERBAR,
// weil kein Testvektor sie klären kann — sie kommen aus einem echten Mitschnitt.

export interface HandshakeConfig {
  sync2: number // 0xA5 (Gen2) oder 0xB5 (Gen3)
  gen: Gen // Keystream-Eingang für den non-SN-Start (gen2 = FW_DATA, gen3 = Null)
  authOffset: number // welche 8 Byte der Challenge in die Nonce gehen
  /** FW_DATA als 2. Schlüsselteil in die PRE_COMM-Ableitung (der ZT3 braucht das). */
  preKey2Fw?: boolean
}

export const DEFAULT_CONFIG: HandshakeConfig = { sync2: 0xb5, gen: 'gen3', authOffset: 0 }

export interface PreResult {
  paired: boolean // index != 0 -> Roller ist bereits gekoppelt
  index: number
  auth: Uint8Array
  serial: Uint8Array
}

export class HandshakeSession {
  private readonly cfg: HandshakeConfig
  private readonly btName: Uint8Array
  private counter = 0
  private auth: Uint8Array = new Uint8Array(16)
  private serial: Uint8Array = new Uint8Array(14)
  private password: Uint8Array = new Uint8Array(16)

  constructor(btName: Uint8Array, cfg: HandshakeConfig = DEFAULT_CONFIG) {
    this.btName = btName
    this.cfg = cfg
  }

  /** Schritt 1: Kanal öffnen (non-SN, Schlüssel aus dem Gerätenamen). */
  preCommFrame(): Uint8Array {
    this.counter = 0
    const key = deriveKey(this.btName, this.cfg.preKey2Fw ? FW_DATA : null)
    const pt = buildRequest(this.cfg.sync2, BOARD.BLE, CMD.PRE_COMM, 0x00)
    return encryptFrame(key, pt, { counter: 0, gen: this.cfg.gen })
  }

  /** Antwort auf Schritt 1: Challenge + Seriennummer merken; sagt, ob gekoppelt. */
  handlePreResp(wire: Uint8Array): PreResult {
    const key = deriveKey(this.btName, this.cfg.preKey2Fw ? FW_DATA : null)
    const { plaintext, rc } = decryptFrame(key, wire, { gen: this.cfg.gen })
    if (rc !== 0) throw new Error('PRE_COMM-Antwort: Prüfsumme falsch (falscher Dialekt/Schlüssel?)')
    const f = parseResponse(plaintext)
    this.auth = f.data.slice(0, 16)
    this.serial = f.data.slice(16, 30)
    this.counter = 1 // start_sn
    return { paired: f.index !== 0, index: f.index, auth: this.auth, serial: this.serial }
  }

  /**
   * Schritt 2: Sitzungspasswort setzen. Ohne `password` wird es wie die
   * offizielle App erzeugt (generatePassword). `timeMs` = System.currentTimeMillis.
   */
  setPwdFrame(timeMs: number, password?: Uint8Array): Uint8Array {
    this.password = password ?? generatePassword(this.auth, timeMs)
    this.counter += 1 // -> 2
    const key = deriveKey(this.btName, this.auth)
    const pt = buildRequest(this.cfg.sync2, BOARD.BLE, CMD.SET_PWD, 0x00, this.password)
    return encryptFrame(key, pt, { counter: this.counter, auth: this.auth, authOffset: this.cfg.authOffset })
  }

  handleSetPwdResp(wire: Uint8Array): { accepted: boolean; index: number } {
    const key = deriveKey(this.btName, this.auth)
    const { plaintext, rc } = decryptFrame(key, wire, { auth: this.auth, authOffset: this.cfg.authOffset })
    if (rc !== 0) throw new Error('SET_PWD-Antwort: MAC falsch')
    const f = parseResponse(plaintext)
    // index 0 = wartet auf Tastendruck am Roller; != 0 = angenommen.
    return { accepted: f.index !== 0, index: f.index }
  }

  /** Schritt 3: Freischalten mit der Seriennummer (Schlüssel aus dem Passwort). */
  authFrame(): Uint8Array {
    this.counter += 1 // -> 3
    const key = deriveKey(this.password, this.auth)
    const pt = buildRequest(this.cfg.sync2, BOARD.BLE, CMD.AUTH, 0x00, this.serial)
    return encryptFrame(key, pt, { counter: this.counter, auth: this.auth, authOffset: this.cfg.authOffset })
  }

  handleAuthResp(wire: Uint8Array): { success: boolean; index: number } {
    const key = deriveKey(this.password, this.auth)
    const { plaintext, rc } = decryptFrame(key, wire, { auth: this.auth, authOffset: this.cfg.authOffset })
    if (rc !== 0) throw new Error('AUTH-Antwort: MAC falsch')
    const f = parseResponse(plaintext)
    return { success: f.index === 1, index: f.index }
  }

  buildAuthFrame(counter: number, authOffset: number, sync2: number): Uint8Array {
    const key = deriveKey(this.password, this.auth)
    const pt = buildRequest(sync2, BOARD.BLE, CMD.AUTH, 0x00, this.serial)
    return encryptFrame(key, pt, { counter, auth: this.auth, authOffset })
  }

  readAuthResp(wire: Uint8Array, authOffset: number): { success: boolean; index: number } {
    const key = deriveKey(this.password, this.auth)
    const { plaintext, rc } = decryptFrame(key, wire, { auth: this.auth, authOffset })
    if (rc !== 0) throw new Error('AUTH-Antwort: MAC falsch')
    const f = parseResponse(plaintext)
    return { success: f.index === 1, index: f.index }
  }

  /** Ein bereits bekanntes Passwort setzen (Reconnect direkt per AUTH, ohne SET_PWD). */
  usePassword(pw: Uint8Array): void {
    this.password = pw
  }

  getPassword(): Uint8Array {
    return this.password
  }
  getSerial(): Uint8Array {
    return this.serial
  }
  getAuth(): Uint8Array {
    return this.auth
  }
}
