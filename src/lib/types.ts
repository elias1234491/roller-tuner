// Gemeinsame Typen für den Roller-Tuner.
// Bewusst nur Union-Types statt enum (tsconfig: erasableSyntaxOnly).

export type Brand = 'Xiaomi' | 'Segway·Ninebot' | 'Navee'

/**
 * Protokoll-"Dialekt", den ein Roller spricht. Bestimmt, wie wir mit ihm reden.
 * - xiaomi:        Xiaomi/Mi-Serie (M365 & Nachfolger), gut dokumentiert.
 * - ninebot:       Ältere Segway-Ninebot (ES/E/F/Max G30), unverschlüsselt lesbar.
 * - ninebot-enc2:  Neuere Ninebot der 3. Generation (Max G2, GT, P, ZT3 Pro) —
 *                  verschlüsselt ("Encryption2"), braucht Handshake.
 * - navee:         Navee-eigenes Protokoll, weniger dokumentiert.
 */
export type Dialect = 'xiaomi' | 'ninebot' | 'ninebot-enc2' | 'navee'

export interface ScooterModel {
  id: string
  brand: Brand
  name: string
  dialect: Dialect
  /** true = Funk ist verschlüsselt, wir brauchen einen Auth-Handshake. */
  encrypted: boolean
  /** Werksdrosselung, wie in der EU ausgeliefert (km/h). */
  stockLimitKmh: number
  /** Realistisch erreichbare Endgeschwindigkeit nach dem Entdrosseln (km/h). */
  tuneMaxKmh: number
  /** Kurzer, ehrlicher Hinweis zum Tuning-Stand dieses Modells. */
  notes?: string
  /** true = Firmware blockt Speed-Writes trotz offenem Kanal (z. B. ZT3 Pro). */
  speedWritesBlocked?: boolean
}

/** Was wir live vom Roller lesen. Optional, weil nicht jeder Roller alles liefert. */
export interface Telemetry {
  speedKmh: number
  batteryPct: number
  voltage?: number
  currentA?: number
  tempC?: number
  odometerKm?: number
  tripKm?: number
  firmware?: string
  serial?: string
}

export type DriveMode = 'eco' | 'drive' | 'sport'
export type Kers = 'weak' | 'medium' | 'strong'

/** Wie der Tempomat am Roller ausgelöst wird (Tastenkombination). */
export type CruiseTrigger = 'halten' | 'blinker-links-2x' | 'blinker-rechts-2x' | 'klingel-halten'

/** Einstellungen, die wir (später) auf den Roller schreiben. */
export interface TuneSettings {
  speedLimitKmh: number
  driveMode: DriveMode
  kers: Kers
  cruiseControl: boolean
  cruiseTrigger: CruiseTrigger
  zeroStart: boolean
  /** Drossel-Umschaltung per Tastenkombi: schaltet zwischen gedrosselt und Race+ um. */
  speedToggle: boolean
  /** Welche Kombi umschaltet (nutzt dieselben Trigger wie der Tempomat). */
  speedToggleTrigger: CruiseTrigger
  /** Gedrosselter Wert (legal, z. B. 22 km/h). */
  throttledKmh: number
  /** Race-Mode-Wert (voll, nur Privatgelände). */
  raceKmh: number
  /** Tarn-Modus: Race sieht aktiv aus, fährt aber nur den gedrosselten Wert. */
  raceDisguise: boolean
}

/** Ein verbundener (echter oder Demo-)Roller im laufenden Zustand. */
export interface Device {
  model: ScooterModel
  /** true = Demo-Modus (keine echte Bluetooth-Verbindung). */
  demo: boolean
  telemetry: Telemetry
  tune: TuneSettings
}

/** Reiter der App. */
export type Tab = 'verbinden' | 'uebersicht' | 'tunen' | 'zt3' | 'info'
