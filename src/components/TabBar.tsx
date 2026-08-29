import type { Tab } from '../lib/types'

const TABS: { id: Tab; label: string; icon: string; needsDevice: boolean }[] = [
  { id: 'verbinden', label: 'Verbinden', icon: '🔗', needsDevice: false },
  { id: 'uebersicht', label: 'Übersicht', icon: '📊', needsDevice: true },
  { id: 'tunen', label: 'Tunen', icon: '⚙️', needsDevice: true },
  { id: 'zt3', label: 'ZT3', icon: '🔐', needsDevice: false },
  { id: 'info', label: 'Info', icon: 'ℹ️', needsDevice: false },
]

export default function TabBar({
  tab,
  onChange,
  hasDevice,
}: {
  tab: Tab
  onChange: (t: Tab) => void
  hasDevice: boolean
}) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => {
        const disabled = t.needsDevice && !hasDevice
        return (
          <button
            key={t.id}
            className={'tab' + (tab === t.id ? ' active' : '')}
            disabled={disabled}
            onClick={() => onChange(t.id)}
          >
            <span className="tab-ico" aria-hidden>
              {t.icon}
            </span>
            <span className="tab-lbl">{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
