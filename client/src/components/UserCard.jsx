import { useNavigate } from 'react-router-dom'

const BORDER_COLORS = ['#e94560', '#4ecca3', '#4fc3f7', '#f5a623', '#bb86fc']

function timeAgo(isoStr) {
  if (!isoStr) return null
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'active now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function UserCard({ user, index = 0 }) {
  const navigate = useNavigate()
  const borderColor = BORDER_COLORS[index % BORDER_COLORS.length]

  const memGB = user.total_gpu_mem_mb
    ? (user.total_gpu_mem_mb / 1024).toFixed(1)
    : '0.0'

  const lastActive = timeAgo(user.last_active)
  const isActive = lastActive === 'active now'

  return (
    <div
      onClick={() => navigate(`/users/${encodeURIComponent(user.user)}`)}
      style={{
        background: '#16213e',
        border: '1px solid #2a3a5c',
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: '8px',
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#1e2d50')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '#16213e')}
    >
      <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: borderColor, fontWeight: 700, fontSize: '15px' }}>
          {user.user}
        </span>
        {lastActive && (
          <span style={{
            fontSize: '11px',
            color: isActive ? '#4ecca3' : '#f5a623',
            background: isActive ? 'rgba(78,204,163,0.1)' : 'rgba(245,166,35,0.1)',
            padding: '2px 8px',
            borderRadius: '10px',
          }}>
            {isActive ? '● active' : lastActive}
          </span>
        )}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr',
        gap: '6px',
        fontSize: '12px',
        color: '#888',
      }}>
        <div>
          <span style={{ color: '#e0e0e0', fontWeight: 600 }}>
            {user.gpu_count ?? 0}
          </span>{' '}
          GPUs
        </div>
        <div>
          <span style={{ color: '#e0e0e0', fontWeight: 600 }}>
            {memGB} GB
          </span>{' '}
          VRAM
        </div>
        <div>
          <span style={{ color: '#e0e0e0', fontWeight: 600 }}>
            {user.servers || '—'}
          </span>
        </div>
        <div>
          <span style={{ color: '#e0e0e0', fontWeight: 600 }}>
            {user.avg_cpu_pct != null ? `${Number(user.avg_cpu_pct).toFixed(1)}%` : '—'}
          </span>{' '}
          CPU
        </div>
      </div>
    </div>
  )
}
