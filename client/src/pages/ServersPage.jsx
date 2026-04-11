import { useState, useEffect } from 'react'
import { getServers, getServerHistory } from '../api.js'
import ServerCard from '../components/ServerCard.jsx'
import TimeRangePicker from '../components/TimeRangePicker.jsx'
import UsageChart from '../components/UsageChart.jsx'
import CopyButton from '../components/CopyButton.jsx'
import RefreshButton from '../components/RefreshButton.jsx'
import { useRefreshKey } from '../hooks/useRefreshKey.js'

export default function ServersPage() {
  const [servers, setServers] = useState([])
  const [hours, setHours] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [chartData, setChartData] = useState([])
  const [chartLoading, setChartLoading] = useState(false)
  const [refreshKey, refresh] = useRefreshKey()

  // Poll servers
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await getServers()
        if (!cancelled) {
          setServers(Array.isArray(data) ? data : (data.servers || []))
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
  }, [refreshKey])

  // Load chart on selection
  useEffect(() => {
    if (!selected) {
      setChartData([])
      return
    }
    let cancelled = false
    setChartLoading(true)

    const from = new Date(Date.now() - hours * 3600 * 1000).toISOString()
    getServerHistory(selected, { from })
      .then((data) => {
        if (!cancelled) {
          setChartData(Array.isArray(data) ? data : (data.history || data.data || []))
          setChartLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setChartLoading(false)
      })

    return () => { cancelled = true }
  }, [selected, hours])

  function handleCardClick(server) {
    setSelected((prev) => prev === server.name ? null : server.name)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#e0e0e0' }}>Servers</h1>
          <RefreshButton onRefresh={refresh} />
          <CopyButton getText={() => {
            if (servers.length === 0) return 'No server data'
            const lines = servers.map(s => {
              const hs = s.host_summary
              if (!hs) return `${s.name} (${s.hostname}): no data`
              return `${s.name} (${hs.hostname || s.hostname}): load ${hs.load_1}/${hs.load_5}/${hs.load_15}, CPU usr ${hs.cpu_user_pct}% idle ${hs.cpu_idle_pct}%, mem ${Math.round(hs.mem_used_mb/1024)}/${Math.round(hs.mem_total_mb/1024)} GB`
            })
            return `Servers (${new Date().toISOString()})\n${lines.join('\n')}`
          }} />
        </div>
        <TimeRangePicker value={hours} onChange={setHours} />
      </div>

      {error && (
        <div style={{ color: '#e94560', background: '#2a1a1a', border: '1px solid #e94560', borderRadius: '6px', padding: '10px', marginBottom: '16px' }}>
          Error: {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>Loading...</div>
      ) : servers.length === 0 ? (
        <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>No servers configured</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: selected ? '24px' : 0 }}>
          {servers.map((server) => (
            <ServerCard
              key={server.name}
              server={server}
              onClick={() => handleCardClick(server)}
              selected={selected === server.name}
            />
          ))}
        </div>
      )}

      {/* Chart panel */}
      {selected && (
        <div style={{ background: '#16213e', border: '1px solid #2a3a5c', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '14px', color: '#888', fontWeight: 600 }}>
              {selected} — History
            </h2>
            <button
              onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', color: '#888', fontSize: '16px', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
          {chartLoading ? (
            <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Loading chart...</div>
          ) : chartData.length === 0 ? (
            <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No history data</div>
          ) : (
            <UsageChart
              data={chartData}
              lines={[
                { key: 'load_1', label: 'Load 1m' },
                { key: 'cpu_user_pct', label: 'CPU User %' },
                { key: 'cpu_idle_pct', label: 'CPU Idle %' },
              ]}
              height={250}
            />
          )}
        </div>
      )}
    </div>
  )
}
