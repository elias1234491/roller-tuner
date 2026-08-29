import { useState } from 'react'
import type { Device, ScooterModel, Tab, TuneSettings } from './lib/types'
import { demoDevice } from './lib/demo'
import SafetyBanner from './components/SafetyBanner'
import TabBar from './components/TabBar'
import ConnectView from './components/ConnectView'
import DashboardView from './components/DashboardView'
import TuneView from './components/TuneView'
import Zt3View from './components/Zt3View'
import InfoView from './components/InfoView'

export default function App() {
  const [tab, setTab] = useState<Tab>('verbinden')
  const [device, setDevice] = useState<Device | null>(null)

  function connectDemo(model: ScooterModel) {
    setDevice(demoDevice(model))
    setTab('uebersicht')
  }

  function disconnect() {
    setDevice(null)
    setTab('verbinden')
  }

  function updateTune(patch: Partial<TuneSettings>) {
    setDevice((d) => (d ? { ...d, tune: { ...d.tune, ...patch } } : d))
  }

  return (
    <div className="app">
      <header className="app-head">
        <div className="brand">🛴 Roller-Tuner</div>
        {device && (
          <div className="head-right">
            <span className="dev-tag">
              {device.demo ? 'Demo' : 'Live'} · {device.model.brand} {device.model.name}
            </span>
            <button className="ghost" onClick={disconnect}>Trennen</button>
          </div>
        )}
      </header>

      <SafetyBanner />

      <main className="app-main">
        {tab === 'verbinden' && <ConnectView device={device} onConnectDemo={connectDemo} />}
        {tab === 'uebersicht' && <DashboardView device={device} />}
        {tab === 'tunen' && <TuneView device={device} onChange={updateTune} />}
        {tab === 'zt3' && <Zt3View device={device} />}
        {tab === 'info' && <InfoView />}
      </main>

      <TabBar tab={tab} onChange={setTab} hasDevice={!!device} />
    </div>
  )
}
