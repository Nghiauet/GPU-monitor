import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getUser, getUserHistory } from '../api.js'
import UsageChart from '../components/UsageChart.jsx'
import TimeRangePicker from '../components/TimeRangePicker.jsx'
import CopyButton from '../components/CopyButton.jsx'

function fmtMem(mb) {
  if (mb == null) return '—'
  return `${(mb / 1024).toFixed(1)} GB`
}

function fmtElapsed(secs) {
  if (secs == null) return '—'
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

export default function UserDetailPage() {
  const { username } = useParams()
  const [user, setUser] = useState(null)
  const [history, setHistory] = useState([])
  const [hours, setHours] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const from = new Date(Date.now() - hours * 3600 * 1000).toISOString()
        const [userData, histData] = await Promise.all([
          getUser(username),
          getUserHistory(username, { from }),
        ])
        if (!cancelled) {
          setUser(userData)
          const hist = Array.isArray(histData) ? histData : (histData.history || histData.data || [])
          setHistory(hist)
          setError(null)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    setLoading(true)
    load()
    const id = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [username, hours])

  if (loading) {
    return <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>Loading...</div>
  }

  if (error) {
    return (
      <div>
        <Link to="/users" style={{ color: '#4fc3f7', fontSize: '13px' }}>← Back to Users</Link>
        <div style={{ color: '#e94560', marginTop: '16px' }}>Error: {error}</div>
      </div>
    )
  }

  const processes = user?.processes || []
  const rollups = user?.rollups || []

  return (
    <div>
      {/* Back link */}
      <Link to="/users" style={{ color: '#4fc3f7', fontSize: '13px' }}>
        ← Back to Users
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#e94560' }}>
            {username}
          </h1>
          <CopyButton getText={() => {
            const lines = [`User: ${username} (${new Date().toISOString()})`]
            rollups.forEach(r => {
              lines.push(`  ${r.server}: ${r.gpu_count} GPUs, ${fmtMem(r.total_gpu_mem_mb)} VRAM, CPU avg ${Number(r.avg_cpu_pct).toFixed(1)}%`)
            })
            if (processes.length > 0) {
              lines.push('Processes:')
              processes.forEach(p => {
                lines.push(`  PID ${p.pid} on ${p.server} GPU ${p.gpu_index}: ${fmtMem(p.gpu_mem_mb)} VRAM, CPU ${p.cpu_pct}%, ${fmtElapsed(p.elapsed_sec)}, cmd: ${p.cmd || '—'}`)
              })
            }
            return lines.join('\n')
          }} />
        </div>
        <TimeRangePicker value={hours} onChange={setHours} />
      </div>

      {/* Server rollup cards */}
      {rollups.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', color: '#888', marginBottom: '10px', fontWeight: 600 }}>
            BY SERVER
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
            {rollups.map((r) => (
              <div key={r.server} style={{
                background: '#16213e',
                border: '1px solid #2a3a5c',
                borderRadius: '8px',
                padding: '12px 14px',
              }}>
                <div style={{ color: '#4fc3f7', fontWeight: 600, marginBottom: '8px' }}>{r.server}</div>
                <div style={{ fontSize: '12px', color: '#888', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>GPUs: <span style={{ color: '#e0e0e0' }}>{r.gpu_count ?? 0}</span></div>
                  <div>VRAM: <span style={{ color: '#e0e0e0' }}>{fmtMem(r.total_gpu_mem_mb)}</span></div>
                  <div>CPU: <span style={{ color: '#e0e0e0' }}>{r.avg_cpu_pct != null ? `${Number(r.avg_cpu_pct).toFixed(1)}%` : '—'}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History chart */}
      {history.length > 0 && (
        <div style={{ background: '#16213e', border: '1px solid #2a3a5c', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', color: '#888', marginBottom: '12px', fontWeight: 600 }}>
            USAGE HISTORY
          </h2>
          <UsageChart
            data={history}
            lines={[
              { key: 'total_gpu_mem_mb', label: 'GPU Mem (MB)' },
              { key: 'avg_cpu_pct', label: 'CPU %' },
            ]}
            height={250}
          />
        </div>
      )}

      {/* Process table */}
      <div style={{ background: '#16213e', border: '1px solid #2a3a5c', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #2a3a5c' }}>
          <h2 style={{ fontSize: '14px', color: '#888', fontWeight: 600 }}>PROCESSES</h2>
        </div>
        {processes.length === 0 ? (
          <div style={{ color: '#888', padding: '20px', textAlign: 'center' }}>No active processes</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2a3a5c' }}>
                  {['PID', 'Server', 'GPU', 'GPU Mem', 'CPU%', 'Elapsed', 'Command'].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#888', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {processes.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1a2540' }}>
                    <td style={{ padding: '8px 12px', color: '#4fc3f7' }}>{p.pid}</td>
                    <td style={{ padding: '8px 12px', color: '#e0e0e0' }}>{p.server}</td>
                    <td style={{ padding: '8px 12px', color: '#e0e0e0' }}>{p.gpu_index ?? p.gpu}</td>
                    <td style={{ padding: '8px 12px', color: '#e0e0e0' }}>{fmtMem(p.gpu_mem_mb)}</td>
                    <td style={{ padding: '8px 12px', color: '#e0e0e0' }}>{p.cpu_pct != null ? `${p.cpu_pct}%` : '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#888' }}>{fmtElapsed(p.elapsed_sec)}</td>
                    <td style={{ padding: '8px 12px', color: '#888', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.command || p.cmd || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
