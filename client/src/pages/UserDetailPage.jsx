import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getUser, getUserHistory, getUserJobs } from '../api.js'
import UsageChart from '../components/UsageChart.jsx'
import TimeRangePicker from '../components/TimeRangePicker.jsx'
import CopyButton from '../components/CopyButton.jsx'

function fmtMem(mb) {
  if (mb == null) return '—'
  return `${(mb / 1024).toFixed(1)} GB`
}

function fmtElapsed(secs) {
  if (secs == null || secs === 0) return '—'
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h < 24) return `${h}h ${m}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function UserDetailPage() {
  const { username } = useParams()
  const [user, setUser] = useState(null)
  const [history, setHistory] = useState([])
  const [jobs, setJobs] = useState([])
  const [hours, setHours] = useState(24)
  const [tab, setTab] = useState('current') // 'current' | 'jobs'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const from = new Date(Date.now() - hours * 3600 * 1000).toISOString()
        const [userData, histData, jobsData] = await Promise.all([
          getUser(username),
          getUserHistory(username, { from }),
          getUserJobs(username, { from }),
        ])
        if (!cancelled) {
          setUser(userData)
          setHistory(Array.isArray(histData) ? histData : [])
          setJobs(Array.isArray(jobsData) ? jobsData : [])
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
  const activeJobs = jobs.filter(j => j.active)
  const pastJobs = jobs.filter(j => !j.active)

  const tabStyle = (active) => ({
    padding: '6px 16px',
    fontSize: '13px',
    border: 'none',
    borderBottom: active ? '2px solid #e94560' : '2px solid transparent',
    background: 'transparent',
    color: active ? '#e0e0e0' : '#888',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  })

  return (
    <div>
      <Link to="/users" style={{ color: '#4fc3f7', fontSize: '13px' }}>← Back to Users</Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#e94560' }}>{username}</h1>
          <CopyButton getText={() => {
            const lines = [`User: ${username} (${new Date().toISOString()})`]
            rollups.forEach(r => {
              lines.push(`  ${r.server}: ${r.gpu_count} GPUs, ${fmtMem(r.total_gpu_mem_mb)} VRAM, CPU avg ${Number(r.avg_cpu_pct).toFixed(1)}%`)
            })
            if (activeJobs.length > 0) {
              lines.push(`Active jobs: ${activeJobs.length}`)
              activeJobs.forEach(j => lines.push(`  PID ${j.pid} on ${j.server} GPU ${j.gpu_index}: peak ${fmtMem(j.peak_gpu_mem_mb)}, since ${fmtTime(j.first_seen)}, cmd: ${j.cmd}`))
            }
            if (pastJobs.length > 0) {
              lines.push(`Past jobs: ${pastJobs.length}`)
              pastJobs.forEach(j => lines.push(`  PID ${j.pid} on ${j.server} GPU ${j.gpu_index}: peak ${fmtMem(j.peak_gpu_mem_mb)}, ${fmtTime(j.first_seen)} → ${fmtTime(j.last_seen)} (${fmtElapsed(j.duration_sec)}), cmd: ${j.cmd}`))
            }
            return lines.join('\n')
          }} />
        </div>
        <TimeRangePicker value={hours} onChange={setHours} />
      </div>

      {/* Server rollup cards */}
      {rollups.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', color: '#888', marginBottom: '10px', fontWeight: 600 }}>BY SERVER</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
            {rollups.map((r) => (
              <div key={r.server} style={{ background: '#16213e', border: '1px solid #2a3a5c', borderRadius: '8px', padding: '12px 14px' }}>
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
          <h2 style={{ fontSize: '14px', color: '#888', marginBottom: '12px', fontWeight: 600 }}>USAGE HISTORY</h2>
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

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid #2a3a5c' }}>
        <button style={tabStyle(tab === 'current')} onClick={() => setTab('current')}>
          Current Processes ({processes.length})
        </button>
        <button style={tabStyle(tab === 'jobs')} onClick={() => setTab('jobs')}>
          Job History ({jobs.length})
        </button>
      </div>

      {/* Current processes tab */}
      {tab === 'current' && (
        <div style={{ background: '#16213e', border: '1px solid #2a3a5c', borderRadius: '8px', overflow: 'hidden' }}>
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
                      <td style={{ padding: '8px 12px', color: '#e0e0e0' }}>{p.gpu_index}</td>
                      <td style={{ padding: '8px 12px', color: '#e0e0e0' }}>{fmtMem(p.gpu_mem_mb)}</td>
                      <td style={{ padding: '8px 12px', color: '#e0e0e0' }}>{p.cpu_pct != null ? `${p.cpu_pct}%` : '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#888' }}>{fmtElapsed(p.elapsed_sec)}</td>
                      <td style={{ padding: '8px 12px', color: '#888', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.cmd || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Job history tab */}
      {tab === 'jobs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Active jobs */}
          {activeJobs.length > 0 && (
            <div>
              <h3 style={{ fontSize: '13px', color: '#4ecca3', marginBottom: '8px', fontWeight: 600 }}>
                ACTIVE ({activeJobs.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {activeJobs.map((j) => (
                  <JobRow key={`${j.pid}-${j.server}`} job={j} />
                ))}
              </div>
            </div>
          )}

          {/* Past jobs */}
          {pastJobs.length > 0 && (
            <div>
              <h3 style={{ fontSize: '13px', color: '#888', marginBottom: '8px', fontWeight: 600 }}>
                ENDED ({pastJobs.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {pastJobs.map((j) => (
                  <JobRow key={`${j.pid}-${j.server}`} job={j} />
                ))}
              </div>
            </div>
          )}

          {jobs.length === 0 && (
            <div style={{ color: '#888', padding: '20px', textAlign: 'center' }}>No jobs in this time range</div>
          )}
        </div>
      )}
    </div>
  )
}

function JobRow({ job }) {
  const j = job
  return (
    <div style={{
      background: '#16213e',
      border: '1px solid #2a3a5c',
      borderLeft: `3px solid ${j.active ? '#4ecca3' : '#666'}`,
      borderRadius: '6px',
      padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#4fc3f7', fontSize: '13px', fontWeight: 600 }}>PID {j.pid}</span>
          <span style={{ color: '#888', fontSize: '12px' }}>{j.server} / GPU {j.gpu_index}</span>
          {j.active && (
            <span style={{ fontSize: '10px', color: '#4ecca3', background: 'rgba(78,204,163,0.1)', padding: '1px 6px', borderRadius: '8px' }}>
              running
            </span>
          )}
        </div>
        <span style={{ color: '#e0e0e0', fontSize: '12px' }}>
          peak {fmtMem(j.peak_gpu_mem_mb)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#888' }}>
        <div>Started: <span style={{ color: '#e0e0e0' }}>{fmtTime(j.first_seen)}</span></div>
        {!j.active && (
          <div>Ended: <span style={{ color: '#e0e0e0' }}>{fmtTime(j.last_seen)}</span></div>
        )}
        <div>Duration: <span style={{ color: '#e0e0e0' }}>{fmtElapsed(j.duration_sec)}</span></div>
        <div>CPU avg: <span style={{ color: '#e0e0e0' }}>{j.avg_cpu_pct != null ? `${Number(j.avg_cpu_pct).toFixed(1)}%` : '—'}</span></div>
        <div>Snapshots: <span style={{ color: '#e0e0e0' }}>{j.snapshot_count}</span></div>
      </div>
      <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {j.cmd || j.process_name || '—'}
      </div>
    </div>
  )
}
