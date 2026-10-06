import { useEffect, useState } from 'react'

/** A number box that can be typed in freely ("1." and "" are fine while typing). */
export function NumberField(props: {
  value: number | undefined
  onChange: (value: number | undefined) => void
  allowEmpty?: boolean
  placeholder?: string
  label: string
}): React.JSX.Element {
  const { value, onChange, allowEmpty = false, placeholder, label } = props
  const [text, setText] = useState(value === undefined ? '' : String(value))

  useEffect(() => {
    const parsed = text.trim() === '' ? undefined : Number(text)
    if (parsed !== value) setText(value === undefined ? '' : String(value))
    // Only outside changes matter here; typing is handled in onChange.
  }, [value])

  return (
    <input
      className="fx-number"
      aria-label={label}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => {
        const next = e.target.value
        setText(next)
        if (next.trim() === '') {
          if (allowEmpty) onChange(undefined)
          return
        }
        const parsed = Number(next)
        if (Number.isFinite(parsed)) onChange(parsed)
      }}
      onBlur={() => setText(value === undefined ? '' : String(value))}
    />
  )
}

export function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  unit?: string
  onChange: (value: number) => void
}): React.JSX.Element {
  const { label, value, min, max, unit = '', onChange } = props
  return (
    <label className="fx-slider">
      <span>
        {label}
        <b>
          {value}
          {unit}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
