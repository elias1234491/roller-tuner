import { describe, expect, it } from 'vitest'
import { JavaRandom, generatePassword } from './javaRandom'
import { fromHex, toHex } from '../bytes'

const hex = (b: Uint8Array): string => toHex(b).replace(/ /g, '')

describe('JavaRandom / Passwort (KAT-4)', () => {
  it('JavaRandom(12345).nextBytes(4)', () => {
    expect(hex(new JavaRandom(12345n).nextBytes(4))).toBe('d6209f5c')
  })

  it('generatePassword(auth, 1700000000000)', () => {
    const auth = fromHex('000102030405060708090a0b0c0d0e0f')
    expect(hex(generatePassword(auth, 1700000000000))).toBe('37f12643761c539457d89f709b3d3834')
  })
})
