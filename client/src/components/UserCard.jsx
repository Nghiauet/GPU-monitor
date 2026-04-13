import { useNavigate } from 'react-router-dom'
import { Circle } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile.js'
import { timeAgo } from '../utils/fmt.js'
import { colors, BORDER_ACCENT_COLORS, cardStyle, radius, spacing, fontSize, fontWeight, badgeStyle, metricLabelStyle, metricValueStyle } from '../theme.js'

export default function UserCard({ user, index = 0 }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const borderColor = BORDER_ACCENT_COLORS[index % BORDER_ACCENT_COLORS.length]

  const memGB = user.total_gpu_mem_mb
    ? (user.total_gpu_mem_mb / 1024).toFixed(1)
    : '0.0'

  const lastActive = timeAgo(user.last_active)
  const isActive = lastActive === 'active now'

  return (
    <div
      onClick={() => navigate(`/users/${encodeURIComponent(user.user)}`)}
      className="card-hover"
      style={{
        ...cardStyle({ selected: false, hoverable: true }),
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      <div style={{ marginBottom: `${spacing.md}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: borderColor, fontWeight: fontWeight.bold, fontSize: '15px' }}>
          {user.user}
        </span>
        {lastActive && (
          <span style={badgeStyle(isActive ? colors.status.healthy : colors.status.warning)}>
            {isActive && <Circle size={7} fill="currentColor" strokeWidth={0} />}
            {isActive ? 'active' : lastActive}
          </span>
        )}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
        gap: `${spacing.sm}px`,
      }}>
        <div>
          <div style={metricLabelStyle()}>GPUs</div>
          <div style={metricValueStyle()}>{user.gpu_count ?? 0}</div>
        </div>
        <div>
          <div style={metricLabelStyle()}>VRAM</div>
          <div style={metricValueStyle()}>{memGB} GB</div>
        </div>
        <div>
          <div style={metricLabelStyle()}>Servers</div>
          <div style={{ ...metricValueStyle(), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.servers || '--'}
          </div>
        </div>
        <div>
          <div style={metricLabelStyle()}>CPU</div>
          <div style={metricValueStyle()}>
            {user.avg_cpu_pct != null ? `${Number(user.avg_cpu_pct).toFixed(1)}%` : '--'}
          </div>
        </div>
      </div>
    </div>
  )
}
