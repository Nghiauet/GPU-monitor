import { useState, useEffect } from 'react'
import { Server, X } from 'lucide-react'
import { getServers, getServerHistory } from '../api.js'
import ServerCard from '../components/ServerCard.jsx'
import TimeRangePicker from '../components/TimeRangePicker.jsx'
import UsageChart from '../components/UsageChart.jsx'
import CopyButton from '../components/CopyButton.jsx'
import RefreshButton from '../components/RefreshButton.jsx'
import { SkeletonCard } from '../components/Skeleton.jsx'
import { useRefreshKey } from '../hooks/useRefreshKey.js'
import { colors, spacing, pageHeaderStyle, pageTitleStyle, errorBannerStyle, emptyStateStyle, sectionStyle, sectionHeaderStyle } from '../theme.js'

export default function ServersPage() {
  const [servers, setServers] = useState([])
  const [hours, setHours] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [chartData, setChartData] = useState([])
  const [chartLoading, setChartLoading] = useState(false)
  const [refreshKey, refresh] = useRefreshKey()

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
        if (!cancelled) { setError(err.message); setLoading(false) }
      }
    }
    setLoading(true)
    load()
    const id = setInterval(load, 10000)
    return () => { cancelled = true; clearInterval(id) }
  }, [refreshKey])

  useEffect(() => {
    if (!selected) { setChartData([]); return }
    let cancelled = false
    setChartLoading(true)
    function loadChart() {
      const from = new Date(Date.now() - hours * 3600 * 1000).toISOString()
      getServerHistory(selected, { from })
        .then((data) => {
          if (!cancelled) {
            setChartData(Array.isArray(data) ? data : (data.history || data.data || []))
            setChartLoading(false)
          }
        })
        .catch(() => { if (!cancelled) setChartLoading(false) })
    }
    loadChart()
    const id = setInterval(loadChart, 10000)
    return () => { cancelled = true; clearInterval(id) }
  }, [selected, hours])

  function handleCardClick(server) {
    setSelected((prev) => prev === server.name ? null : server.name)
  }

  return (
    <div className="fade-in">
      <div style={pageHeaderStyle()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
          <h1 style={{ ...pageTitleStyle(), display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}><Server size={22} strokeWidth={2} /> Servers</h1>
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

      {error && <div style={errorBannerStyle()}><Server size={16} /> Error: {error}</div>}

      {loading ? (
        <SkeletonCard count={3} />
      ) : servers.length === 0 ? (
        <div style={emptyStateStyle()}>No servers configured</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: `${spacing.md}px`,
          marginBottom: selected ? `${spacing.xxl}px` : 0,
        }}>
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

      {selected && (
        <div className="slide-down" style={sectionStyle()}>
          <div style={{ ...sectionHeaderStyle(), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{selected} -- History</span>
            <button
              onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', color: colors.text.muted, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <X size={18} />
            </button>
          </div>
          <div style={{ padding: `${spacing.lg}px` }}>
            {chartLoading ? (
              <div style={{ color: colors.text.muted, textAlign: 'center', padding: `${spacing.xxl}px` }}>Loading chart...</div>
            ) : chartData.length === 0 ? (
              <div style={{ color: colors.text.muted, textAlign: 'center', padding: `${spacing.xxl}px` }}>No history data</div>
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
        </div>
      )}
    </div>
  )
}
