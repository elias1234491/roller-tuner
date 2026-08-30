import { describe, expect, it } from 'vitest'
import { HandshakeSession } from './handshake'
import type { HandshakeConfig } from './handshake'
import { decryptFrame, deriveKey, encryptFrame } from '../crypto/nbcrypto'
import { concatBytes, fromHex, toHex } from '../bytes'

const hex = (b: Uint8Array): string => toHex(b).replace(/ /g, '')

const NAME = fromHex('5445535444455649434530303031') // "TESTDEVICE0001"
const AUTH = fromHex('000102030405060708090a0b0c0d0e0f')
const SERIAL = fromHex('0102030405060708090a0b0c0d0e') // 14 Byte
const PW = fromHex('37f12643761c539457d89f709b3d3834')
const CFG: HandshakeConfig = { sync2: 0xb5, gen: 'gen3', authOffset: 0 }

// Simuliert die verschlüsselte PRE-Antwort des Rollers: index=0 (frisch),
// Nutzdaten = Challenge(16) + Serial(14).
function fakePreResponse(): Uint8Array {
  const data = concatBytes(AUTH, SERIAL)
  const pt = concatBytes([0x5a, 0xb5, data.length, 0x04, 0x3e, 0x5b, 0x00], data)
  return encryptFrame(deriveKey(NAME, null), pt, { counter: 0, gen: 'gen3' })
}

describe('HandshakeSession — kompletter Ablauf', () => {
  it('Schritt 1: PRE_COMM erzeugt den richtigen Klartext', () => {
    const s = new HandshakeSession(NAME, CFG)
    const wire = s.preCommFrame()
    const { plaintext, rc } = decryptFrame(deriveKey(NAME, null), wire, { gen: 'gen3' })
    expect(rc).toBe(0)
    expect(hex(plaintext)).toBe('5ab5003e045b00')
  })

  it('verarbeitet die PRE-Antwort: Challenge + Serial + "frisch"', () => {
    const s = new HandshakeSession(NAME, CFG)
    s.preCommFrame()
    const pr = s.handlePreResp(fakePreResponse())
    expect(pr.paired).toBe(false)
    expect(hex(pr.auth)).toBe(hex(AUTH))
    expect(hex(pr.serial)).toBe(hex(SERIAL))
  })

  it('Schritt 2: SET_PWD verschlüsselt das Passwort (Zähler 2)', () => {
    const s = new HandshakeSession(NAME, CFG)
    s.preCommFrame()
    s.handlePreResp(fakePreResponse())
    const wire = s.setPwdFrame(0, PW)
    const r = decryptFrame(deriveKey(NAME, AUTH), wire, { auth: AUTH })
    expect(r.rc).toBe(0)
    expect(r.counter).toBe(2)
    expect(hex(r.plaintext)).toBe('5ab5103e045c00' + hex(PW))
  })

  it('Schritt 3: AUTH nutzt Passwort-Schlüssel + Serial (Zähler 3)', () => {
    const s = new HandshakeSession(NAME, CFG)
    s.preCommFrame()
    s.handlePreResp(fakePreResponse())
    s.setPwdFrame(0, PW)
    const wire = s.authFrame()
    const r = decryptFrame(deriveKey(PW, AUTH), wire, { auth: AUTH })
    expect(r.rc).toBe(0)
    expect(r.counter).toBe(3)
    expect(hex(r.plaintext)).toBe('5ab50e3e045d00' + hex(SERIAL))
  })

  it('Entdrosseln: schreibt Register 0x93 (Display-Board) mit km/h als u16-LE', () => {
    const s = new HandshakeSession(NAME, CFG)
    s.preCommFrame()
    s.handlePreResp(fakePreResponse())
    s.usePassword(PW)
    const wire = s.buildSpeedLimitFrame(40, 3, 0xb5) // 40 km/h = 0x28,0x00
    const r = decryptFrame(deriveKey(PW, AUTH), wire, { auth: AUTH })
    expect(r.rc).toBe(0)
    // [5a, b5, LEN=02, 3e, target=01(Display), cmd=03(WRITE), reg=93, 28, 00]
    expect(hex(r.plaintext)).toBe('5ab5023e0103932800')
  })
})
