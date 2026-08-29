import { encryptBlockExpanded, expandKey } from './aes'
import { sha1 } from './sha1'
import { concatBytes } from '../bytes'

// Fester Protokoll-Parameter (kein Geheimnis) aus libnbcrypto.so @ 0x45A80.
// Dient bei Gen2 als ECB-Eingabeblock für den non-SN-Keystream.
export const FW_DATA = Uint8Array.from([
  0x97, 0xcf, 0xb8, 0x02, 0x84, 0x41, 0x43, 0xde,
  0x56, 0x00, 0x2b, 0x3b, 0x34, 0x78, 0x0a, 0x5d,
])

function pad16(x?: Uint8Array | null): Uint8Array {
  const out = new Uint8Array(16)
  if (x) out.set(x.subarray(0, 16))
  return out
}

/**
 * Schlüsselableitung für Ninebot Enc2:
 *   aes_key = SHA1( pad16(key1) || pad16(key2) )[0..15]
 * key1/key2 werden rechts mit 0x00 auf 16 Byte gepolstert (oder abgeschnitten);
 * key2 = null/leer -> 16 Nullbytes.
 */
export function deriveKey(key1: Uint8Array, key2?: Uint8Array | null): Uint8Array {
  const buf = new Uint8Array(32)
  buf.set(pad16(key1), 0)
  buf.set(pad16(key2), 16)
  return sha1(buf).slice(0, 16)
}

export type Gen = 'gen2' | 'gen3'

export interface Enc2Opts {
  /** Sitzungszähler. 0 = non-SN (Handshake-Start), >0 = SN (voller CCM-Pfad). */
  counter: number
  /** 16-Byte-Challenge aus der PRE_COMM-Antwort (im SN-Modus nötig). */
  auth?: Uint8Array
  /** non-SN-Keystream-Eingang: gen2 = FW_DATA, gen3 = Nullblock. */
  gen?: Gen
  /** Welche 8 Bytes der Challenge in die Nonce gehen (Standard: die ersten 8). */
  authOffset?: number
}

function ecbInputFor(gen?: Gen): Uint8Array {
  return gen === 'gen2' ? FW_DATA : new Uint8Array(16)
}

function nonce13(counter: number, auth: Uint8Array, offset: number): Uint8Array {
  const n = new Uint8Array(13)
  n[0] = (counter >>> 24) & 0xff
  n[1] = (counter >>> 16) & 0xff
  n[2] = (counter >>> 8) & 0xff
  n[3] = counter & 0xff
  n.set(auth.subarray(offset, offset + 8), 4)
  return n // n[12] bleibt 0x00
}

function blockA(nonce: Uint8Array, i: number): Uint8Array {
  const b = new Uint8Array(16)
  b[0] = 0x01
  b.set(nonce, 1)
  b[15] = i & 0xff
  return b
}

function blockB0(nonce: Uint8Array, payloadLen: number): Uint8Array {
  const b = new Uint8Array(16)
  b[0] = 0x59
  b.set(nonce, 1)
  b[15] = payloadLen & 0xff
  return b
}

function xor16(a: Uint8Array, b: Uint8Array): Uint8Array {
  const o = new Uint8Array(16)
  for (let i = 0; i < 16; i++) o[i] = a[i] ^ b[i]
  return o
}

function ctrXor(rk: Uint8Array, data: Uint8Array, nonce: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length)
  let ctr = 1
  for (let off = 0; off < data.length; off += 16) {
    const ks = encryptBlockExpanded(rk, blockA(nonce, ctr))
    for (let j = 0; j < 16 && off + j < data.length; j++) out[off + j] = data[off + j] ^ ks[j]
    ctr++
  }
  return out
}

function cbcMac(rk: Uint8Array, plaintext: Uint8Array, nonce: Uint8Array): Uint8Array {
  const payloadLen = plaintext.length - 3
  let x = encryptBlockExpanded(rk, blockB0(nonce, payloadLen))
  const aad = new Uint8Array(16)
  aad.set(plaintext.subarray(0, 3), 0) // die 3 Kopf-Bytes als "associated data"
  x = encryptBlockExpanded(rk, xor16(x, aad))
  const payload = plaintext.subarray(3)
  for (let off = 0; off < payload.length; off += 16) {
    const block = new Uint8Array(16)
    block.set(payload.subarray(off, off + 16), 0) // letzter Block mit 0x00 gepolstert
    x = encryptBlockExpanded(rk, xor16(x, block))
  }
  return x.slice(0, 4)
}

