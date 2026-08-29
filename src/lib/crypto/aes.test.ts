import { describe, expect, it } from 'vitest'
import { aesEcbEncryptBlock } from './aes'
import { fromHex, toHex } from '../bytes'

const hex = (b: Uint8Array): string => toHex(b).replace(/ /g, '')

describe('AES-128 ECB', () => {
  it('FIPS-197 Blockverschlüsselung', () => {
    const key = fromHex('2b7e151628aed2a6abf7158809cf4f3c')
    const pt = fromHex('6bc1bee22e409f96e93d7e117393172a')
    expect(hex(aesEcbEncryptBlock(key, pt))).toBe('3ad77bb40d7a3660a89ecaf32466ef97')
  })

  it('KAT-1: Ninebot-Keystreams (Gen3 = 0-Block, Gen2 = FW_DATA)', () => {
    const key = fromHex('4d631a0ea0d182f78b084f5d2d062ab3')
    expect(hex(aesEcbEncryptBlock(key, fromHex('00000000000000000000000000000000')))).toBe(
      '6f341b30f278ba84ebd01ca20a48f87b',
    )
    expect(hex(aesEcbEncryptBlock(key, fromHex('97cfb802844143de56002b3b34780a5d')))).toBe(
      'ff346f96d173c3bf045a49279657c20d',
    )
  })
})
