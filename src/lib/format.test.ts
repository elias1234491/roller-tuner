import { describe, expect, it } from 'vitest'
import { batteryColor, clamp, formatKm, formatKmh, formatPct, formatVolt } from './format'

describe('format', () => {
  it('clamp begrenzt und fängt NaN ab', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
    expect(clamp(Number.NaN, 2, 10)).toBe(2)
  })

  it('formatiert Geschwindigkeit, Strecke, Prozent, Spannung', () => {
    expect(formatKmh(25)).toBe('25.0 km/h')
    expect(formatKm(12.34)).toBe('12.3 km')
    expect(formatPct(83.6)).toBe('84 %')
    expect(formatPct(200)).toBe('100 %')
    expect(formatVolt(41.2)).toBe('41.2 V')
  })

  it('Akkufarbe wechselt an den Schwellen', () => {
    expect(batteryColor(80)).toBe('#3fb950')
    expect(batteryColor(30)).toBe('#d29922')
    expect(batteryColor(5)).toBe('#f85149')
  })
})
