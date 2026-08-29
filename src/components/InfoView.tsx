export default function InfoView() {
  return (
    <section>
      <h2 className="view-title">ℹ️ Info &amp; Grenzen</h2>
      <p className="view-sub">Ehrlich, was die App kann — und was nicht.</p>

      <div className="notice warn" style={{ marginBottom: 14 }}>
        <b>Rechtslage (Deutschland):</b> E-Scooter sind bis 20 km/h zugelassen. Wer schneller fährt,
        verliert auf öffentlichen Straßen Betriebserlaubnis und Versicherungsschutz und macht sich ggf.
        strafbar. Diese App ist zum Schrauben am <b>eigenen</b> Roller auf <b>Privatgelände</b> gedacht.
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="r-label" style={{ marginBottom: 6 }}>Was die App kann</div>
        <ul className="plain">
          <li>Xiaomi, Ninebot und Navee auslesen (Akku, Tempo, Firmware …).</li>
          <li>Höchstgeschwindigkeit, Fahrmodi, Rekuperation, Tempomat einstellen.</li>
          <li>ZT3 Pro / Gen-3-Ninebot: den Enc2-Auth-Handshake nachbauen.</li>
          <li>Alles lokal im Browser — kein Server, kein Konto, keine Daten verlassen das Gerät.</li>
        </ul>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="r-label" style={{ marginBottom: 6 }}>Grenzen — ehrlich</div>
        <ul className="plain">
          <li>Bluetooth geht nur in <b>Chrome/Edge</b> (PC oder Android). <b>Safari/iPhone</b> können kein Web Bluetooth.</li>
          <li>Ein <b>gekoppelter</b> ZT3 lehnt ein neues Sitzungspasswort ab — er muss evtl. zuerst zurückgesetzt werden (Unlock-Kabel/SHU).</li>
          <li>Kein Firmware-Flashen, kein Bootloader-/Signatur-Bruch — das Brick-Risiko überlassen wir fertigen Tools.</li>
          <li>Navee ist schlechter dokumentiert — erst zuverlässig auslesen, bevor geschrieben wird.</li>
          <li>Falsche Schreibwerte können Hardware beschädigen. Im Zweifel: nicht schreiben.</li>
        </ul>
      </div>

      <div className="card">
        <div className="r-label" style={{ marginBottom: 6 }}>Quellen &amp; Vorbild</div>
        <p className="hint" style={{ marginTop: 0 }}>
          Die Protokolle stammen aus offener Doku der Scooter-Hacking-Gemeinde (ScooterHacking Utility,
          m365-Reverse-Engineering, das dokumentierte Ninebot-Enc2). Nachgebaut, nicht kopiert.
        </p>
      </div>
    </section>
  )
}
