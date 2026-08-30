import { useState } from 'react'
import { connectBle, connectBleDiag } from '../lib/ble'
import type { BleDiag, Transport } from '../lib/ble'
import { crackHandshake, diagAsTransport, runHandshake, scanPreComm } from '../lib/ninebot/link'
import { HandshakeSession } from '../lib/ninebot/handshake'
import { ScooterSim, makeBotFor } from '../lib/ninebot/simulator'
import { MODELS, findModel } from '../lib/models'
import type { Gen } from '../lib/crypto/nbcrypto'
import { fromHex, toHex } from '../lib/bytes'
import { clearSavedKey, loadSavedKey, saveKey } from '../lib/savedKeys'

// Verbinden UND Handshake in einem Rutsch — der ZT3 kappt eine untätige
// Verbindung sofort, deshalb darf keine Pause dazwischen sein.
export default function Zt3Handshake() {
  const supported = typeof navigator !== 'undefined' && 'bluetooth' in navigator
  // Gewinner-Kombi vom echten ZT3 «1K1DA2551P2788»: A5 · FW-Schlüssel · FW-Keystream · Nonce 0.
  const [sync2, setSync2] = useState(0xa5)
  const [gen, setGen] = useState<Gen>('gen2')
  const [preKey2Fw, setPreKey2Fw] = useState(true)
  const [authOffset, setAuthOffset] = useState(0)
  const [hitChannel, setHitChannel] = useState<string | null>(null)
  const [pwHex, setPwHex] = useState(loadSavedKey())
  const [derestrict, setDerestrict] = useState(true)
  const [speedKmh, setSpeedKmh] = useState(40)
  const [botId, setBotId] = useState('ninebot-f3-pro')
  const [flashFirst, setFlashFirst] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [outcome, setOutcome] = useState('')
  const [running, setRunning] = useState(false)

  const push = (line: string) => setLog((old) => [...old, line])
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  async function run() {
    setRunning(true)
    setOutcome('')
    setLog([])
    let cleanup = () => {}
    try {
      push('Verbinde … (Roller im Dialog wählen)')
      let transport: Transport
      let devName: string
      if (hitChannel) {
        // Wir kennen schon den Gewinner-Kanal aus dem Sweep — genau den nutzen.
        const diag = await connectBleDiag()
        devName = diag.name
        transport = diagAsTransport(diag, hitChannel)
        cleanup = () => diag.disconnect()
        push(`✓ Verbunden: ${devName} (Kanal ${hitChannel.slice(0, 8)})`)
      } else {
        const link = await connectBle()
        devName = link.name
        transport = link.transport
        cleanup = () => link.transport.disconnect()
        push('✓ Verbunden: ' + devName)
      }
      const name = new TextEncoder().encode(devName)
      const res = await runHandshake(transport, name, { sync2, gen, authOffset, preKey2Fw }, {
        onProgress: (p) => push((p.ok ? '✓ ' : '· ') + p.status),
        onWaitForButton: () => push('→ Jetzt die Ein/Aus-Taste KURZ mehrmals antippen (NICHT halten)!'),
        onSent: (b) => push('→ gesendet: ' + toHex(b)),
        onRecvRaw: (b) => push('← empfangen: ' + toHex(b)),
      })
      setOutcome((res.ok ? '✅ ' : '⚠️ ') + res.message)
    } catch (e) {
      setOutcome('❌ ' + errMsg(e))
    } finally {
      cleanup()
      setRunning(false)
    }
  }

  async function scan() {
    setRunning(true)
    setOutcome('')
    setLog([])
    let diag: BleDiag | null = null
    try {
      push('Verbinde für Kanal-Scan …')
      diag = await connectBleDiag()
      push(`✓ Verbunden: ${diag.name} — ${diag.writeChars.length} Schreib-Kanäle, lausche auf allen`)
      const name = new TextEncoder().encode(diag.name)
      const s = new HandshakeSession(name, { sync2, gen, authOffset, preKey2Fw })
      push('PRE_COMM: ' + toHex(s.preCommFrame()))
      const res = await scanPreComm(diag, s.preCommFrame(), { onLog: push })
      setOutcome(
        res.respondedOn.length
          ? '✅ Antwort auf Kanal: ' + res.respondedOn.map((u) => u.slice(0, 8)).join(', ')
          : '⚠️ Kein Kanal hat geantwortet — dann brauchen wir den Bluetooth-Mitschnitt.',
      )
    } catch (e) {
      setOutcome('❌ ' + errMsg(e))
    } finally {
      diag?.disconnect()
      setRunning(false)
    }
  }

  async function sweep() {
    setRunning(true)
    setOutcome('')
    setLog([])
    let diag: BleDiag | null = null
    try {
      push('ZT3 knacken: verbinde …')
      diag = await connectBleDiag()
      push(`✓ ${diag.name} — ${diag.writeChars.length} Kanäle`)
      const name = new TextEncoder().encode(diag.name)
      const clean = pwHex.replace(/[^0-9a-fA-F]/g, '')
      const pw = clean.length === 32 ? fromHex(clean) : undefined
      if (pw) push('🔑 Vorhandener Schlüssel wird genutzt (kein Reset nötig).')
      const out = await crackHandshake(
        diag,
        name,
        {
          onProgress: (p) => push((p.ok ? '✓ ' : '· ') + p.status),
          onWaitForButton: () => push('→ Jetzt die Ein/Aus-Taste KURZ mehrmals antippen (NICHT halten)!'),
          onSent: (b) => push('→ ' + toHex(b)),
          onRecvRaw: (b) => push('← ' + toHex(b)),
        },
        pw,
        derestrict ? speedKmh : undefined,
      )
      if (out.channel) setHitChannel(out.channel)
      setOutcome((out.ok ? '✅ ' : '⚠️ ') + out.message)
    } catch (e) {
      setOutcome('❌ ' + errMsg(e))
    } finally {
      diag?.disconnect()
      setRunning(false)
    }
  }

  // Kompletter Handshake gegen einen VIRTUELLEN ZT3 — kein echtes Gerät nötig.
  // Zeigt, dass unser Ablauf (PRE → SET_PWD → AUTH) end-to-end funktioniert, und
  // läuft in jedem Browser (auch iPhone). Der Sim übernimmt die aktuellen Schalter,
  // damit du live siehst, wie ein erfolgreicher Handshake aussieht.
  async function simTest() {
    setRunning(true)
    setOutcome('')
    setLog([])
    try {
      push('🧪 Virtueller ZT3 gestartet (kein echter Roller nötig) …')
      const btName = 'NBZT300000000'
      const sim = new ScooterSim({ btName, paired: false, sync2, gen, preKey2Fw, authOffset })
      const res = await runHandshake(sim.asTransport(), new TextEncoder().encode(btName), { sync2, gen, authOffset, preKey2Fw }, {
        onProgress: (p) => push((p.ok ? '✓ ' : '· ') + p.status),
        onSent: (b) => push('→ ' + toHex(b)),
        onRecvRaw: (b) => push('← ' + toHex(b)),
        timeoutMs: 1500,
      })
      setOutcome(
        (res.ok ? '✅ ' : '⚠️ ') +
          res.message +
          (res.ok ? ' — heißt: unser Handshake ist korrekt. Bleibt der ECHTE ZT3 stumm, liegt es an der Firmware, nicht an der App.' : ''),
      )
    } catch (e) {
      setOutcome('❌ ' + errMsg(e) + ' — bei diesen Schaltern bliebe auch der echte Roller stumm.')
    } finally {
      setRunning(false)
    }
  }

  // Echte Werte vom ECHTEN Roller auslesen — reines Lesen, null Risiko. Zeigt Firmware-
  // Max, aktuelles Limit, Rated Speed. So sehen wir die echten Zahlen statt zu raten.
  async function readReal() {
    setRunning(true)
    setOutcome('')
    setLog([])
    let diag: BleDiag | null = null
    try {
      push('Verbinde zum Auslesen (nur Lesen) …')
      diag = await connectBleDiag()
      push(`✓ ${diag.name} — ${diag.writeChars.length} Kanäle`)
      const name = new TextEncoder().encode(diag.name)
      const clean = pwHex.replace(/[^0-9a-fA-F]/g, '')
      const pw = clean.length === 32 ? fromHex(clean) : undefined
      const out = await crackHandshake(
        diag,
        name,
        {
          onProgress: (p) => push((p.ok ? '✓ ' : '· ') + p.status),
          onWaitForButton: () => push('→ Jetzt die Ein/Aus-Taste am Roller KURZ antippen!'),
          onSent: (b) => push('→ ' + toHex(b)),
          onRecvRaw: (b) => push('← ' + toHex(b)),
        },
        pw,
        undefined, // nicht entdrosseln
        false, // nicht flashen
        true, // NUR auslesen
      )
      if (out.readouts) out.readouts.forEach((line) => push('📖 ' + line))
      setOutcome((out.ok ? '✅ ' : '⚠️ ') + out.message)
    } catch (e) {
      setOutcome('❌ ' + errMsg(e))
    } finally {
      diag?.disconnect()
      setRunning(false)
    }
  }

  // Modell-Bot: kompletter Ablauf knacken → SET_PWD → AUTH → ENTDROSSELN gegen einen
  // virtuellen Roller des gewählten Modells. Zeigt live, ob das Limit greift (F3, G2/G3,
  // GT …) oder von der Firmware blockiert wird (ZT3). Kein echtes Gerät nötig.
  async function botDemo() {
    setRunning(true)
    setOutcome('')
    setLog([])
    try {
      const model = findModel(botId)
      const bot = model ? makeBotFor(model) : null
      if (!model || !bot) {
        setOutcome('⚠️ Für dieses Protokoll gibt es noch keinen Bot (nur verschlüsselte Ninebot der Gen 3).')
        return
      }
      push(`🤖 ${model.name}-Bot: Firmware ${bot.getFirmware()}, Limit ${bot.getSpeedLimit()} km/h.`)
      const out = await crackHandshake(
        bot.asDiag(),
        new TextEncoder().encode(bot.cfg.btName),
        {
          onProgress: (p) => push((p.ok ? '✓ ' : '· ') + p.status),
          onSent: (b) => push('→ ' + toHex(b)),
          onRecvRaw: (b) => push('← ' + toHex(b)),
          onWaitForButton: () => {},
          timeoutMs: 400,
        },
        undefined,
        speedKmh,
        flashFirst,
      )
      const after = bot.getSpeedLimit()
      push(`🏁 Firmware ${bot.getFirmware()} · Limit jetzt: ${after} km/h`)
      setOutcome(
        (out.ok ? '✅ ' : '⚠️ ') +
          (after >= speedKmh
            ? `${model.name}-Bot ENTDROSSELT: Limit → ${after} km/h${flashFirst ? ` (nach Firmware-Downgrade auf ${bot.getFirmware()})` : ''}.`
            : `${model.name}-Bot: Kanal offen, aber Limit bleibt ${after} km/h — Firmware ${bot.getFirmware()} blockt. Tipp: „Firmware-Downgrade" anhaken.`),
      )
    } catch (e) {
      setOutcome('❌ ' + errMsg(e))
    } finally {
      setRunning(false)
    }
  }

  async function deviceReport() {
    setRunning(true)
    setOutcome('')
    setLog([])
    let diag: BleDiag | null = null
    try {
      push('Verbinde für Geräte-Report …')
      diag = await connectBleDiag()
      push(`✓ ${diag.name} — GATT-Aufbau (${diag.report.length} Merkmale):`)
      for (const line of diag.report) push('  ' + line)
      setOutcome('Report fertig — schick mir die Liste (v.a. ob 0004 [notify] ✓sub dabei ist).')
    } catch (e) {
      setOutcome('❌ ' + errMsg(e))
    } finally {
      diag?.disconnect()
      setRunning(false)
    }
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="r-label" style={{ marginBottom: 8 }}>Handshake ausführen (echter Roller)</div>

      <div className="row">
        <div><div className="r-label">Generation (sync2)</div><div className="r-desc">ZT3 ist oft Gen2 — probier A5!</div></div>
        <span className="seg">
          <button className={sync2 === 0xb5 ? 'on' : ''} onClick={() => setSync2(0xb5)}>B5 · Gen3</button>
          <button className={sync2 === 0xa5 ? 'on' : ''} onClick={() => setSync2(0xa5)}>A5 · Gen2</button>
        </span>
      </div>

      <div className="row">
        <div><div className="r-label">FW_DATA im Schlüssel</div><div className="r-desc">ZT3 braucht das (PRE_COMM)</div></div>
        <span className="seg">
          <button className={preKey2Fw ? 'on' : ''} onClick={() => setPreKey2Fw(true)}>An</button>
          <button className={!preKey2Fw ? 'on' : ''} onClick={() => setPreKey2Fw(false)}>Aus</button>
        </span>
      </div>

      <div className="row">
        <div><div className="r-label">Keystream-Block</div><div className="r-desc">non-SN-Eingang</div></div>
        <span className="seg">
          <button className={gen === 'gen3' ? 'on' : ''} onClick={() => setGen('gen3')}>Null</button>
          <button className={gen === 'gen2' ? 'on' : ''} onClick={() => setGen('gen2')}>FW_DATA</button>
        </span>
      </div>

      <div className="row">
        <div><div className="r-label">Nonce-Bytes</div><div className="r-desc">welche 8 der Challenge</div></div>
        <span className="seg">
          <button className={authOffset === 0 ? 'on' : ''} onClick={() => setAuthOffset(0)}>0–7</button>
          <button className={authOffset === 8 ? 'on' : ''} onClick={() => setAuthOffset(8)}>8–15</button>
        </span>
      </div>

      <button className="primary" style={{ width: '100%', marginTop: 12, background: 'var(--good, #1f9d55)' }} disabled={running} onClick={simTest}>
        {running ? 'Läuft …' : '🧪 Gegen Simulator testen (ohne Roller)'}
      </button>
      <p className="hint">Beweist den Ablauf end-to-end — läuft in jedem Browser, kein Gerät nötig.</p>

      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <select
          value={botId}
          onChange={(e) => setBotId(e.target.value)}
          style={{
            flex: 1,
            minWidth: 140,
            padding: 9,
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'var(--card2)',
            color: 'var(--text)',
            fontSize: 14,
          }}
        >
          {MODELS.filter((m) => m.dialect === 'ninebot-enc2').map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.speedWritesBlocked ? ' (Firmware-Sperre)' : ''}
            </option>
          ))}
        </select>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={flashFirst} onChange={(e) => setFlashFirst(e.target.checked)} />
        <span>Vorher <b>Firmware-Downgrade</b> flashen <span className="r-desc">(nur Bot — löst die Sperre wie beim ZT3)</span></span>
      </label>
      <button className="primary" style={{ width: '100%', marginTop: 6, background: 'var(--good, #1f9d55)' }} disabled={running} onClick={botDemo}>
        {running ? 'Läuft …' : `🤖 Modell-Bot: ${flashFirst ? 'flashen, ' : ''}knacken & auf ${speedKmh} entdrosseln`}
      </button>
      <p className="hint">Virtueller Roller des gewählten Modells — zeigt live, ob das Limit greift, die Firmware blockt, oder ein Downgrade die Sperre löst.</p>

      <button className="primary" style={{ width: '100%', marginTop: 12 }} disabled={!supported || running} onClick={run}>
        {running ? 'Läuft …' : 'Verbinden & Handshake starten'}
      </button>
      <button className="ghost" style={{ width: '100%', marginTop: 8 }} disabled={!supported || running} onClick={scan}>
        Alle Kanäle scannen (Diagnose)
      </button>
      <div className="row" style={{ borderBottom: 'none' }}>
        <div>
          <div className="r-label">Vorhandener Schlüssel (hex)</div>
          <div className="r-desc">aus dem Handy-Backup — dann kein Reset/Kabel nötig</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <button className="ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => saveKey(pwHex)}>
          Auf diesem Gerät merken
        </button>
        <button
          className="ghost"
          style={{ fontSize: 12, padding: '5px 10px' }}
          onClick={() => {
            clearSavedKey()
            setPwHex('')
          }}
        >
          Vergessen
        </button>
      </div>
      <input
        type="text"
        value={pwHex}
        onChange={(e) => setPwHex(e.target.value)}
        placeholder="32 Hex-Zeichen …"
        spellCheck={false}
        style={{
          width: '100%',
          padding: 9,
          marginBottom: 4,
          borderRadius: 8,
          border: '1px solid var(--line)',
          background: 'var(--card2)',
          color: 'var(--text)',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 13,
        }}
      />

      <div className="row" style={{ marginTop: 6 }}>
        <div>
          <div className="r-label">Beim Knacken entdrosseln</div>
          <div className="r-desc">setzt Speed-Limit (Register 0x93). ~40 = Software-Max am ZT3.</div>
        </div>
        <span className="seg">
          <button className={derestrict ? 'on' : ''} onClick={() => setDerestrict(true)}>An</button>
          <button className={!derestrict ? 'on' : ''} onClick={() => setDerestrict(false)}>Aus</button>
        </span>
      </div>
      {derestrict && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <input
            type="number"
            min={15}
            max={70}
            value={speedKmh}
            onChange={(e) => setSpeedKmh(Math.max(15, Math.min(70, Number(e.target.value) || 0)))}
            style={{
              width: 90,
              padding: 9,
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--card2)',
              color: 'var(--text)',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 15,
            }}
          />
          <span className="r-desc">km/h — nur auf privatem Gelände!</span>
        </div>
      )}

      <button className="primary" style={{ width: '100%', marginTop: 8 }} disabled={!supported || running} onClick={sweep}>
        {running ? 'Läuft …' : derestrict ? `🔓🛴 ZT3 knacken & auf ${speedKmh} km/h entdrosseln` : '🔓 ZT3 automatisch knacken'}
      </button>
      <button className="ghost" style={{ width: '100%', marginTop: 8 }} disabled={!supported || running} onClick={readReal}>
        {running ? 'Läuft …' : '📖 Echte Werte auslesen (nur Lesen, kein Risiko)'}
      </button>
      <button className="ghost" style={{ width: '100%', marginTop: 8 }} disabled={!supported || running} onClick={deviceReport}>
        Geräte-Report (GATT-Aufbau zeigen)
      </button>
      {!supported && <p className="hint bad">Dieser Browser kann kein Web Bluetooth — nutze Chrome/Edge.</p>}

      {log.length > 0 && <pre className="rawlog" style={{ marginTop: 12 }}>{log.join('\n')}</pre>}
      {outcome && (
        <div className={'notice ' + (outcome.startsWith('✅') ? 'info' : 'warn')} style={{ marginTop: 10 }}>
          {outcome}
        </div>
      )}

      <p className="hint">
        Tipp: Vor dem Versuch Bluetooth auf allen anderen Handys ausschalten und den Roller neu starten
        (Ein-Partner-Regel). Klappt es nicht, verrät der Monitor oben, was der Roller sendet.
      </p>
    </div>
  )
}
