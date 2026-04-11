function utilColor(pct) {
  if (pct == null) return '#888'
  if (pct < 50) return '#4ecca3'
  if (pct < 80) return '#f5a623'
  return '#e94560'
}

export default function GpuCard({ gpu, onClick, selected }) {
  const util = gpu.gpu_util_pct ?? gpu.util_pct ?? null
  const vramUsed = gpu.mem_used_mb ?? gpu.vram_used_mb ?? null
  const vramTotal = gpu.mem_total_mb ?? gpu.vram_total_mb ?? null
  const temp = gpu.temp_c ?? gpu.temperature_c ?? null

  const vramText = vramUsed != null && vramTotal != null
    ? `${(vramUsed / 1024).toFixed(1)} / ${(vramTotal / 1024).toFixed(1)} GB`
    : '—'

  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? '#1e2d50' : '#16213e',
        border: `1px solid ${selected ? '#e94560' : '#2a3a5c'}`,
        borderRadius: '8px',
        padding: '14px 16px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.background = '#1e2d50'
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = '#16213e'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div>
          <span style={{ color: '#4fc3f7', fontWeight: 600 }}>
            {gpu.server}
          </span>
          <span style={{ color: '#888', margin: '0 4px' }}>/</span>
          <span style={{ color: '#888' }}>GPU {gpu.gpu_index ?? gpu.idx ?? 0}</span>
        </div>
        {temp != null && (
          <span style={{ color: temp > 80 ? '#e94560' : '#888', fontSize: '12px' }}>
            {temp}°C
          </span>
        )}
      </div>

      {/* GPU name */}
      <div style={{ color: '#e0e0e0', fontSize: '12px', marginBottom: '10px' }}>
        {gpu.gpu_name || gpu.name || 'Unknown GPU'}
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* Utilization bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ color: '#888', fontSize: '11px' }}>Util</span>
            <span style={{ color: utilColor(util), fontSize: '11px', fontWeight: 600 }}>
              {util != null ? `${util}%` : '—'}
            </span>
          </div>
          <div style={{ background: '#2a3a5c', borderRadius: '2px', height: '4px' }}>
            <div style={{
              width: `${Math.min(util ?? 0, 100)}%`,
              height: '100%',
              background: utilColor(util),
              borderRadius: '2px',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>

        {/* VRAM */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#888', fontSize: '11px' }}>VRAM</span>
          <span style={{ color: '#e0e0e0', fontSize: '11px' }}>{vramText}</span>
        </div>
      </div>
    </div>
  )
}
