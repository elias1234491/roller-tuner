import { describe, expect, it } from 'vitest'
import { sha1 } from './sha1'
import { toHex } from '../bytes'

const hex = (b: Uint8Array): string => toHex(b).replace(/ /g, '')

describe('SHA-1', () => {
  it('leere Eingabe', () => {
    expect(hex(sha1(new Uint8Array(0)))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
  })

  it('"abc"', () => {
    expect(hex(sha1(Uint8Array.from([0x61, 0x62, 0x63])))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })
})
