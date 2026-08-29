// AES-128 (nur ECB-Blockverschlüsselung, das reicht für Ninebot Enc2).
// Reines TypeScript, FIPS-197. Die S-Box wird aus GF(2^8) berechnet, damit
// keine 256-Werte-Tabelle abgetippt werden muss (Fehlerquelle) — der Testvektor
// beweist, dass sie stimmt.

function xtime(a: number): number {
  const hi = a & 0x80
  const s = (a << 1) & 0xff
  return hi ? s ^ 0x1b : s
}

/** Multiplikation in GF(2^8) (AES-Polynom 0x11b). */
function gmul(a: number, b: number): number {
  let r = 0
  let x = a
  let y = b
  while (y) {
    if (y & 1) r ^= x
    x = xtime(x)
    y >>= 1
  }
  return r & 0xff
}

function rotl8(x: number, n: number): number {
  return ((x << n) | (x >> (8 - n))) & 0xff
}

const SBOX: Uint8Array = (() => {
  const inv = new Uint8Array(256)
  for (let i = 1; i < 256; i++) {
    for (let j = 1; j < 256; j++) {
      if (gmul(i, j) === 1) {
        inv[i] = j
        break
      }
    }
  }
  const s = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    const x = inv[i]
    s[i] = (x ^ rotl8(x, 1) ^ rotl8(x, 2) ^ rotl8(x, 3) ^ rotl8(x, 4) ^ 0x63) & 0xff
  }
  return s
})()

const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]

/** 16-Byte-Schlüssel -> 176 Byte Rundenschlüssel (11 Runden). */
export function expandKey(key: Uint8Array): Uint8Array {
  if (key.length !== 16) throw new Error('AES-128 braucht einen 16-Byte-Schlüssel')
  const w = new Uint8Array(176)
  w.set(key, 0)
  for (let i = 4; i < 44; i++) {
    const p = 4 * (i - 1)
    let t0 = w[p]
    let t1 = w[p + 1]
    let t2 = w[p + 2]
    let t3 = w[p + 3]
    if (i % 4 === 0) {
      // RotWord + SubWord + Rcon
      const r0 = SBOX[t1] ^ RCON[i / 4 - 1]
      const r1 = SBOX[t2]
      const r2 = SBOX[t3]
      const r3 = SBOX[t0]
      t0 = r0
      t1 = r1
      t2 = r2
      t3 = r3
    }
    const q = 4 * (i - 4)
    w[4 * i] = w[q] ^ t0
    w[4 * i + 1] = w[q + 1] ^ t1
    w[4 * i + 2] = w[q + 2] ^ t2
    w[4 * i + 3] = w[q + 3] ^ t3
  }
  return w
}

/** Einen 16-Byte-Block mit bereits expandiertem Schlüssel verschlüsseln. */
export function encryptBlockExpanded(rk: Uint8Array, block: Uint8Array): Uint8Array {
  const s = Uint8Array.from(block)
  addRoundKey(s, rk, 0)
  for (let round = 1; round < 10; round++) {
    subBytes(s)
    shiftRows(s)
    mixColumns(s)
    addRoundKey(s, rk, round)
  }
  subBytes(s)
  shiftRows(s)
  addRoundKey(s, rk, 10)
  return s
}

/** Bequem: 16-Byte-Schlüssel + 16-Byte-Block -> 16-Byte-Chiffre. */
export function aesEcbEncryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  return encryptBlockExpanded(expandKey(key), block)
}

function addRoundKey(s: Uint8Array, rk: Uint8Array, round: number): void {
  const off = round * 16
  for (let i = 0; i < 16; i++) s[i] ^= rk[off + i]
}

function subBytes(s: Uint8Array): void {
  for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]]
}

// AES-Zustand ist spaltenweise: Index = row + 4*col.
function shiftRows(s: Uint8Array): void {
  const t = Uint8Array.from(s)
  for (let r = 1; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      s[r + 4 * c] = t[r + 4 * ((c + r) % 4)]
    }
  }
}

function mixColumns(s: Uint8Array): void {
  for (let c = 0; c < 4; c++) {
    const i = 4 * c
    const a0 = s[i]
    const a1 = s[i + 1]
    const a2 = s[i + 2]
    const a3 = s[i + 3]
    s[i] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3
    s[i + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3
    s[i + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3)
    s[i + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2)
  }
}
