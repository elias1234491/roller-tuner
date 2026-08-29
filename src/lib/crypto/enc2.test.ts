import { describe, expect, it } from 'vitest'
import { decryptFrame, encryptFrame } from './nbcrypto'
import { fromHex, toHex } from '../bytes'

const hex = (b: Uint8Array): string => toHex(b).replace(/ /g, '')

const KEY_NAME = fromHex('4d631a0ea0d182f78b084f5d2d062ab3') // deriveKey(name, null)
const KEY_SN = fromHex('9a7d374d24a3e7005c971c2ff992ce75') // deriveKey(name, auth)
const AUTH = fromHex('000102030405060708090a0b0c0d0e0f')

describe('Enc2 non-SN (KAT-2)', () => {
  const PT = fromHex('5ab5003e045b00')

  it('Gen3 (Nullblock)', () => {
    expect(hex(encryptFrame(KEY_NAME, PT, { counter: 0, gen: 'gen3' }))).toBe('5ab50051304030000062ff0000')
  })

  it('Gen2 (FW_DATA)', () => {
    expect(hex(encryptFrame(KEY_NAME, PT, { counter: 0, gen: 'gen2' }))).toBe('5ab500c1303496000062ff0000')
  })

  it('round-trip', () => {
    const wire = encryptFrame(KEY_NAME, PT, { counter: 0, gen: 'gen3' })
    const r = decryptFrame(KEY_NAME, wire, { gen: 'gen3' })
    expect(r.rc).toBe(0)
    expect(hex(r.plaintext)).toBe('5ab5003e045b00')
  })
})

describe('Enc2 SN / voller CCM-Pfad (KAT-3)', () => {
  const PT = fromHex('5ab5023e045c00aabb')

  it('erzeugt exakt das Referenz-Wire-Frame', () => {
    expect(hex(encryptFrame(KEY_SN, PT, { counter: 2, auth: AUTH }))).toBe('5ab502f74756be19a9e73e71a20002')
  })

  it('round-trip inkl. MAC-Prüfung', () => {
    const wire = encryptFrame(KEY_SN, PT, { counter: 2, auth: AUTH })
    const r = decryptFrame(KEY_SN, wire, { auth: AUTH })
    expect(r.rc).toBe(0)
    expect(r.counter).toBe(2)
    expect(hex(r.plaintext)).toBe('5ab5023e045c00aabb')
  })

  it('erkennt einen verfälschten MAC', () => {
    const wire = encryptFrame(KEY_SN, PT, { counter: 2, auth: AUTH })
    wire[5] ^= 0xff
    expect(decryptFrame(KEY_SN, wire, { auth: AUTH }).rc).toBe(1)
  })
})
