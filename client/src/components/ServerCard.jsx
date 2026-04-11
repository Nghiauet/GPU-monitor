import StatusIndicator from './StatusIndicator.jsx'

function healthColor(server) {
  if (!server.enabled) return 'gray'
  if (server.last_error) return 'red'
  if (server.last_seen) {
    const ago = Date.now() - new Date(server.last_seen).getTime()
    if (ago < 120000) return 'green'
    if (ago < 600000) return 'yellow'
    return 'red'
  }
  return 'gray'
}

export default function ServerCard({ server, onClick, selected }) {
  const color = healthColor(server)
  const load1 = server.load_1 ?? server.load_avg_1 ?? null
  const cpuUser = server.cpu_user_pct ?? null
  const cpuIdle = server.cpu_idle_pct ?? null
  const memUsed = server.mem_used_mb ?? null
  const memTotal = server.mem_total_mb ?? null

  const memText = memUsed != null && memTotal != null
    ? `${(memUsed / 1024).toFixed(1)} / ${(memTotal / 1024).toFixed(1)} GB`
    : null

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
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.background = '#1e2d50' }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = '#16213e' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <StatusIndicator color={color} />
        <span style={{ color: '#e0e0e0', fontWeight: 700, fontSize: '15px' }}>
          {server.name}
        </span>
      </div>

      {/* Hostname */}
      {server.hostname && (
        <div style={{ color: '#888', fontSize: '11px', marginBottom: '10px' }}>
          {server.hostname}
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px' }}>
        {load1 != null && (
          <div>
            <span style={{ color: '#888' }}>Load: </span>
            <span style={{ color: '#e0e0e0' }}>{Number(load1).toFixed(2)}</span>
          </div>
        )}
        {cpuUser != null && (
          <div>
            <span style={{ color: '#888' }}>CPU: </span>
            <span style={{ color: '#e0e0e0' }}>{Number(cpuUser).toFixed(1)}%</span>
          </div>
        )}
        {cpuIdle != null && (
          <div>
            <span style={{ color: '#888' }}>Idle: </span>
            <span style={{ color: '#4ecca3' }}>{Number(cpuIdle).toFixed(1)}%</span>
          </div>
        )}
        {memText && (
          <div>
            <span style={{ color: '#888' }}>Mem: </span>
            <span style={{ color: '#e0e0e0' }}>{memText}</span>
          </div>
        )}
      </div>
    </div>
  )
}
