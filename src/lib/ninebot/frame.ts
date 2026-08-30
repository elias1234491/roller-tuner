import { concatBytes } from '../bytes'

// Ninebot-Klartextrahmen (das, was VOR der Enc2-Verschlüsselung steht).

export const BT_ID = 0x3e
// Board-Adressen (Ghidra-bestätigt, NootNooot nb_protocol.py):
// DISPLAY 0x01, BLE 0x04 (Handshake-Ziel), VCU 0x09, ESC/Hauptcontroller 0x20, BMS 0x22/0x23.
export const BOARD = { DISPLAY: 0x01, MCU: 0x02, BLE: 0x04, VCU_GEN2: 0x09, ESC: 0x20 } as const
export const CMD = { PRE_COMM: 0x5b, SET_PWD: 0x5c, AUTH: 0x5d, READ: 0x01, WRITE: 0x03 } as const
export const SYNC2 = { GEN2: 0xa5, GEN3: 0xb5 } as const

// Register (index-Byte) für die Geschwindigkeits-Grenzen. Wert je = km/h als 16-Bit
// little-endian. Effektive Höchstgeschwindigkeit = min(ALLER dieser Grenzen), deshalb
// setzen wir beim Entdrosseln alle hoch.
//   LIMIT_SPEED   Display-Board 0x01, nutzerseitiges Limit
//   GEAR_TOP_SPEED ESC/MCU 0x20, Höchstwert je Fahrstufe (15–140) — Haupt-Hebel am ZT3
//   SPEED_SAFE_LOCK ESC/MCU 0x20, MCU-interner Cap
export const REG = { LIMIT_SPEED: 0x93, GEAR_TOP_SPEED: 0x31, SPEED_SAFE_LOCK: 0x53 } as const

/** App->Gerät: [0x5A, sync2, LEN, 0x3E, target, cmd, index, ...data]  (LEN = data.length). */
export function buildRequest(
  sync2: number,
  target: number,
  cmd: number,
  index: number,
  data: Uint8Array = new Uint8Array(0),
): Uint8Array {
  return concatBytes([0x5a, sync2, data.length, BT_ID, target, cmd, index], data)
}

/** Gerät->App: [0x5A, sync2, LEN, source, 0x3E, cmd, index, ...data] (Spiegel von buildRequest). */
export function buildResponse(
  sync2: number,
  source: number,
  cmd: number,
  index: number,
  data: Uint8Array = new Uint8Array(0),
): Uint8Array {
  return concatBytes([0x5a, sync2, data.length, source, BT_ID, cmd, index], data)
}

export interface ParsedRequest {
  sync2: number
  target: number
  cmd: number
  index: number
  data: Uint8Array
}

/** App->Gerät zerlegen: [0x5A, sync2, LEN, 0x3E, target, cmd, index, ...data]. */
export function parseRequest(plaintext: Uint8Array): ParsedRequest {
  const len = plaintext[2]
  return {
    sync2: plaintext[1],
    target: plaintext[4],
    cmd: plaintext[5],
    index: plaintext[6],
    data: plaintext.subarray(7, 7 + len),
  }
}

export interface ParsedFrame {
  sync2: number
  source: number
  cmd: number
  index: number
  data: Uint8Array
}

/** Gerät->App: [0x5A, sync2, LEN, source, 0x3E, cmd, index, ...data]. */
export function parseResponse(plaintext: Uint8Array): ParsedFrame {
  const len = plaintext[2]
  return {
    sync2: plaintext[1],
    source: plaintext[3],
    cmd: plaintext[5],
    index: plaintext[6],
    data: plaintext.subarray(7, 7 + len),
  }
}
