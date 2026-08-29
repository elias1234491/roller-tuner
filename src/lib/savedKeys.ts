// Roller-Schlüssel werden NUR lokal auf diesem Gerät gespeichert (localStorage) —
// nie im Code, nie im Deploy. Einmal eingeben + „merken", dann füllt die App das
// Feld auf genau diesem Gerät von selbst vor.

const LS_KEY = 'roller-tuner.key'

export function loadSavedKey(): string {
  try {
    return localStorage.getItem(LS_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveKey(hex: string): void {
  try {
    localStorage.setItem(LS_KEY, hex)
  } catch {
    // localStorage nicht verfügbar (privater Modus o.ä.) — dann eben nicht merken
  }
}

export function clearSavedKey(): void {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    // egal
  }
}
