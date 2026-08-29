import { describe, expect, it } from 'vitest'
import { ScooterSim } from './simulator'
import type { SimConfig } from './simulator'
import { crackHandshake } from './link'
import { fromHex } from '../bytes'

// ZT3-DIAGNOSE: „austesten wie beim echten Roller — was klappt nicht?"
//
// Symptom am echten ZT3: PRE_COMM antwortet, danach ist bei AUTH FUNKSTILLE.
// Unser Client ist gegen den permissiven Sim als protokollkorrekt bewiesen — also
// muss der echte Roller im AUTH-Schritt etwas ANDERES verlangen, als wir annehmen.
//
// Hier baue ich für JEDE plausible Ursache einen strengen Sim, der sich genau so
// verhält (PRE ok, AUTH stumm, wenn die Annahme nicht getroffen wird), und lasse
// unseren echten Knacker (crackHandshake) drauf los. Ergebnis pro Hypothese:
//   knackt  = unsere (erweiterte) Kombi-Suche deckt diese Ursache ab
//   STUMM   = blinder Fleck → das könnte der echte ZT3 sein, dafür bräuchten wir
//             den Bluetooth-Mitschnitt (der Sim kann die Unbekannte nicht erfinden)
//
// So wird aus „geht nicht" eine konkrete, abgehakte Verdächtigen-Liste.

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const NAME = 'NBZT300000000'
const PW = fromHex('5874d43f46b7d7ab1dd8504b78da0870') // wie aus dem Handy-Backup

const silent = { onProgress: () => {}, onSent: () => {}, onRecvRaw: () => {}, onWaitForButton: () => {} }

// Alle Hypothesen sind „gekoppelt + Passwort bekannt" (Mathias' Fall: Reconnect per AUTH).
async function tryCrack(over: Partial<SimConfig>): Promise<boolean> {
  const sim = new ScooterSim({ btName: NAME, paired: true, storedPassword: PW, ...over })
  const out = await crackHandshake(sim.asDiag(), enc(NAME), { ...silent, timeoutMs: 40 }, PW)
  return out.ok
}

describe('ZT3-Diagnose: welche AUTH-Ursachen deckt unsere Suche ab?', () => {
  it('Standardannahme (derived · BLE · Zähler frei) → knackt', async () => {
    expect(await tryCrack({})).toBe(true)
  })

  it('Ursache A: AUTH geht ans MCU-Board (0x02) statt BLE → jetzt abgedeckt', async () => {
    expect(await tryCrack({ authTarget: 0x02 })).toBe(true)
  })

  it('Ursache B: Schlüssel ist das Passwort DIREKT (nicht abgeleitet) → jetzt abgedeckt', async () => {
    expect(await tryCrack({ authKeyMode: 'direct' })).toBe(true)
  })

  it('Ursache C: Schlüsselableitung mit vertauschter Reihenfolge → jetzt abgedeckt', async () => {
    expect(await tryCrack({ authKeyMode: 'swapped' })).toBe(true)
  })

  it('Ursache D: Roller verlangt AUTH-Zähler exakt 4 → jetzt abgedeckt', async () => {
    expect(await tryCrack({ requireAuthCounter: 4 })).toBe(true)
  })

  // --- ehrliche Grenzen: das kann der Sim modellieren, unsere Suche aber (noch) NICHT ---

  it('Blinder Fleck 1: exotischer AUTH-Zähler (5) → STUMM (bräuchte Mitschnitt)', async () => {
    expect(await tryCrack({ requireAuthCounter: 5 })).toBe(false)
  })

  it('Blinder Fleck 2: AUTH an ein drittes Board (0x09 VCU) → STUMM (bräuchte Mitschnitt)', async () => {
    expect(await tryCrack({ authTarget: 0x09 })).toBe(false)
  })
})
