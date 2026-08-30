import { describe, expect, it } from 'vitest'
import { ScooterSim, makeF3ProD } from './simulator'
import { crackHandshake, runHandshake } from './link'
import type { HandshakeConfig } from './handshake'
import { fromHex } from '../bytes'

// End-to-end: unser ECHTER Client (runHandshake / crackHandshake) gegen den
// virtuellen ZT3. Deckt ab, was die Krypto-Unit-Tests NICHT sehen: Rahmen-
// Zusammenbau über BLE-Häppchen, Zähler-Reihenfolge, den kompletten 3-Schritt-
// Ablauf und die Kombi-Suche des Knackers.

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const NAME = 'NBZT300000000'

// Client-Konfiguration passend zum Standard-Sim (A5 · FW-Schlüssel · FW-Keystream · Nonce 0).
const CFG: HandshakeConfig = { sync2: 0xa5, gen: 'gen2', authOffset: 0, preKey2Fw: true }

const silentHooks = {
  onProgress: () => {},
  onSent: () => {},
  onRecvRaw: () => {},
  onWaitForButton: () => {},
}

describe('Handshake gegen den virtuellen ZT3', () => {
  it('frischer Roller: kompletter Ablauf PRE → SET_PWD → AUTH wird freigeschaltet', async () => {
    const sim = new ScooterSim({ btName: NAME, paired: false })
    const res = await runHandshake(sim.asTransport(), enc(NAME), CFG, { ...silentHooks, timeoutMs: 500 })
    expect(res.ok).toBe(true)
    expect(res.serialAscii).toContain('1K1DA2551P2788')
  })

  it('bleibt STUMM bei falscher Krypto (falscher Schlüssel) → Zeitüberschreitung', async () => {
    const sim = new ScooterSim({ btName: NAME, paired: false, preKey2Fw: true })
    // Client mit FALSCHEM preKey2Fw → PRE entschlüsselt beim Sim nicht → keine Antwort.
    const wrong: HandshakeConfig = { ...CFG, preKey2Fw: false }
    await expect(
      runHandshake(sim.asTransport(), enc(NAME), wrong, { ...silentHooks, timeoutMs: 150 }),
    ).rejects.toThrow(/Zeitüberschreitung/)
  })

  const PW = fromHex('5874d43f46b7d7ab1dd8504b78da0870') // beliebige 16 Byte, auf beiden Seiten gleich

  it('gekoppelter Roller: crackHandshake meldet sich mit bekanntem Schlüssel per AUTH an', async () => {
    const sim = new ScooterSim({ btName: NAME, paired: true, storedPassword: PW })
    const out = await crackHandshake(sim.asDiag(), enc(NAME), silentHooks, PW)
    expect(out.ok).toBe(true)
  })

  it('Streng-Zähler-Sim: die Kombi-Suche des Knackers trifft den richtigen Zähler', async () => {
    const sim = new ScooterSim({ btName: NAME, paired: true, storedPassword: PW, requireAuthCounter: 2 })
    const out = await crackHandshake(sim.asDiag(), enc(NAME), silentHooks, PW)
    expect(out.ok).toBe(true)
  })

  it('Entdrosseln nach AUTH: crack + Speed-Limit setzen läuft durch', async () => {
    const sim = new ScooterSim({ btName: NAME, paired: true, storedPassword: PW })
    const out = await crackHandshake(sim.asDiag(), enc(NAME), { ...silentHooks, timeoutMs: 40 }, PW, 40)
    expect(out.ok).toBe(true)
    expect(out.message).toContain('40 km/h')
  })

  it('F3-Pro-D-Bot (frisch): knacken → SET_PWD → AUTH → ENTDROSSELT das Limit 25 → 40', async () => {
    const f3 = makeF3ProD()
    expect(f3.getSpeedLimit()).toBe(25) // Werkslimit
    const out = await crackHandshake(f3.asDiag(), enc(f3.cfg.btName), { ...silentHooks, timeoutMs: 40 }, undefined, 40)
    expect(out.ok).toBe(true)
    expect(f3.getSpeedLimit()).toBe(40) // Bordcomputer hat den Wert übernommen!
  })

  it('ZT3-artiger Bot: Kanal offen, aber Firmware BLOCKT die Writes → Limit bleibt 25', async () => {
    const zt3 = new ScooterSim({ btName: NAME, paired: true, storedPassword: PW, acceptSpeedWrites: false })
    const out = await crackHandshake(zt3.asDiag(), enc(NAME), { ...silentHooks, timeoutMs: 40 }, PW, 40)
    expect(out.ok).toBe(true) // AUTH klappt
    expect(zt3.getSpeedLimit()).toBe(25) // aber Limit unverändert — genau wie in echt
  })
})
