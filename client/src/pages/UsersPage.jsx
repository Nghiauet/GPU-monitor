import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUsers, getServers, getUsersSummary, getAllUsersHistory } from '../api.js'
import UserCard from '../components/UserCard.jsx'
import UsageChart from '../components/UsageChart.jsx'
import TimeRangePicker from '../components/TimeRangePicker.jsx'
import CopyButton from '../components/CopyButton.jsx'
import RefreshButton from '../components/RefreshButton.jsx'
import { fmtMem, fmtTime, tabStyle } from '../utils/fmt.js'
import { useRefreshKey } from '../hooks/useRefreshKey.js'

export default function UsersPage() {
  const [tab, setTab] = useState('active') // 'active' | 'history'
  const [users, setUsers] = useState([])
  const [servers, setServers] = useState([])
  const [serverFilter, setServerFilter] = useState('')
  const [hours, setHours] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [refreshKey, refresh] = useRefreshKey()

  // History tab state
  const [summary, setSummary] = useState([])
  const [historyData, setHistoryData] = useState([])
  const [historyHours, setHistoryHours] = useState(24)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState(null)

  const navigate = useNavigate()

  // Load server list once
  useEffect(() => {
    getServers()
      .then((data) => setServers(Array.isArray(data) ? data : (data.servers || [])))
      .catch(() => {})
  }, [])

  // Poll active users
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
  }, [serverFilter, hours, refreshKey])

  // Load history data when history tab is selected
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
        if (!cancelled) {
          setHistoryError(err.message)
          setHistoryLoading(false)
        }
      }
    }

    setHistoryLoading(true)
    load()
    const id = setInterval(load, 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [tab, historyHours, serverFilter, refreshKey])

  // Pivot history data for chart: { ts, user1_mem, user2_mem, ... }
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
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#e0e0e0' }}>GPU Users</h1>
          <RefreshButton onRefresh={refresh} />
          <CopyButton getText={() => {
            if (tab === 'active') {
              if (users.length === 0) return 'No active GPU users'
              const lines = users.map(u =>
                `${u.user}: ${u.gpu_count} GPUs, ${(u.total_gpu_mem_mb / 1024).toFixed(1)} GB VRAM, CPU avg ${Number(u.avg_cpu_pct).toFixed(1)}%, servers: ${u.servers || '—'}`
              )
              return `Active GPU Users (${new Date().toISOString()})\n${lines.join('\n')}`
            } else {
              if (summary.length === 0) return 'No user history data'
              const lines = summary.map(u =>
                `${u.user}: peak ${fmtMem(u.peak_gpu_mem_mb)}, avg ${fmtMem(u.avg_gpu_mem_mb)}, max ${u.max_gpu_count} GPUs, CPU avg ${Number(u.avg_cpu_pct).toFixed(1)}%, servers: ${u.servers || '—'}, ${fmtTime(u.first_seen)} → ${fmtTime(u.last_seen)}, ${u.snapshot_count} snapshots`
              )
              return `User Usage History (${new Date().toISOString()}, last ${historyHours}h)\n${lines.join('\n')}`
            }
          }} />
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={serverFilter}
            onChange={(e) => setServerFilter(e.target.value)}
            style={{
              background: '#16213e',
              color: '#e0e0e0',
              border: '1px solid #2a3a5c',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '12px',
            }}
          >
            <option value="">All Servers</option>
            {servers.map((s) => (
              <option key={s.name || s} value={s.name || s}>
                {s.name || s}
              </option>
            ))}
          </select>
          <TimeRangePicker
            value={tab === 'active' ? hours : historyHours}
            onChange={tab === 'active' ? setHours : setHistoryHours}
          />
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid #2a3a5c' }}>
        <button style={tabStyle(tab === 'active')} onClick={() => setTab('active')}>
          Active Now ({users.length})
        </button>
        <button style={tabStyle(tab === 'history')} onClick={() => setTab('history')}>
          Usage History {summary.length > 0 ? `(${summary.length})` : ''}
        </button>
      </div>

      {/* Error */}
      {((tab === 'active' && error) || (tab === 'history' && historyError)) && (
        <div style={{ color: '#e94560', background: '#2a1a1a', border: '1px solid #e94560', borderRadius: '6px', padding: '10px', marginBottom: '16px' }}>
          Error: {tab === 'active' ? error : historyError}
        </div>
      )}

      {/* Active tab */}
      {tab === 'active' && (
        loading ? (
          <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>Loading...</div>
        ) : users.length === 0 ? (
          <div style={{ color: '#888', padding: '40px', textAlign: 'center', fontSize: '14px' }}>
            No active GPU users
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {users.map((user, i) => (
              <UserCard key={user.user} user={user} index={i} />
            ))}
          </div>
        )
      )}

      {/* History tab */}
      {tab === 'history' && (
        historyLoading ? (
          <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>Loading...</div>
        ) : (
          <div>
            {chartData.data.length > 0 && (
              <div style={{ background: '#16213e', border: '1px solid #2a3a5c', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '14px', color: '#888', marginBottom: '12px', fontWeight: 600 }}>
                  GPU MEMORY USAGE (GB) — TOP USERS
                </h2>
                <UsageChart
                  data={chartData.data}
                  lines={chartData.lines}
                  height={300}
                />
              </div>
            )}

            {summary.length === 0 ? (
              <div style={{ color: '#888', padding: '40px', textAlign: 'center', fontSize: '14px' }}>
                No user data in this time range
              </div>
            ) : (
              <div style={{ background: '#16213e', border: '1px solid #2a3a5c', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #2a3a5c' }}>
                        {['User', 'Peak VRAM', 'Avg VRAM', 'Max GPUs', 'Avg CPU%', 'Servers', 'First Seen', 'Last Seen', 'Snapshots'].map((h) => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#888', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map((u) => (
                        <tr
                          key={u.user}
                          onClick={() => navigate(`/users/${encodeURIComponent(u.user)}`)}
                          style={{ borderBottom: '1px solid #1a2540', cursor: 'pointer' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#1e2d50')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '10px 12px', color: '#4fc3f7', fontWeight: 600 }}>{u.user}</td>
                          <td style={{ padding: '10px 12px', color: '#e0e0e0' }}>{fmtMem(u.peak_gpu_mem_mb)}</td>
                          <td style={{ padding: '10px 12px', color: '#e0e0e0' }}>{fmtMem(u.avg_gpu_mem_mb)}</td>
                          <td style={{ padding: '10px 12px', color: '#e0e0e0' }}>{u.max_gpu_count ?? '—'}</td>
                          <td style={{ padding: '10px 12px', color: '#e0e0e0' }}>
                            {u.avg_cpu_pct != null ? `${Number(u.avg_cpu_pct).toFixed(1)}%` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#888' }}>{u.servers || '—'}</td>
                          <td style={{ padding: '10px 12px', color: '#888' }}>{fmtTime(u.first_seen)}</td>
                          <td style={{ padding: '10px 12px', color: '#888' }}>{fmtTime(u.last_seen)}</td>
                          <td style={{ padding: '10px 12px', color: '#888' }}>{u.snapshot_count}</td>
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
