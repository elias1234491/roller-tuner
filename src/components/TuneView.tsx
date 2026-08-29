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
            <select
              value={tune.cruiseTrigger}
              onChange={(e) => onChange({ cruiseTrigger: e.target.value as CruiseTrigger })}
              style={{
                background: 'var(--card2)',
                color: 'var(--text)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '7px 10px',
                fontSize: 13,
              }}
            >
              <option value="halten">Gas halten (5 s)</option>
              <option value="blinker-links-2x">2× linker Blinker</option>
              <option value="blinker-rechts-2x">2× rechter Blinker</option>
              <option value="klingel-halten">Klingel halten</option>
            </select>
          </div>
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
