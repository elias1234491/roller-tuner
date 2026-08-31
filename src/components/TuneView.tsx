import type { CruiseTrigger, Device, DriveMode, Kers, TuneSettings } from '../lib/types'
import { clamp } from '../lib/format'

const DRIVE_OPTS: [DriveMode, string][] = [
  ['eco', 'Eco'],
  ['drive', 'Drive'],
  ['sport', 'Sport'],
]
const KERS_OPTS: [Kers, string][] = [
  ['weak', 'Schwach'],
  ['medium', 'Mittel'],
  ['strong', 'Stark'],
]
const TRIGGER_OPTS: [CruiseTrigger, string][] = [
  ['halten', 'Gas halten (5 s)'],
  ['blinker-links-2x', '2× linker Blinker'],
  ['blinker-rechts-2x', '2× rechter Blinker'],
  ['klingel-halten', 'Klingel halten'],
]

export default function TuneView({
  device,
  onChange,
}: {
  device: Device | null
  onChange: (patch: Partial<TuneSettings>) => void
}) {
  if (!device) {
    return (
      <div className="empty">
        <div className="big">⚙️</div>
        Erst einen Roller verbinden.
      </div>
    )
  }

  const { model, tune } = device

  return (
    <section>
      <h2 className="view-title">Tunen</h2>
      <p className="view-sub">
        {model.brand} {model.name} · Werk {model.stockLimitKmh} km/h · bis ~{model.tuneMaxKmh} km/h
      </p>

      <div className="notice warn" style={{ marginBottom: 14 }}>
        Nur auf Privatgelände. Die Werte werden {device.demo ? 'im Demo-Modus nur angezeigt' : 'erst nach Bestätigung auf den Roller geschrieben'}.
      </div>

      <div className="card">
        <div className="row" style={{ borderBottom: 'none', paddingBottom: 4 }}>
          <div>
            <div className="r-label">Höchstgeschwindigkeit</div>
            <div className="r-desc">{tune.speedLimitKmh} km/h</div>
          </div>
        </div>
        <input
          type="range"
          min={5}
          max={model.tuneMaxKmh}
          step={1}
          value={tune.speedLimitKmh}
          onChange={(e) => onChange({ speedLimitKmh: clamp(Number(e.target.value), 5, model.tuneMaxKmh) })}
        />
        <div className="hint">
          Werk {model.stockLimitKmh} km/h · Maximum ~{model.tuneMaxKmh} km/h
        </div>

        <div className="row">
          <div>
            <div className="r-label">Fahrmodus</div>
            <div className="r-desc">Eco spart, Sport zieht an</div>
          </div>
          <Seg value={tune.driveMode} options={DRIVE_OPTS} onChange={(v) => onChange({ driveMode: v })} />
        </div>

        <div className="row">
          <div>
            <div className="r-label">Rekuperation (KERS)</div>
            <div className="r-desc">Bremsenergie zurückgewinnen</div>
          </div>
          <Seg value={tune.kers} options={KERS_OPTS} onChange={(v) => onChange({ kers: v })} />
        </div>

        <div className="row">
          <div>
            <div className="r-label">Tempomat</div>
            <div className="r-desc">Geschwindigkeit halten</div>
          </div>
          <Switch on={tune.cruiseControl} onToggle={() => onChange({ cruiseControl: !tune.cruiseControl })} />
        </div>

        {tune.cruiseControl && (
          <div className="row">
            <div>
              <div className="r-label">Tempomat aktivieren mit</div>
              <div className="r-desc">Tastenkombi am Roller</div>
            </div>
            <TriggerSelect value={tune.cruiseTrigger} onChange={(v) => onChange({ cruiseTrigger: v })} />
          </div>
        )}

        <div className="row">
          <div>
            <div className="r-label">Drossel-Umschaltung 🏁</div>
            <div className="r-desc">Per Kombi zwischen gedrosselt & Race+ wechseln</div>
          </div>
          <Switch on={tune.speedToggle} onToggle={() => onChange({ speedToggle: !tune.speedToggle })} />
        </div>

        {tune.speedToggle && (
          <>
            <div className="row">
              <div>
                <div className="r-label">Umschalten mit</div>
                <div className="r-desc">Kombi am Roller (nutzt die Fahrstufen)</div>
              </div>
              <TriggerSelect value={tune.speedToggleTrigger} onChange={(v) => onChange({ speedToggleTrigger: v })} />
            </div>
            <div className="row">
              <div>
                <div className="r-label">Gedrosselt</div>
                <div className="r-desc">legal, z. B. 22 km/h</div>
              </div>
              <NumInput
                value={tune.throttledKmh}
                min={10}
                max={model.tuneMaxKmh}
                onChange={(v) => onChange({ throttledKmh: v, raceKmh: Math.max(v, tune.raceKmh) })}
              />
            </div>
            <div className="row">
              <div>
                <div className="r-label">Race Mode +</div>
                <div className="r-desc">
                  {tune.raceDisguise ? `getarnt → fährt nur ${tune.throttledKmh} km/h` : 'voll — nur Privatgelände'}
                </div>
              </div>
              {tune.raceDisguise ? (
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, opacity: 0.65 }}>
                  🕵️ {tune.throttledKmh} km/h
                </span>
              ) : (
                <NumInput
                  value={tune.raceKmh}
                  min={tune.throttledKmh}
                  max={model.tuneMaxKmh}
                  onChange={(v) => onChange({ raceKmh: v })}
                />
              )}
            </div>
            <div className="row">
              <div>
                <div className="r-label">🕵️ Race-Modus tarnen</div>
                <div className="r-desc">Zeigt Race aktiv, hält aber {tune.throttledKmh} km/h</div>
              </div>
              <Switch on={tune.raceDisguise} onToggle={() => onChange({ raceDisguise: !tune.raceDisguise })} />
            </div>
            <p className="hint">
              Der Roller schaltet mit seiner Modus-Taste/Kombi zwischen den Werten. Pro Fahrstufe wird die
              Geschwindigkeit gesetzt (GearTopSpeed). Mit „tarnen" sieht der Race-Modus aktiv aus, bleibt aber
              bei {tune.throttledKmh} km/h — praktisch für Vorführung oder legal fahren.
            </p>
          </>
        )}

        <div className="row">
          <div>
            <div className="r-label">Zero Start</div>
            <div className="r-desc">Anfahren ohne Anschieben</div>
          </div>
          <Switch on={tune.zeroStart} onToggle={() => onChange({ zeroStart: !tune.zeroStart })} />
        </div>
      </div>

      <button className="primary" style={{ marginTop: 14, width: '100%' }} disabled>
        {device.demo ? 'Im Demo-Modus deaktiviert' : 'Auf Roller schreiben'}
      </button>
      <p className="hint">
        Das Schreiben aufs echte Gerät kommt als Nächstes — mit Sicherheitsabfrage vor jedem Schreibvorgang.
      </p>
    </section>
  )
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <span className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </span>
  )
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button className={'switch' + (on ? ' on' : '')} onClick={onToggle} aria-pressed={on}>
      <span className="knob" />
    </button>
  )
}

function TriggerSelect({ value, onChange }: { value: CruiseTrigger; onChange: (v: CruiseTrigger) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CruiseTrigger)}
      style={{
        background: 'var(--card2)',
        color: 'var(--text)',
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: '7px 10px',
        fontSize: 13,
      }}
    >
      {TRIGGER_OPTS.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  )
}

function NumInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(clamp(Number(e.target.value) || 0, min, max))}
      style={{
        width: 72,
        background: 'var(--card2)',
        color: 'var(--text)',
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: '7px 10px',
        fontSize: 14,
        fontFamily: 'ui-monospace, monospace',
        textAlign: 'right',
      }}
    />
  )
}
