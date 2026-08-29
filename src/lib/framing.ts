// Bluetooth-Notifications kommen in kleinen Häppchen (~20 Byte). Ein Protokoll-
// Rahmen (Ninebot 5A A5 … / Xiaomi 55 AA …) kann über mehrere Häppchen verteilt
// ankommen. Der Reassembler puffert Bytes und gibt vollständige Rahmen zurück.
//
// Rahmen-Aufbau (beide Dialekte gleich strukturiert):
//   [ Header (n Byte) ][ LEN (1 Byte) ][ Nutzlast (LEN Byte) ][ Anhang (trailer) ]
// LEN zählt nur die Nutzlast. Prüfsummen prüft erst die Protokoll-Schicht.

export interface FrameFormat {
  /** Erkennungs-Bytes am Anfang, z.B. [0x5a, 0xa5] oder [0x55, 0xaa]. */
  header: number[]
  /** Bytes hinter der Nutzlast (Prüfsumme o.ä.), plaintext meist 2. */
  trailerLen: number
}

export const NINEBOT_PLAIN: FrameFormat = { header: [0x5a, 0xa5], trailerLen: 2 }
export const XIAOMI_PLAIN: FrameFormat = { header: [0x55, 0xaa], trailerLen: 2 }

export class FrameReassembler {
  private buf: number[] = []
  private readonly fmt: FrameFormat

  constructor(fmt: FrameFormat) {
    this.fmt = fmt
  }

  /** Neue Bytes einwerfen, fertige Rahmen kommen zurück. */
  push(chunk: Uint8Array | number[]): Uint8Array[] {
    for (const b of chunk) this.buf.push(b)
    return this.drain()
  }

  reset(): void {
    this.buf = []
  }

  private drain(): Uint8Array[] {
    const out: Uint8Array[] = []
    const H = this.fmt.header.length

    for (;;) {
      const start = this.findHeader()
      if (start < 0) {
        // Kein Header: nur ein möglicher Teil-Header am Ende aufheben.
        if (this.buf.length >= H) this.buf = this.buf.slice(-(H - 1))
        break
      }
      if (start > 0) this.buf = this.buf.slice(start) // Müll davor verwerfen

      if (this.buf.length < H + 1) break // LEN-Byte fehlt noch
      const len = this.buf[H]
      const total = H + 1 + len + this.fmt.trailerLen
      if (this.buf.length < total) break // Rahmen noch nicht komplett

      out.push(Uint8Array.from(this.buf.slice(0, total)))
      this.buf = this.buf.slice(total)
    }
    return out
  }

  /** Index des ersten vollständigen Headers, sonst -1. */
  private findHeader(): number {
    const h = this.fmt.header
    outer: for (let i = 0; i + h.length <= this.buf.length; i++) {
      for (let j = 0; j < h.length; j++) {
        if (this.buf[i + j] !== h[j]) continue outer
      }
      return i
    }
    return -1
  }
}
