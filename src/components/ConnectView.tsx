import type { Device, ScooterModel } from '../lib/types'
import { BRANDS, modelsByBrand } from '../lib/models'
import LiveConnect from './LiveConnect'

// Auswahl von Marke & Modell. Echte BLE-Suche folgt; bis dahin Demo pro Modell.
export default function ConnectView({
  device,
  onConnectDemo,
}: {
  device: Device | null
  onConnectDemo: (m: ScooterModel) => void
}) {
  return (
    <section>
      <h2 className="view-title">Roller verbinden</h2>
      <p className="view-sub">
        Marke &amp; Modell wählen. Zum Ausprobieren ohne Roller: Modell antippen (Demo).
      </p>

      <LiveConnect />

      {BRANDS.map((brand) => (
        <div className="brand-group" key={brand}>
          <h3>{brand}</h3>
          {modelsByBrand(brand).map((m) => (
            <button className="model" key={m.id} onClick={() => onConnectDemo(m)}>
              <span className="m-left">
                <span className="m-title">
                  <span className="m-name">{m.name}</span>
                  {m.encrypted && <span className="lock">🔒 verschlüsselt</span>}
                </span>
                <span className="m-sub">{m.notes ?? 'Auslesen & entdrosseln'}</span>
              </span>
              <span className="m-right">
                Werk {m.stockLimitKmh} km/h · bis ~{m.tuneMaxKmh} km/h
              </span>
            </button>
          ))}
        </div>
      ))}

      {device && (
        <p className="hint ok">
          Verbunden mit {device.model.name} — weiter im Reiter „Übersicht".
        </p>
      )}
    </section>
  )
}
