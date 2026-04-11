const RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
]

export default function TimeRangePicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {RANGES.map(({ label, hours }) => {
        const active = value === hours
        return (
          <button
            key={hours}
            onClick={() => onChange(hours)}
            style={{
              padding: '4px 10px',
              background: active ? '#e94560' : '#16213e',
              color: active ? '#fff' : '#888',
              border: '1px solid',
              borderColor: active ? '#e94560' : '#2a3a5c',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
