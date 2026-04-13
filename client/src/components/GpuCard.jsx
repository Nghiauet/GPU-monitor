import { Thermometer } from 'lucide-react'
import { colors, cardStyle, radius, fontSize, fontWeight, spacing, transition, progressBarBg, progressBarFill, metricLabelStyle, metricValueStyle } from '../theme.js'

function utilColor(pct) {
  if (pct == null) return colors.text.muted
  if (pct < 50) return colors.status.healthy
  if (pct < 80) return colors.status.warning
  return colors.status.critical
}

export default function GpuCard({ gpu, onClick, selected }) {
  const util = gpu.gpu_util_pct ?? gpu.util_pct ?? null
  const vramUsed = gpu.mem_used_mb ?? gpu.vram_used_mb ?? null
  const vramTotal = gpu.mem_total_mb ?? gpu.vram_total_mb ?? null
  const temp = gpu.temp_c ?? gpu.temperature_c ?? null
  const vramPct = vramUsed != null && vramTotal != null && vramTotal > 0
    ? (vramUsed / vramTotal) * 100 : null

  const vramText = vramUsed != null && vramTotal != null
    ? `${(vramUsed / 1024).toFixed(1)} / ${(vramTotal / 1024).toFixed(1)} GB`
    : '--'

  return (
    <div
      onClick={onClick}
      className={onClick ? 'card-hover' : undefined}
      style={cardStyle({ selected, hoverable: !!onClick })}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: `${spacing.md}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
          <span style={{ color: colors.accent.blue, fontWeight: fontWeight.bold, fontSize: fontSize.lg }}>
            {gpu.server}
          </span>
          <span style={{ color: colors.text.muted }}>/</span>
          <span style={{ color: colors.text.secondary, fontSize: fontSize.base }}>GPU {gpu.gpu_index ?? gpu.idx ?? 0}</span>
        </div>
        {temp != null && (
          <span style={{
            color: temp > 80 ? colors.status.critical : temp > 65 ? colors.status.warning : colors.text.secondary,
            fontSize: fontSize.base,
            fontWeight: fontWeight.semibold,
            background: temp > 80 ? `${colors.status.critical}15` : 'transparent',
            padding: '2px 8px',
            borderRadius: radius.pill,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}>
            <Thermometer size={13} strokeWidth={2} />
            {temp}°C
          </span>
        )}
      </div>

      {/* GPU name */}
      <div style={{ color: colors.text.secondary, fontSize: fontSize.base, marginBottom: `${spacing.md}px` }}>
        {gpu.gpu_name || gpu.name || 'Unknown GPU'}
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
        {/* Utilization bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={metricLabelStyle()}>Util</span>
            <span style={{ ...metricValueStyle(), color: utilColor(util) }}>
              {util != null ? `${util}%` : '--'}
            </span>
          </div>
          <div style={progressBarBg()}>
            <div style={progressBarFill(util, utilColor(util))} />
          </div>
        </div>

        {/* VRAM bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={metricLabelStyle()}>VRAM</span>
            <span style={metricValueStyle()}>{vramText}</span>
          </div>
          {vramPct != null && (
            <div style={progressBarBg()}>
              <div style={progressBarFill(vramPct, colors.accent.blue)} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
