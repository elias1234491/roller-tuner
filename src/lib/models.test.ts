import { describe, expect, it } from 'vitest'
import { MODELS, findModel, modelsByBrand } from './models'

describe('Modell-Katalog', () => {
  it('hat eindeutige IDs', () => {
    const ids = MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('tuneMaxKmh ist nie kleiner als die Werksdrosselung', () => {
    for (const m of MODELS) {
      expect(m.tuneMaxKmh).toBeGreaterThanOrEqual(m.stockLimitKmh)
    }
  })

  it('verschlüsselte Modelle sprechen einen Enc-Dialekt', () => {
    for (const m of MODELS) {
      if (m.encrypted) {
        expect(['ninebot-enc2', 'navee']).toContain(m.dialect)
      }
    }
  })

  it('der ZT3 Pro ist als verschlüsselt (Enc2) hinterlegt', () => {
    const zt3 = findModel('ninebot-zt3-pro')
    expect(zt3).toBeDefined()
    expect(zt3?.encrypted).toBe(true)
    expect(zt3?.dialect).toBe('ninebot-enc2')
  })

  it('findet Modelle je Marke', () => {
    expect(modelsByBrand('Xiaomi').length).toBeGreaterThan(0)
    expect(modelsByBrand('Navee').every((m) => m.brand === 'Navee')).toBe(true)
  })
})
