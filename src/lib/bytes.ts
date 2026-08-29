// Kleine Byte-Helfer für die Bluetooth-Kommunikation.

/** Bytes als Hex-String mit Leerzeichen: [0x5a, 0xa5] -> "5a a5". */
export function toHex(data: Uint8Array | number[]): string {
  return Array.from(data, (b) => b.toString(16).padStart(2, '0')).join(' ')
}

/** Hex-String (Leerzeichen/Kommas egal) -> Bytes. "5a a5" -> [0x5a, 0xa5]. */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  if (clean.length % 2 !== 0) throw new Error('Hex-String hat ungerade Länge')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/** Mehrere Byte-Blöcke aneinanderhängen. */
export function concatBytes(...parts: (Uint8Array | number[])[]): Uint8Array {
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p instanceof Uint8Array ? p : Uint8Array.from(p), off)
    off += p.length
  }
  return out
}

/** Byte-weiser Vergleich. */
export function bytesEqual(a: Uint8Array | number[], b: Uint8Array | number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
