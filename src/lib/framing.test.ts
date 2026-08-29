import { describe, expect, it } from 'vitest'
import { FrameReassembler, NINEBOT_PLAIN } from './framing'
import { toHex } from './bytes'

// Beispiel-Rahmen: 5A A5 | LEN=03 | 02 04 31 | CK CK  -> 8 Byte
const FRAME = [0x5a, 0xa5, 0x03, 0x02, 0x04, 0x31, 0xaa, 0xbb]

describe('FrameReassembler', () => {
  it('erkennt einen kompletten Rahmen in einem Häppchen', () => {
    const r = new FrameReassembler(NINEBOT_PLAIN)
    const frames = r.push(FRAME)
    expect(frames).toHaveLength(1)
    expect(toHex(frames[0])).toBe('5a a5 03 02 04 31 aa bb')
  })

  it('setzt einen über zwei Häppchen verteilten Rahmen zusammen', () => {
    const r = new FrameReassembler(NINEBOT_PLAIN)
    expect(r.push(FRAME.slice(0, 4))).toHaveLength(0) // unvollständig
    const frames = r.push(FRAME.slice(4))
    expect(frames).toHaveLength(1)
    expect(toHex(frames[0])).toBe('5a a5 03 02 04 31 aa bb')
  })

  it('setzt auch einen im Header gesplitteten Rahmen zusammen', () => {
    const r = new FrameReassembler(NINEBOT_PLAIN)
    expect(r.push([0x5a])).toHaveLength(0) // halber Header
    const frames = r.push([0xa5, 0x03, 0x02, 0x04, 0x31, 0xaa, 0xbb])
    expect(frames).toHaveLength(1)
  })

  it('verwirft Müll vor dem Header', () => {
    const r = new FrameReassembler(NINEBOT_PLAIN)
    const frames = r.push([0x00, 0xff, 0x13, ...FRAME])
    expect(frames).toHaveLength(1)
    expect(toHex(frames[0])).toBe('5a a5 03 02 04 31 aa bb')
  })

  it('trennt zwei Rahmen in einem Häppchen', () => {
    const r = new FrameReassembler(NINEBOT_PLAIN)
    const frames = r.push([...FRAME, ...FRAME])
    expect(frames).toHaveLength(2)
  })

  it('kommt mit LEN=0 klar', () => {
    const r = new FrameReassembler(NINEBOT_PLAIN)
    const frames = r.push([0x5a, 0xa5, 0x00, 0xaa, 0xbb])
    expect(frames).toHaveLength(1)
    expect(frames[0]).toHaveLength(5)
  })
})
