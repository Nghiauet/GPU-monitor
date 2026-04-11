import { useState, useEffect } from 'react'
import { getUsers, getServers } from '../api.js'
import UserCard from '../components/UserCard.jsx'
import TimeRangePicker from '../components/TimeRangePicker.jsx'
import CopyButton from '../components/CopyButton.jsx'

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [servers, setServers] = useState([])
  const [serverFilter, setServerFilter] = useState('')
  const [hours, setHours] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load server list once
  useEffect(() => {
    getServers()
      .then((data) => setServers(Array.isArray(data) ? data : (data.servers || [])))
      .catch(() => {})
  }, [])

  // Poll users
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
  }, [serverFilter, hours])

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#e0e0e0' }}>Active GPU Users</h1>
          <CopyButton getText={() => {
            if (users.length === 0) return 'No active GPU users'
            const lines = users.map(u =>
              `${u.user}: ${u.gpu_count} GPUs, ${(u.total_gpu_mem_mb / 1024).toFixed(1)} GB VRAM, CPU avg ${Number(u.avg_cpu_pct).toFixed(1)}%, servers: ${u.servers || '—'}`
            )
            return `Active GPU Users (${new Date().toISOString()})\n${lines.join('\n')}`
          }} />
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Server filter */}
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
          <TimeRangePicker value={hours} onChange={setHours} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: '#e94560', background: '#2a1a1a', border: '1px solid #e94560', borderRadius: '6px', padding: '10px', marginBottom: '16px' }}>
          Error: {error}
        </div>
      )}

      {/* User list */}
      {loading ? (
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
      )}
    </div>
  )
}
