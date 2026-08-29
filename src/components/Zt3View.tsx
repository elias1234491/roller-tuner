import type { Device } from '../lib/types'
import Zt3Handshake from './Zt3Handshake'

// Eigener Reiter für den ZT3 Pro (und andere Gen-3-Ninebot mit "Enc2").
// Erklärt ehrlich, was der Handshake macht und wo die Grenze liegt.
const STEPS: { title: string; desc: string }[] = [
  {
    title: 'PRE_COMM — Kanal öffnen',
    desc: 'Erstkontakt, Schlüssel aus Gerätename + Challenge ableiten. (Beim echten ZT3 lief dieser Schritt schon.)',
  },
  {
    title: 'SET_PWD — Sitzungspasswort setzen',
    desc: 'Neuer Schlüssel für diese Sitzung. Ein bereits gekoppelter ZT3 (index=01) lehnt das ab — dann Roller zuerst zurücksetzen/entkoppeln.',
  },
  {
    title: 'AUTH — Freischalten',
    desc: 'Nach erfolgreichem Passwort ist der Bus offen: lesen und die Fahrstufe (Register 0x31) schreiben = entdrosseln.',
  },
]

export default function Zt3View({ device }: { device: Device | null }) {
  const isEnc2 = device?.model.dialect === 'ninebot-enc2'

  return (
    <section>
      <h2 className="view-title">🔐 ZT3 Pro &amp; Gen-3-Ninebot</h2>
      <p className="view-sub">Die verschlüsselten Ninebot („Encryption2"). Der ehrgeizige Teil.</p>

      {device && !isEnc2 && (
        <div className="notice info" style={{ marginBottom: 14 }}>
          Aktuell verbunden: {device.model.name} — der spricht <b>nicht</b> Enc2, du brauchst diesen Reiter dafür nicht.
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="r-label" style={{ marginBottom: 8 }}>So läuft der Handshake</div>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="step-dot">{i + 1}</span>
              <span className="step-body">
                <div className="st-title">{s.title}</div>
                <div className="st-desc">{s.desc}</div>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="notice warn">
        <b>Ehrlich:</b> Wir bauen die <b>Authentifizierung</b> nach (öffentlich dokumentiert) — keinen
        Bootloader- oder Signatur-Bruch (Brick-Risiko). Ein frisch zurückgesetzter ZT3 lässt sich so
        entdrosseln; ein fest gekoppelter braucht evtl. ein Reset per Unlock-Kabel/SHU oder einen echten
        Bluetooth-Mitschnitt, um die letzte Lücke zu schließen. Alles nur auf Privatgelände.
      </div>

      <Zt3Handshake />

      <p className="hint">
        Krypto (AES-128, SHA, CCM) und der 3-Schritt-Handshake sind gebaut und byte-genau gegen die
        Referenz getestet (42 Tests). Für den echten ZT3 fehlt nur noch ein Bluetooth-Mitschnitt, der die
        Schalter oben festlegt.
      </p>
    </section>
  )
}
