import type { Device } from '../lib/types'
import Gauge from './Gauge'
import { batteryColor, formatKm, formatVolt } from '../lib/format'

export default function DashboardView({ device }: { device: Device | null }) {
  if (!device) {
    return (
      <div className="empty">
        <div className="big">🔗</div>
        Noch kein Roller verbunden.
        <br />
        Geh auf den Reiter „Verbinden".
      </div>
    )
  }

  const t = device.telemetry
  const m = device.model

  return (
    <section>
      <h2 className="view-title">Übersicht</h2>
      <p className="view-sub">
        {m.brand} {m.name} · {device.demo ? 'Demo-Daten' : 'Live'}
      </p>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="gauge-wrap">
          <Gauge value={t.speedKmh} max={m.tuneMaxKmh} unit="km/h" caption="Tempo" color="#2f81f7" />
          <Gauge value={t.batteryPct} max={100} unit="%" caption="Akku" color={batteryColor(t.batteryPct)} />
        </div>
      </div>

      <div className="grid cols3">
        <Stat label="Spannung" value={t.voltage != null ? formatVolt(t.voltage) : '—'} />
        <Stat label="Temperatur" value={t.tempC != null ? `${t.tempC} °C` : '—'} />
        <Stat label="Gesamt" value={t.odometerKm != null ? formatKm(t.odometerKm) : '—'} />
        <Stat label="Aktuelle Fahrt" value={t.tripKm != null ? formatKm(t.tripKm) : '—'} />
        <Stat label="Firmware" value={t.firmware ?? '—'} />
        <Stat label="Seriennummer" value={t.serial ?? '—'} />
      </div>

      {device.demo && (
        <p className="hint">
          Demo-Werte. Beim echten Roller stehen hier die live ausgelesenen Daten.
        </p>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="s-label">{label}</div>
      <div className="s-value">{value}</div>
    </div>
  )
}