/** Klartext-Rahmen [5A, sync2, LEN, …] verschlüsseln -> Wire-Bytes (Länge = pt+6). */
export function encryptFrame(key: Uint8Array, plaintext: Uint8Array, opts: Enc2Opts): Uint8Array {
  const rk = expandKey(key)
  const header = plaintext.subarray(0, 3)
  const payload = plaintext.subarray(3)

  if (opts.counter === 0) {
    // non-SN: ein 16-B-Keystream, über alle Blöcke wiederholt + Prüfsumme.
    const ks = encryptBlockExpanded(rk, ecbInputFor(opts.gen))
    const ct = new Uint8Array(payload.length)
    let sum = 0
    for (let i = 0; i < payload.length; i++) {
      ct[i] = payload[i] ^ ks[i % 16]
      sum += payload[i]
    }
    const csum = ~sum & 0xffff
    const tail = Uint8Array.from([0x00, 0x00, csum & 0xff, (csum >> 8) & 0xff, 0x00, 0x00])
    return concatBytes(header, ct, tail)
  }

  // SN: CTR-Chiffre + CBC-MAC-Tag + angehängter Zähler.
  const auth = opts.auth ?? new Uint8Array(16)
  const nonce = nonce13(opts.counter, auth, opts.authOffset ?? 0)
  const rawTag = cbcMac(rk, plaintext, nonce)
  const ct = ctrXor(rk, payload, nonce)
  const a0 = encryptBlockExpanded(rk, blockA(nonce, 0))
  const encTag = new Uint8Array(4)
  for (let i = 0; i < 4; i++) encTag[i] = rawTag[i] ^ a0[i]
  const ctr16 = Uint8Array.from([(opts.counter >> 8) & 0xff, opts.counter & 0xff])
  return concatBytes(header, ct, encTag, ctr16)
}

export interface DecryptResult {
  plaintext: Uint8Array
  /** 0 = ok, 1 = Prüfsumme/MAC falsch. */
  rc: number
  counter: number
}

/** Wire-Bytes entschlüsseln. Der Modus ergibt sich aus dem Zähler im Anhang. */
export function decryptFrame(
  key: Uint8Array,
  wire: Uint8Array,
  opts: { auth?: Uint8Array; gen?: Gen; authOffset?: number } = {},
): DecryptResult {
  const rk = expandKey(key)
  const header = wire.subarray(0, 3)
  const tail = wire.subarray(wire.length - 6)
  const counter = (tail[4] << 8) | tail[5]

  if (counter === 0) {
    const ct = wire.subarray(3, wire.length - 6)
    const ks = encryptBlockExpanded(rk, ecbInputFor(opts.gen))
    const payload = new Uint8Array(ct.length)
    let sum = 0
    for (let i = 0; i < ct.length; i++) {
      payload[i] = ct[i] ^ ks[i % 16]
      sum += payload[i]
    }
    const csum = ~sum & 0xffff
    const rc = tail[2] === (csum & 0xff) && tail[3] === ((csum >> 8) & 0xff) ? 0 : 1
    return { plaintext: concatBytes(header, payload), rc, counter }
  }

  const auth = opts.auth ?? new Uint8Array(16)
  const nonce = nonce13(counter, auth, opts.authOffset ?? 0)
  const ct = wire.subarray(3, wire.length - 6)
  const encTag = wire.subarray(wire.length - 6, wire.length - 2)
  const payload = ctrXor(rk, ct, nonce)
  const plaintext = concatBytes(header, payload)
  const rawTag = cbcMac(rk, plaintext, nonce)
  const a0 = encryptBlockExpanded(rk, blockA(nonce, 0))
  let ok = true
  for (let i = 0; i < 4; i++) if (encTag[i] !== ((rawTag[i] ^ a0[i]) & 0xff)) ok = false
  return { plaintext, rc: ok ? 0 : 1, counter }
}
