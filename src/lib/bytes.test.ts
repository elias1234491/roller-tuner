import { describe, expect, it } from 'vitest'
import { bytesEqual, concatBytes, fromHex, toHex } from './bytes'

describe('bytes', () => {
  it('toHex/fromHex sind umkehrbar', () => {
    expect(toHex([0x5a, 0xa5, 0x00, 0xff])).toBe('5a a5 00 ff')
    expect(Array.from(fromHex('5a a5 00 ff'))).toEqual([0x5a, 0xa5, 0x00, 0xff])
    expect(Array.from(fromHex('5AA500FF'))).toEqual([0x5a, 0xa5, 0x00, 0xff])
  })

  it('fromHex meckert bei ungerader Länge', () => {
    expect(() => fromHex('5a a')).toThrow()
  })

  it('concatBytes hängt Zahlen-Arrays und Uint8Arrays zusammen', () => {
    const r = concatBytes([0x5a, 0xa5], Uint8Array.from([0x01, 0x02]), [0x03])
    expect(Array.from(r)).toEqual([0x5a, 0xa5, 0x01, 0x02, 0x03])
  })

  it('bytesEqual vergleicht Inhalt, nicht Referenz', () => {
    expect(bytesEqual([1, 2, 3], Uint8Array.from([1, 2, 3]))).toBe(true)
    expect(bytesEqual([1, 2], [1, 2, 3])).toBe(false)
  })
})
