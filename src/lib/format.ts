// Kleine, gut testbare Hilfsfunktionen zum Anzeigen von Werten.

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function formatKmh(value: number): string {
  return `${value.toFixed(1)} km/h`
}

export function formatKm(value: number): string {
  return `${value.toFixed(1)} km`
}

export function formatPct(value: number): string {
  return `${Math.round(clamp(value, 0, 100))} %`
}

export function formatVolt(value: number): string {
  return `${value.toFixed(1)} V`
}

/** Farbe für die Akku-Anzeige (grün → gelb → rot). */
export function batteryColor(pct: number): string {
  const p = clamp(pct, 0, 100)
  if (p >= 50) return '#3fb950'
  if (p >= 20) return '#d29922'
  return '#f85149'
}
