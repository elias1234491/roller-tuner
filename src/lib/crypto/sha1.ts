// SHA-1 (nur für die Ninebot-Schlüsselableitung nötig, nicht als Sicherheits-
// Hash). Reines TypeScript, gegen die üblichen Testvektoren geprüft.

export function sha1(msg: Uint8Array): Uint8Array {
  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const ml = msg.length * 8
  const totalLen = (((msg.length + 8) >> 6) + 1) << 6 // Vielfaches von 64
  const bytes = new Uint8Array(totalLen)
  bytes.set(msg)
  bytes[msg.length] = 0x80
  const dv = new DataView(bytes.buffer)
  dv.setUint32(totalLen - 4, ml >>> 0, false)
  dv.setUint32(totalLen - 8, Math.floor(ml / 0x100000000), false)

  const w = new Uint32Array(80)
  for (let off = 0; off < totalLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false)
    for (let i = 16; i < 80; i++) {
      const v = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]
      w[i] = (v << 1) | (v >>> 31)
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i++) {
      let f: number
      let k: number
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = t
    }
    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }

  const out = new Uint8Array(20)
  const odv = new DataView(out.buffer)
  odv.setUint32(0, h0 >>> 0, false)
  odv.setUint32(4, h1 >>> 0, false)
  odv.setUint32(8, h2 >>> 0, false)
  odv.setUint32(12, h3 >>> 0, false)
  odv.setUint32(16, h4 >>> 0, false)
  return out
}
