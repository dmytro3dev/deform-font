import type { CSSProperties } from 'react'

type Option<T extends string> = { id: T; label: string }

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="field slider">
      <span className="field-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <output>{display}</output>
    </label>
  )
}

export function RangeSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: [number, number]
  onChange: (value: [number, number]) => void
}) {
  const [lo, hi] = value
  return (
    <div className="field slider">
      <span className="field-label">{label}</span>
      <div className="dual" style={{ '--lo': lo, '--hi': hi } as CSSProperties}>
        <div className="dual-fill" />
        <input
          type="range"
          aria-label={`${label} lower`}
          min={0}
          max={1}
          step={0.01}
          value={lo}
          onChange={(e) => onChange([Math.min(+e.target.value, hi), hi])}
        />
        <input
          type="range"
          aria-label={`${label} upper`}
          min={0}
          max={1}
          step={0.01}
          value={hi}
          onChange={(e) => onChange([lo, Math.max(+e.target.value, lo)])}
        />
      </div>
      <output>
        {lo.toFixed(2)}–{hi.toFixed(2)}
      </output>
    </div>
  )
}
