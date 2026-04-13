import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Play, Square, Clock, AlertCircle } from 'lucide-react'
import { getUser, getUserHistory, getUserJobs } from '../api.js'
import UsageChart from '../components/UsageChart.jsx'
import TimeRangePicker from '../components/TimeRangePicker.jsx'
import CopyButton from '../components/CopyButton.jsx'
import RefreshButton from '../components/RefreshButton.jsx'
import { SkeletonCard, SkeletonTable } from '../components/Skeleton.jsx'
import { fmtMem, fmtElapsed, fmtTime } from '../utils/fmt.js'
import { useRefreshKey } from '../hooks/useRefreshKey.js'
import { useIsMobile } from '../hooks/useIsMobile.js'
import {
  colors, spacing, fontSize, fontWeight, radius,
  pageHeaderStyle, errorBannerStyle, emptyStateStyle,
  sectionStyle, sectionHeaderStyle, tabBarStyle, tabBtnStyle,
  tableHeaderStyle, tableCellStyle, cardStyle, badgeStyle,
  metricLabelStyle, metricValueStyle,
} from '../theme.js'

export default function UserDetailPage() {
  const { username } = useParams()
  const isMobile = useIsMobile()
  const [user, setUser] = useState(null)
  const [history, setHistory] = useState([])
  const [jobs, setJobs] = useState([])
  const [hours, setHours] = useState(24)
  const [tab, setTab] = useState('current')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, refresh] = useRefreshKey()

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
        if (!cancelled) { setError(err.message); setLoading(false) }
      }
    }
    setLoading(true)
    load()
    const id = setInterval(load, 10000)
    return () => { cancelled = true; clearInterval(id) }
  }, [username, hours, refreshKey])

  if (loading) {
    return (
      <div className="fade-in" style={{ padding: `${spacing.lg}px 0` }}>
        <div style={{ marginBottom: `${spacing.xl}px` }}>
          <Link to="/users" style={{ color: colors.accent.blue, fontSize: fontSize.md }}><ArrowLeft size={14} /> Back to Users</Link>
        </div>
        <SkeletonCard count={3} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="fade-in">
        <Link to="/users" style={{ color: colors.accent.blue, fontSize: fontSize.md }}><ArrowLeft size={14} /> Back to Users</Link>
        <div style={{ ...errorBannerStyle(), marginTop: `${spacing.lg}px` }}><AlertCircle size={16} /> Error: {error}</div>
      </div>
    )
  }

  const processes = user?.processes || []
  const rollups = user?.rollups || []
  const activeJobs = jobs.filter(j => j.active)
  const pastJobs = jobs.filter(j => !j.active)

  return (
    <div className="fade-in">
      <Link to="/users" style={{ color: colors.accent.blue, fontSize: fontSize.md, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <ArrowLeft size={14} /> Back to Users
      </Link>

      <div style={{ ...pageHeaderStyle(), margin: `${spacing.lg}px 0 ${spacing.xxl}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
          <h1 style={{ fontSize: fontSize.hero, fontWeight: fontWeight.bold, color: colors.accent.red }}>{username}</h1>
          <RefreshButton onRefresh={refresh} />
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
              pastJobs.forEach(j => lines.push(`  PID ${j.pid} on ${j.server} GPU ${j.gpu_index}: peak ${fmtMem(j.peak_gpu_mem_mb)}, ${fmtTime(j.first_seen)} -> ${fmtTime(j.last_seen)} (${fmtElapsed(j.duration_sec)}), cmd: ${j.cmd}`))
            }
            return lines.join('\n')
          }} />
        </div>
        <TimeRangePicker value={hours} onChange={setHours} />
      </div>

      {rollups.length > 0 && (
        <div style={{ marginBottom: `${spacing.xxl}px` }}>
          <h2 style={{ ...sectionHeaderStyle(), background: 'none', border: 'none', padding: `0 0 ${spacing.md}px`, position: 'static' }}>By Server</h2>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: `${spacing.md}px` }}>
            {rollups.map((r) => (
              <div key={r.server} style={cardStyle({ hoverable: false })}>
                <div style={{ color: colors.accent.blue, fontWeight: fontWeight.bold, marginBottom: `${spacing.sm}px` }}>{r.server}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div><span style={metricLabelStyle()}>GPUs</span> <span style={metricValueStyle()}>{r.gpu_count ?? 0}</span></div>
                  <div><span style={metricLabelStyle()}>VRAM</span> <span style={metricValueStyle()}>{fmtMem(r.total_gpu_mem_mb)}</span></div>
                  <div><span style={metricLabelStyle()}>CPU</span> <span style={metricValueStyle()}>{r.avg_cpu_pct != null ? `${Number(r.avg_cpu_pct).toFixed(1)}%` : '--'}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ ...sectionStyle(), marginBottom: `${spacing.xxl}px` }}>
          <div style={sectionHeaderStyle()}>Usage History</div>
          <div style={{ padding: `${spacing.lg}px` }}>
            <UsageChart
              data={history}
              lines={[
                { key: 'total_gpu_mem_mb', label: 'GPU Mem (MB)' },
                { key: 'avg_cpu_pct', label: 'CPU %' },
              ]}
              height={250}
            />
          </div>
        </div>
      )}

      <div style={tabBarStyle()}>
        <button className="tab-btn" style={tabBtnStyle(tab === 'current')} onClick={() => setTab('current')}>
          Current Processes ({processes.length})
        </button>
        <button className="tab-btn" style={tabBtnStyle(tab === 'jobs')} onClick={() => setTab('jobs')}>
          Job History ({jobs.length})
        </button>
      </div>

      {tab === 'current' && (
        <div style={{ ...sectionStyle(), overflow: 'hidden' }}>
          {processes.length === 0 ? (
            <div style={emptyStateStyle()}>No active processes</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['PID', 'Server', 'GPU', 'GPU Mem', 'CPU%', 'Elapsed', 'Command'].map((h) => (
                      <th key={h} style={tableHeaderStyle()}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {processes.map((p, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${colors.border.default}15` }}>
                      <td style={tableCellStyle(colors.accent.blue)}>{p.pid}</td>
                      <td style={tableCellStyle()}>{p.server}</td>
                      <td style={tableCellStyle()}>{p.gpu_index}</td>
                      <td style={tableCellStyle()}>{fmtMem(p.gpu_mem_mb)}</td>
                      <td style={tableCellStyle()}>{p.cpu_pct != null ? `${p.cpu_pct}%` : '--'}</td>
                      <td style={tableCellStyle(colors.text.secondary)}>{fmtElapsed(p.elapsed_sec)}</td>
                      <td style={{ ...tableCellStyle(colors.text.secondary), maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.cmd || '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'jobs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }}>
          {activeJobs.length > 0 && (
            <div>
              <h3 style={{ fontSize: fontSize.md, color: colors.status.healthy, marginBottom: `${spacing.sm}px`, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Active ({activeJobs.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
                {activeJobs.map((j) => <JobRow key={`${j.pid}-${j.server}`} job={j} />)}
              </div>
            </div>
          )}
          {pastJobs.length > 0 && (
            <div>
              <h3 style={{ fontSize: fontSize.md, color: colors.text.secondary, marginBottom: `${spacing.sm}px`, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Ended ({pastJobs.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
                {pastJobs.map((j) => <JobRow key={`${j.pid}-${j.server}`} job={j} />)}
              </div>
            </div>
          )}
          {jobs.length === 0 && <div style={emptyStateStyle()}>No jobs in this time range</div>}
        </div>
      )}
    </div>
  )
}

function JobRow({ job }) {
  const j = job
  return (
    <div style={{
      ...cardStyle({ hoverable: false }),
      borderLeft: `3px solid ${j.active ? colors.status.healthy : colors.text.muted}`,
      padding: `${spacing.md}px ${spacing.lg}px`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
          <span style={{ color: colors.accent.blue, fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>PID {j.pid}</span>
          <span style={{ color: colors.text.secondary, fontSize: fontSize.base }}>{j.server} / GPU {j.gpu_index}</span>
          {j.active && <span style={badgeStyle(colors.status.healthy)}><Play size={10} fill="currentColor" strokeWidth={0} /> running</span>}
        </div>
        <span style={{ color: colors.text.primary, fontSize: fontSize.base, fontWeight: fontWeight.semibold }}>
          peak {fmtMem(j.peak_gpu_mem_mb)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px 16px', fontSize: fontSize.sm, color: colors.text.secondary, flexWrap: 'wrap' }}>
        <div>Started: <span style={{ color: colors.text.primary }}>{fmtTime(j.first_seen)}</span></div>
        {!j.active && <div>Ended: <span style={{ color: colors.text.primary }}>{fmtTime(j.last_seen)}</span></div>}
        <div>Duration: <span style={{ color: colors.text.primary }}>{fmtElapsed(j.duration_sec)}</span></div>
        <div>CPU avg: <span style={{ color: colors.text.primary }}>{j.avg_cpu_pct != null ? `${Number(j.avg_cpu_pct).toFixed(1)}%` : '--'}</span></div>
        <div>Snaps: <span style={{ color: colors.text.primary }}>{j.snapshot_count}</span></div>
      </div>
      <div style={{ fontSize: fontSize.sm, color: colors.text.muted, marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {j.cmd || j.process_name || '--'}
      </div>
    </div>
  )
}
