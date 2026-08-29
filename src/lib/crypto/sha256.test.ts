import { describe, expect, it } from 'vitest'
import { sha256 } from './sha256'
import { toHex } from '../bytes'

const hex = (b: Uint8Array): string => toHex(b).replace(/ /g, '')

describe('SHA-256', () => {
  it('leere Eingabe', () => {
    expect(hex(sha256(new Uint8Array(0)))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('"abc"', () => {
    expect(hex(sha256(Uint8Array.from([0x61, 0x62, 0x63])))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
