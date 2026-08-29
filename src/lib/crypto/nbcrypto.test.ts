import { describe, expect, it } from 'vitest'
import { FW_DATA, deriveKey } from './nbcrypto'
import { fromHex, toHex } from '../bytes'

const hex = (b: Uint8Array): string => toHex(b).replace(/ /g, '')

// btName "TESTDEVICE0001" als ASCII-Bytes.
const NAME = fromHex('5445535444455649434530303031')

describe('Ninebot deriveKey (Known-Answer aus der NootNooot-Referenz)', () => {
  it('KAT-1: Gerätename, key2 = null', () => {
    expect(hex(deriveKey(NAME, null))).toBe('4d631a0ea0d182f78b084f5d2d062ab3')
  })

  it('KAT-3: Gerätename + auth-Challenge', () => {
    const auth = fromHex('000102030405060708090a0b0c0d0e0f')
    expect(hex(deriveKey(NAME, auth))).toBe('9a7d374d24a3e7005c971c2ff992ce75')
  })

  it('FW_DATA-Konstante stimmt', () => {
    expect(hex(FW_DATA)).toBe('97cfb802844143de56002b3b34780a5d')
  })
})
