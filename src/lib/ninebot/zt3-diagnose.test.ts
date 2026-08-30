import { describe, expect, it } from 'vitest'
import { ScooterSim } from './simulator'
import type { SimConfig } from './simulator'
import { crackHandshake } from './link'
import { fromHex } from '../bytes'

// ZT3-DIAGNOSE — jetzt gegen die REALITÄT aus dem echten Segway-Mitschnitt (S26).
//
// Der Mitschnitt hat die AUTH-Variante byte-genau bestätigt: abgeleiteter Schlüssel,
// Nonce-Offset 0, Board BLE, sync2 A5, Zähler 2 (Reconnect), Daten = Serial. Kein
// Raten mehr. Er zeigte außerdem: die ERSTE Verbindung scheitert oft (Challenge
// veraltet) — die offizielle App macht dann PRE+AUTH mit frischer Challenge NEU.
// Genau dieses Neuversuch-Verhalten prüfen wir hier.

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const NAME = 'NBZT300000000'
const PW = fromHex('5874d43f46b7d7ab1dd8504b78da0870')
const silent = { onProgress: () => {}, onSent: () => {}, onRecvRaw: () => {}, onWaitForButton: () => {} }

async function tryCrack(over: Partial<SimConfig>): Promise<boolean> {
  const sim = new ScooterSim({ btName: NAME, paired: true, storedPassword: PW, ...over })
  const out = await crackHandshake(sim.asDiag(), enc(NAME), { ...silent, timeoutMs: 40 }, PW)
  return out.ok
}

describe('ZT3-Diagnose gegen die Mitschnitt-Wahrheit', () => {
  it('bewiesene Variante (derived · BLE · offset 0 · Zähler 2) → knackt sofort', async () => {
    expect(await tryCrack({})).toBe(true)
  })

  it('Reconnect mit exakt Zähler 2 (wie im Mitschnitt) → knackt', async () => {
    expect(await tryCrack({ requireAuthCounter: 2 })).toBe(true)
  })

  it('erste Verbindung scheitert (Challenge veraltet) → Neuversuch rettet es', async () => {
    // failFirstAuth: 2 -> die ersten 2 AUTH-Versuche stumm, der 3. klappt (wie A->B).
    expect(await tryCrack({ failFirstAuth: 2 })).toBe(true)
  })

  it('mehrere Fehlversuche → Neuversuch-Budget deckt es noch ab', async () => {
    expect(await tryCrack({ failFirstAuth: 4 })).toBe(true)
  })

  // --- ehrliche Grenze ---
  it('dauerhaft stumm (veraltetes Passwort) → auch Neuversuche helfen nicht', async () => {
    expect(await tryCrack({ failFirstAuth: 99 })).toBe(false)
  })
})
