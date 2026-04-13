import { colors, radius, fontSize, fontWeight, transition } from '../theme.js'

const RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
]

export default function TimeRangePicker({ value, onChange }) {
  return (
    <div style={{
      display: 'inline-flex',
      background: colors.bg.input,
      borderRadius: radius.md,
      padding: '2px',
      border: `1px solid ${colors.border.default}`,
    }}>
      {RANGES.map(({ label, hours }) => {
        const active = value === hours
        return (
          <button
            key={hours}
            onClick={() => onChange(hours)}
            style={{
              padding: '5px 12px',
              background: active ? colors.accent.red : 'transparent',
              color: active ? '#fff' : colors.text.secondary,
              border: 'none',
              borderRadius: radius.sm,
              fontSize: fontSize.base,
              fontWeight: active ? fontWeight.semibold : fontWeight.normal,
              cursor: 'pointer',
              transition: `all ${transition.fast}`,
              lineHeight: 1.2,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
