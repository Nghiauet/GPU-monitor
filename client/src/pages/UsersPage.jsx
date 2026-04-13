import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, AlertCircle } from 'lucide-react'
import { getUsers, getServers, getUsersSummary, getAllUsersHistory } from '../api.js'
import UserCard from '../components/UserCard.jsx'
import UsageChart from '../components/UsageChart.jsx'
import TimeRangePicker from '../components/TimeRangePicker.jsx'
import CopyButton from '../components/CopyButton.jsx'
import RefreshButton from '../components/RefreshButton.jsx'
import { SkeletonCard, SkeletonTable } from '../components/Skeleton.jsx'
import { fmtMem, fmtTime } from '../utils/fmt.js'
import { useRefreshKey } from '../hooks/useRefreshKey.js'
import {
  colors, spacing, fontSize, fontWeight, radius,
  selectStyle, pageHeaderStyle, pageTitleStyle, errorBannerStyle,
  emptyStateStyle, tabBarStyle, tabBtnStyle, sectionStyle, sectionHeaderStyle,
  tableHeaderStyle, tableCellStyle,
} from '../theme.js'

export default function UsersPage() {
  const [tab, setTab] = useState('active')
  const [users, setUsers] = useState([])
  const [servers, setServers] = useState([])
  const [serverFilter, setServerFilter] = useState('')
  const [hours, setHours] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, refresh] = useRefreshKey()

  const [summary, setSummary] = useState([])
  const [historyData, setHistoryData] = useState([])
  const [historyHours, setHistoryHours] = useState(24)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState(null)

  const navigate = useNavigate()

  useEffect(() => {
    getServers()
      .then((data) => setServers(Array.isArray(data) ? data : (data.servers || [])))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const params = {}
        if (serverFilter) params.server = serverFilter
        const from = new Date(Date.now() - hours * 3600 * 1000).toISOString()
        params.from = from
        const data = await getUsers(params)
        if (!cancelled) {
          setUsers(Array.isArray(data) ? data : (data.users || []))
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
  }, [serverFilter, hours, refreshKey])

  useEffect(() => {
    if (tab !== 'history') return
    let cancelled = false
    async function load() {
      try {
        const from = new Date(Date.now() - historyHours * 3600 * 1000).toISOString()
        const params = { from }
        if (serverFilter) params.server = serverFilter
        const [summaryData, histData] = await Promise.all([
          getUsersSummary(params),
          getAllUsersHistory(params),
        ])
        if (!cancelled) {
          setSummary(Array.isArray(summaryData) ? summaryData : [])
          setHistoryData(Array.isArray(histData) ? histData : [])
          setHistoryError(null)
          setHistoryLoading(false)
        }
      } catch (err) {
        if (!cancelled) { setHistoryError(err.message); setHistoryLoading(false) }
      }
    }
    setHistoryLoading(true)
    load()
    const id = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(id) }
  }, [tab, historyHours, serverFilter, refreshKey])

  const chartData = useMemo(() => {
    if (historyData.length === 0) return { data: [], lines: [] }
    const userTotals = {}
    for (const row of historyData) {
      userTotals[row.user] = (userTotals[row.user] || 0) + (row.total_gpu_mem_mb || 0)
    }
    const topUsers = Object.entries(userTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([u]) => u)
    const topSet = new Set(topUsers)
    const byTs = {}
    for (const row of historyData) {
      if (!topSet.has(row.user)) continue
      if (!byTs[row.ts_utc]) byTs[row.ts_utc] = { ts: row.ts_utc }
      byTs[row.ts_utc][row.user] = Math.round((row.total_gpu_mem_mb || 0) / 1024 * 10) / 10
    }
    const data = Object.values(byTs).sort((a, b) => a.ts.localeCompare(b.ts))
    const lines = topUsers.map(u => ({ key: u, label: u }))
    return { data, lines }
  }, [historyData])

  return (
    <div className="fade-in">
      <div style={pageHeaderStyle()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
          <h1 style={{ ...pageTitleStyle(), display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}><Users size={22} strokeWidth={2} /> GPU Users</h1>
          <RefreshButton onRefresh={refresh} />
          <CopyButton getText={() => {
            if (tab === 'active') {
              if (users.length === 0) return 'No active GPU users'
              const lines = users.map(u =>
                `${u.user}: ${u.gpu_count} GPUs, ${fmtMem(u.total_gpu_mem_mb)} VRAM, CPU avg ${Number(u.avg_cpu_pct).toFixed(1)}%, servers: ${u.servers || '--'}`
              )
              return `Active GPU Users (${new Date().toISOString()})\n${lines.join('\n')}`
            } else {
              if (summary.length === 0) return 'No user history data'
              const lines = summary.map(u =>
                `${u.user}: peak ${fmtMem(u.peak_gpu_mem_mb)}, avg ${fmtMem(u.avg_gpu_mem_mb)}, max ${u.max_gpu_count} GPUs, CPU avg ${Number(u.avg_cpu_pct).toFixed(1)}%, servers: ${u.servers || '--'}, ${fmtTime(u.first_seen)} -> ${fmtTime(u.last_seen)}, ${u.snapshot_count} snapshots`
              )
              return `User Usage History (${new Date().toISOString()}, last ${historyHours}h)\n${lines.join('\n')}`
            }
          }} />
        </div>
        <div style={{ display: 'flex', gap: `${spacing.md}px`, alignItems: 'center' }}>
          <select
            value={serverFilter}
            onChange={(e) => setServerFilter(e.target.value)}
            style={{ ...selectStyle(), width: 'auto', minWidth: '120px' }}
          >
            <option value="">All Servers</option>
            {servers.map((s) => (
              <option key={s.name || s} value={s.name || s}>{s.name || s}</option>
            ))}
          </select>
          <TimeRangePicker
            value={tab === 'active' ? hours : historyHours}
            onChange={tab === 'active' ? setHours : setHistoryHours}
          />
        </div>
      </div>

      <div style={tabBarStyle()}>
        <button className="tab-btn" style={tabBtnStyle(tab === 'active')} onClick={() => setTab('active')}>
          Active Now ({users.length})
        </button>
        <button className="tab-btn" style={tabBtnStyle(tab === 'history')} onClick={() => setTab('history')}>
          Usage History {summary.length > 0 ? `(${summary.length})` : ''}
        </button>
      </div>

      {((tab === 'active' && error) || (tab === 'history' && historyError)) && (
        <div style={errorBannerStyle()}>
          <AlertCircle size={16} /> Error: {tab === 'active' ? error : historyError}
        </div>
      )}

      {tab === 'active' && (
        loading ? (
          <SkeletonCard count={4} />
        ) : users.length === 0 ? (
          <div style={emptyStateStyle()}>No active GPU users</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
            {users.map((user, i) => (
              <UserCard key={user.user} user={user} index={i} />
            ))}
          </div>
        )
      )}

      {tab === 'history' && (
        historyLoading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : (
          <div>
            {chartData.data.length > 0 && (
              <div style={{ ...sectionStyle(), marginBottom: `${spacing.xl}px` }}>
                <div style={sectionHeaderStyle()}>
                  GPU Memory Usage (GB) -- Top Users
                </div>
                <div style={{ padding: `${spacing.lg}px` }}>
                  <UsageChart data={chartData.data} lines={chartData.lines} height={300} />
                </div>
              </div>
            )}

            {summary.length === 0 ? (
              <div style={emptyStateStyle()}>No user data in this time range</div>
            ) : (
              <div style={{ ...sectionStyle(), overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['User', 'Peak VRAM', 'Avg VRAM', 'Max GPUs', 'Avg CPU%', 'Servers', 'First Seen', 'Last Seen', 'Snaps'].map((h) => (
                          <th key={h} style={tableHeaderStyle()}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map((u) => (
                        <tr
                          key={u.user}
                          onClick={() => navigate(`/users/${encodeURIComponent(u.user)}`)}
                          className="table-row-hover"
                          style={{ borderBottom: `1px solid ${colors.border.default}15`, cursor: 'pointer' }}
                        >
                          <td style={tableCellStyle(colors.accent.blue)}><span style={{ fontWeight: fontWeight.semibold }}>{u.user}</span></td>
                          <td style={tableCellStyle()}>{fmtMem(u.peak_gpu_mem_mb)}</td>
                          <td style={tableCellStyle()}>{fmtMem(u.avg_gpu_mem_mb)}</td>
                          <td style={tableCellStyle()}>{u.max_gpu_count ?? '--'}</td>
                          <td style={tableCellStyle()}>
                            {u.avg_cpu_pct != null ? `${Number(u.avg_cpu_pct).toFixed(1)}%` : '--'}
                          </td>
                          <td style={tableCellStyle(colors.text.secondary)}>{u.servers || '--'}</td>
                          <td style={tableCellStyle(colors.text.secondary)}>{fmtTime(u.first_seen)}</td>
                          <td style={tableCellStyle(colors.text.secondary)}>{fmtTime(u.last_seen)}</td>
                          <td style={tableCellStyle(colors.text.secondary)}>{u.snapshot_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}
