import { describe, expect, it } from 'vitest'
import { BOARD, CMD, SYNC2, buildRequest, parseResponse } from './frame'
import { fromHex, toHex } from '../bytes'

const hex = (b: Uint8Array): string => toHex(b).replace(/ /g, '')

describe('Ninebot-Frame', () => {
  it('baut PRE_COMM genau wie im Testvektor', () => {
    expect(hex(buildRequest(SYNC2.GEN3, BOARD.BLE, CMD.PRE_COMM, 0))).toBe('5ab5003e045b00')
  })

  it('baut SET_PWD-Rahmen mit Nutzdaten', () => {
    expect(hex(buildRequest(SYNC2.GEN3, BOARD.BLE, CMD.SET_PWD, 0, fromHex('aabb')))).toBe('5ab5023e045c00aabb')
  })

  it('zerlegt eine Geräte-Antwort', () => {
    const pt = fromHex('5ab503043e5b00a1a2a3')
    const f = parseResponse(pt)
    expect(f.source).toBe(0x04)
    expect(f.cmd).toBe(0x5b)
    expect(f.index).toBe(0x00)
    expect(hex(f.data)).toBe('a1a2a3')
  })
})
