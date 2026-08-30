import type { ScooterModel } from './types'

// Modell-Katalog. Werte sind sorgfältig geschätzte Richtwerte (EU-Auslieferung);
// die genauen Zahlen kommen später aus dem echten Auslesen des Rollers.
// Reihenfolge grob nach Beliebtheit/Alter.

export const MODELS: ScooterModel[] = [
  // ---------------- Xiaomi / Mi ----------------
  { id: 'xiaomi-m365', brand: 'Xiaomi', name: 'Mi M365', dialect: 'xiaomi', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 33, notes: 'Der Klassiker — voll auslesbar, zuverlässig entdrosselbar.' },
  { id: 'xiaomi-m365-pro', brand: 'Xiaomi', name: 'Mi M365 Pro', dialect: 'xiaomi', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 33 },
  { id: 'xiaomi-pro2', brand: 'Xiaomi', name: 'Mi Pro 2', dialect: 'xiaomi', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 33 },
  { id: 'xiaomi-1s', brand: 'Xiaomi', name: 'Mi 1S', dialect: 'xiaomi', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 30 },
  { id: 'xiaomi-essential', brand: 'Xiaomi', name: 'Mi Essential', dialect: 'xiaomi', encrypted: false, stockLimitKmh: 20, tuneMaxKmh: 25 },
  { id: 'xiaomi-mi3', brand: 'Xiaomi', name: 'Mi 3', dialect: 'xiaomi', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 30 },
  { id: 'xiaomi-mi4', brand: 'Xiaomi', name: 'Mi 4', dialect: 'xiaomi', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 33 },
  { id: 'xiaomi-mi4-pro', brand: 'Xiaomi', name: 'Mi 4 Pro', dialect: 'xiaomi', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 35 },
  { id: 'xiaomi-mi4-ultra', brand: 'Xiaomi', name: 'Mi 4 Ultra', dialect: 'xiaomi', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 40, notes: 'Kräftig — Entdrosseln stark spürbar.' },

  // ---------------- Segway · Ninebot (unverschlüsselt) ----------------
  { id: 'ninebot-es2', brand: 'Segway·Ninebot', name: 'ES2', dialect: 'ninebot', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 30 },
  { id: 'ninebot-es4', brand: 'Segway·Ninebot', name: 'ES4', dialect: 'ninebot', encrypted: false, stockLimitKmh: 30, tuneMaxKmh: 35, notes: 'Zweitakku ab Werk.' },
  { id: 'ninebot-e22', brand: 'Segway·Ninebot', name: 'E22', dialect: 'ninebot', encrypted: false, stockLimitKmh: 20, tuneMaxKmh: 25 },
  { id: 'ninebot-e45', brand: 'Segway·Ninebot', name: 'E45', dialect: 'ninebot', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 30 },
  { id: 'ninebot-f25', brand: 'Segway·Ninebot', name: 'F25', dialect: 'ninebot', encrypted: false, stockLimitKmh: 20, tuneMaxKmh: 30 },
  { id: 'ninebot-f30', brand: 'Segway·Ninebot', name: 'F30', dialect: 'ninebot', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 32 },
  { id: 'ninebot-f40', brand: 'Segway·Ninebot', name: 'F40', dialect: 'ninebot', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 35 },
  { id: 'ninebot-max-g30', brand: 'Segway·Ninebot', name: 'Max G30', dialect: 'ninebot', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 35, notes: 'Beliebt wegen Reichweite — gut entdrosselbar.' },

  // ---------------- Segway · Ninebot Gen 3 (verschlüsselt, "Enc2") ----------------
  { id: 'ninebot-max-g2', brand: 'Segway·Ninebot', name: 'Max G2', dialect: 'ninebot-enc2', encrypted: true, stockLimitKmh: 25, tuneMaxKmh: 37, notes: 'Gen 3, verschlüsselt — braucht Handshake.' },
  { id: 'ninebot-max-g3', brand: 'Segway·Ninebot', name: 'Max G3', dialect: 'ninebot-enc2', encrypted: true, stockLimitKmh: 25, tuneMaxKmh: 70, notes: 'Gen 3, verschlüsselt (Handshake).' },
  { id: 'ninebot-gt1', brand: 'Segway·Ninebot', name: 'GT1', dialect: 'ninebot-enc2', encrypted: true, stockLimitKmh: 40, tuneMaxKmh: 50, notes: 'Starkes Gerät, verschlüsselt.' },
  { id: 'ninebot-gt2', brand: 'Segway·Ninebot', name: 'GT2', dialect: 'ninebot-enc2', encrypted: true, stockLimitKmh: 40, tuneMaxKmh: 70, notes: 'Sehr stark, verschlüsselt.' },
  { id: 'ninebot-p65', brand: 'Segway·Ninebot', name: 'P65 / P100', dialect: 'ninebot-enc2', encrypted: true, stockLimitKmh: 25, tuneMaxKmh: 40, notes: 'Gen 3, verschlüsselt.' },
  { id: 'ninebot-f3', brand: 'Segway·Ninebot', name: 'F3', dialect: 'ninebot-enc2', encrypted: true, stockLimitKmh: 25, tuneMaxKmh: 40, notes: 'Gen 3, verschlüsselt — Writes greifen (per SHU bestätigt).' },
  { id: 'ninebot-f3-pro', brand: 'Segway·Ninebot', name: 'F3 Pro', dialect: 'ninebot-enc2', encrypted: true, stockLimitKmh: 25, tuneMaxKmh: 40, notes: 'Wie F3, stärker — Speed-Writes werden angenommen.' },
  { id: 'ninebot-zt3-pro', brand: 'Segway·Ninebot', name: 'ZT3 Pro', dialect: 'ninebot-enc2', encrypted: true, stockLimitKmh: 25, tuneMaxKmh: 40, speedWritesBlocked: true, notes: 'Der harte Brocken: Handshake klappt, aber die Firmware BLOCKT die Speed-Writes (auch SHU scheitert). Braucht Hardware-Kabel.' },

  // ---------------- Navee ----------------
  { id: 'navee-v25', brand: 'Navee', name: 'V25', dialect: 'navee', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 30 },
  { id: 'navee-v40', brand: 'Navee', name: 'V40 / V40 Pro', dialect: 'navee', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 32 },
  { id: 'navee-v50', brand: 'Navee', name: 'V50 / V50 Pro', dialect: 'navee', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 35 },
  { id: 'navee-n65', brand: 'Navee', name: 'N65', dialect: 'navee', encrypted: false, stockLimitKmh: 25, tuneMaxKmh: 40, notes: 'Protokoll weniger dokumentiert — Auslesen zuerst prüfen.' },
  { id: 'navee-gt3', brand: 'Navee', name: 'GT3 / GT3 Pro', dialect: 'navee', encrypted: true, stockLimitKmh: 25, tuneMaxKmh: 45, notes: 'Neuere Navee mit Verschlüsselung — experimentell.' },
]

export const BRANDS: readonly string[] = ['Xiaomi', 'Segway·Ninebot', 'Navee']

export function modelsByBrand(brand: string): ScooterModel[] {
  return MODELS.filter((m) => m.brand === brand)
}

export function findModel(id: string): ScooterModel | undefined {
  return MODELS.find((m) => m.id === id)
}
