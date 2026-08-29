import { sha256 } from './sha256'

// Nachbau von java.util.Random — die offizielle Segway-App erzeugt das
// Sitzungspasswort damit. Wir brauchen es bitgenau, damit ein Reconnect mit
// bereits gespeichertem Passwort passt.

const MULT = 0x5deece66dn
const ADD = 0xbn
const MASK = (1n << 48n) - 1n

export class JavaRandom {
  private seed: bigint

  constructor(seed: bigint) {
    this.seed = (BigInt.asUintN(64, seed) ^ MULT) & MASK
  }

  private next(bits: number): number {
    this.seed = (this.seed * MULT + ADD) & MASK
    const r = this.seed >> BigInt(48 - bits)
    let v = Number(r & 0xffffffffn)
    if (v >= 0x80000000) v -= 0x100000000 // in vorzeichenbehafteten 32-Bit-Int
    return v
  }

  nextInt(): number {
    return this.next(32)
  }

  nextBytes(len: number): Uint8Array {
    const out = new Uint8Array(len)
    let i = 0
    while (i < len) {
      let rnd = this.nextInt()
      for (let n = Math.min(len - i, 4); n-- > 0; rnd >>= 8) {
        out[i++] = rnd & 0xff
      }
    }
    return out
  }
}

/**
 * generatePassword aus AbstractCryptoPwdProvider.java:
 *   j = Summe( signed(auth[i]) << ((i%8)*8) )  (Java-int/long-Arithmetik)
 *   seed = time_ms + j
 *   pwd = SHA256( JavaRandom(seed).nextBytes(16) )[0:16]
 */
export function generatePassword(auth: Uint8Array, timeMs: number | bigint): Uint8Array {
  let j = 0n
  for (let i = 0; i < auth.length; i++) {
    const b = auth[i]
    const sb = b < 128 ? b : b - 256
    // JS-Shift maskiert den Betrag auf 5 Bit — genau wie Java-int-Shift.
    const val = (sb << ((i % 8) * 8)) | 0
    j = BigInt.asIntN(64, j + BigInt(val))
  }
  const seed = BigInt.asIntN(64, BigInt(timeMs) + j)
  const rnd = new JavaRandom(seed).nextBytes(16)
  return sha256(rnd).slice(0, 16)
}
