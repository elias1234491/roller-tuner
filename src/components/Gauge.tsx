// Runde Anzeige (Ring) für Tempo/Akku. Reines SVG, keine Abhängigkeit.
export default function Gauge({
  value,
  max,
  unit,
  caption,
  color,
}: {
  value: number
  max: number
  unit: string
  caption: string
  color: string
}) {
  const r = 46
  const circumference = 2 * Math.PI * r
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const dash = circumference * ratio

  return (
    <div className="gauge">
      <svg width="118" height="118" viewBox="0 0 120 120" role="img" aria-label={`${caption}: ${value} ${unit}`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#223042" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="58" textAnchor="middle" fontSize="24" fontWeight="700" fill="#e6edf3">
          {value < 10 ? value.toFixed(1) : Math.round(value)}
        </text>
        <text x="60" y="78" textAnchor="middle" fontSize="11" fill="#8b98a9">
          {unit}
        </text>
      </svg>
      <div className="g-cap">{caption}</div>
    </div>
  )
}
