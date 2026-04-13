import StatusIndicator from './StatusIndicator.jsx'
import { colors, cardStyle, spacing, fontSize, fontWeight, progressBarBg, progressBarFill, metricLabelStyle, metricValueStyle } from '../theme.js'

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
  const memPct = memUsed != null && memTotal != null && memTotal > 0
    ? (memUsed / memTotal) * 100 : null

  const memText = memUsed != null && memTotal != null
    ? `${(memUsed / 1024).toFixed(1)} / ${(memTotal / 1024).toFixed(1)} GB`
    : null

  return (
    <div
      onClick={onClick}
      className={onClick ? 'card-hover' : undefined}
      style={cardStyle({ selected, hoverable: !!onClick })}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, marginBottom: `${spacing.sm}px` }}>
        <StatusIndicator color={color} />
        <span style={{ color: colors.text.primary, fontWeight: fontWeight.bold, fontSize: '15px' }}>
          {server.name}
        </span>
        {server.hostname && (
          <span style={{ color: colors.text.muted, fontSize: fontSize.sm, marginLeft: 'auto' }}>
            {server.hostname}
          </span>
        )}
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px`, marginTop: `${spacing.md}px` }}>
        {cpuUser != null && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={metricLabelStyle()}>CPU</span>
              <span style={metricValueStyle()}>{Number(cpuUser).toFixed(1)}%</span>
            </div>
            <div style={progressBarBg()}>
              <div style={progressBarFill(cpuUser, cpuUser > 80 ? colors.status.critical : cpuUser > 50 ? colors.status.warning : colors.status.healthy)} />
            </div>
          </div>
        )}
        {memPct != null && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={metricLabelStyle()}>Memory</span>
              <span style={metricValueStyle()}>{memText}</span>
            </div>
            <div style={progressBarBg()}>
              <div style={progressBarFill(memPct, memPct > 80 ? colors.status.critical : colors.accent.blue)} />
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing.sm}px`, marginTop: '2px' }}>
          {load1 != null && (
            <div>
              <div style={metricLabelStyle()}>Load</div>
              <div style={metricValueStyle()}>{Number(load1).toFixed(2)}</div>
            </div>
          )}
          {cpuIdle != null && (
            <div>
              <div style={metricLabelStyle()}>Idle</div>
              <div style={{ ...metricValueStyle(), color: colors.status.healthy }}>{Number(cpuIdle).toFixed(1)}%</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
