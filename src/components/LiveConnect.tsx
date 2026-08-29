import { useRef, useState } from 'react'
import { connectBle } from '../lib/ble'
import type { BleLink } from '../lib/ble'
import { toHex } from '../lib/bytes'

// Echte Web-Bluetooth-Verbindung + Roh-Datenmonitor. Das Auslesen/Tunen über
// das Protokoll kommt oben drauf — hier sehen wir erst mal, dass die Verbindung
// steht und was der Roller sendet (hilft beim Bau der Protokoll-Schicht).
export default function LiveConnect() {
  const supported = typeof navigator !== 'undefined' && 'bluetooth' in navigator
  const [link, setLink] = useState<BleLink | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const unsub = useRef<(() => void) | null>(null)

  async function connect() {
    setBusy(true)
    setStatus('Suche Roller … wähle ihn im Browser-Dialog aus.')
    try {
      const l = await connectBle()
      setLink(l)
      setStatus('Verbunden.')
      setLog([])
      unsub.current = l.transport.subscribe((chunk) => {
        setLog((old) => [toHex(chunk), ...old].slice(0, 40))
      })
    } catch (e) {
      setStatus('Nicht verbunden: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  function disconnect() {
    unsub.current?.()
    unsub.current = null
    link?.transport.disconnect()
    setLink(null)
    setStatus('Getrennt.')
    setLog([])
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="row" style={{ borderBottom: 'none', padding: 0 }}>
        <div>
          <div className="r-label">Per Bluetooth verbinden</div>
          <div className="r-desc">
            {supported
              ? 'Echte Verbindung zum Roller (Chrome/Edge).'
              : 'Dieser Browser kann kein Web Bluetooth — nutze Chrome/Edge (PC oder Android).'}
          </div>
        </div>
        {link ? (
          <button className="ghost" onClick={disconnect}>Trennen</button>
        ) : (
          <button className="primary" disabled={!supported || busy} onClick={connect}>
            {busy ? 'Suche …' : 'Verbinden'}
          </button>
        )}
      </div>

      {status && (
        <p className={'hint' + (link ? ' ok' : '')} style={{ marginBottom: 0 }}>
          {status}
        </p>
      )}

      {link && (
        <div style={{ marginTop: 10 }}>
          <div className="grid cols2">
            <div className="stat">
              <div className="s-label">Gerät</div>
              <div className="s-value" style={{ fontSize: 15 }}>{link.name}</div>
            </div>
            <div className="stat">
              <div className="s-label">Dienst</div>
              <div className="s-value" style={{ fontSize: 12 }}>{shortUuid(link.serviceUuid)}</div>
            </div>
            <div className="stat">
              <div className="s-label">Schreiben</div>
              <div className="s-value" style={{ fontSize: 12 }}>{shortUuid(link.writeUuid)}</div>
            </div>
            <div className="stat">
              <div className="s-label">Melden</div>
              <div className="s-value" style={{ fontSize: 12 }}>{shortUuid(link.notifyUuid)}</div>
            </div>
          </div>

          <div className="r-label" style={{ marginTop: 12, marginBottom: 6 }}>
            Empfangene Daten (roh)
          </div>
          {log.length === 0 ? (
            <p className="hint" style={{ marginTop: 0 }}>Noch nichts empfangen. (Roller sendet meist erst nach einer Anfrage.)</p>
          ) : (
            <pre className="rawlog">{log.join('\n')}</pre>
          )}
          <p className="hint">
            Das Lesen/Entdrosseln über das Protokoll kommt als Nächstes oben drauf.
          </p>
        </div>
      )}
    </div>
  )
}

function shortUuid(uuid: string): string {
  // 128-Bit-UUID kürzen, 16-Bit-Kurz-UUID ganz lassen.
  return uuid.length > 8 ? uuid.slice(0, 8) + '…' : uuid
}
