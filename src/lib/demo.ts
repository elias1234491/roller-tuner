import type { Device, ScooterModel, Telemetry, TuneSettings } from './types'

// Erzeugt glaubwürdige Demo-Werte, damit man die App ohne echten Roller
// ausprobieren kann. Deterministisch aus der Modell-ID, damit es sich stabil
// anfühlt (kein Zufalls-Flackern bei jedem Neuzeichnen).

function seededPct(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return 45 + (h % 50) // 45..94 %
}

export function demoTelemetry(model: ScooterModel): Telemetry {
  const pct = seededPct(model.id)
  // grobe Nennspannung je Marke
  const nominal = model.brand === 'Navee' ? 46 : model.brand === 'Xiaomi' ? 42 : 41
  return {
    speedKmh: 0,
    batteryPct: pct,
    voltage: +(nominal * (0.82 + (pct / 100) * 0.18)).toFixed(1),
    currentA: 0,
    tempC: 24,
    odometerKm: +(120 + (pct % 30) * 13.7).toFixed(1),
    tripKm: +(2 + (pct % 7)).toFixed(1),
    firmware: model.dialect === 'ninebot-enc2' ? '1.4.2' : '1.5.4',
    serial: model.dialect === 'ninebot-enc2' ? '1K1DA25xxP' + (1000 + (pct % 900)) : 'DEMO' + model.id.slice(-4).toUpperCase(),
  }
}

export function defaultTune(model: ScooterModel): TuneSettings {
  return {
    speedLimitKmh: model.stockLimitKmh,
    driveMode: 'drive',
    kers: 'medium',
    cruiseControl: false,
    cruiseTrigger: 'halten',
    zeroStart: false,
    speedToggle: false,
    speedToggleTrigger: 'blinker-links-2x',
    throttledKmh: 22,
    raceKmh: model.tuneMaxKmh,
    raceDisguise: false,
  }
}

export function demoDevice(model: ScooterModel): Device {
  return {
    model,
    demo: true,
    telemetry: demoTelemetry(model),
    tune: defaultTune(model),
  }
}
