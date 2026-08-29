import { useState } from 'react'

// Immer sichtbarer Sicherheits- und Rechtshinweis. Lässt sich einklappen,
// bleibt aber als kleiner Balken erreichbar.
export default function SafetyBanner() {
  const [open, setOpen] = useState(true)

  if (!open) {
    return (
      <button className="safety-mini" onClick={() => setOpen(true)}>
        ⚠︎ Rechtliches &amp; Sicherheit anzeigen
      </button>
    )
  }

  return (
    <div className="safety" role="note">
      <strong>⚠︎ Nur auf privatem Gelände.</strong> Ein entdrosselter Roller
      verliert im öffentlichen Straßenverkehr die Betriebserlaubnis und den
      Versicherungsschutz (&gt; 20 km/h). Nutze das nur an deinen eigenen
      Rollern und abseits öffentlicher Straßen. Falsche Schreibwerte können
      Motor, Steuergerät oder Akku beschädigen.
      <br />
      <button className="safety-close" onClick={() => setOpen(false)}>
        Verstanden
      </button>
    </div>
  )
}
