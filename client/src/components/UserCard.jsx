import { useNavigate } from 'react-router-dom'

const BORDER_COLORS = ['#e94560', '#4ecca3', '#4fc3f7', '#f5a623', '#bb86fc']

export default function UserCard({ user, index = 0 }) {
  const navigate = useNavigate()
  const borderColor = BORDER_COLORS[index % BORDER_COLORS.length]

  const memGB = user.total_gpu_mem_mb
    ? (user.total_gpu_mem_mb / 1024).toFixed(1)
    : '0.0'

  return (
    <div
      onClick={() => navigate(`/users/${encodeURIComponent(user.username)}`)}
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
      <div style={{ marginBottom: '10px' }}>
        <span style={{ color: borderColor, fontWeight: 700, fontSize: '15px' }}>
          {user.username}
        </span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
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
            {user.server_count ?? (user.servers?.length ?? 0)}
          </span>{' '}
          Servers
        </div>
        <div>
          <span style={{ color: '#e0e0e0', fontWeight: 600 }}>
            {user.avg_cpu_pct != null ? `${Number(user.avg_cpu_pct).toFixed(1)}%` : '—'}
          </span>{' '}
          CPU avg
        </div>
      </div>
    </div>
  )
}
