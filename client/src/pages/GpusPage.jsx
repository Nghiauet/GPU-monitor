import { useState, useEffect } from 'react'
import { Cpu, X } from 'lucide-react'
import { getGpus, getGpuHistory, getServers } from '../api.js'
import GpuCard from '../components/GpuCard.jsx'
import TimeRangePicker from '../components/TimeRangePicker.jsx'
import UsageChart from '../components/UsageChart.jsx'
import CopyButton from '../components/CopyButton.jsx'
import RefreshButton from '../components/RefreshButton.jsx'
import { SkeletonGrid } from '../components/Skeleton.jsx'
import { useRefreshKey } from '../hooks/useRefreshKey.js'
import { useIsMobile } from '../hooks/useIsMobile.js'
import { colors, spacing, selectStyle, pageHeaderStyle, pageTitleStyle, errorBannerStyle, emptyStateStyle, sectionStyle, sectionHeaderStyle } from '../theme.js'

export default function GpusPage() {
  const isMobile = useIsMobile()
  const [gpus, setGpus] = useState([])
  const [servers, setServers] = useState([])
  const [serverFilter, setServerFilter] = useState('')
  const [hours, setHours] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [chartData, setChartData] = useState([])
  const [chartLoading, setChartLoading] = useState(false)
  const [refreshKey, refresh] = useRefreshKey()

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
        const data = await getGpus(params)
        if (!cancelled) {
          setGpus(Array.isArray(data) ? data : (data.gpus || []))
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
  }, [serverFilter, refreshKey])

  useEffect(() => {
    if (!selected) { setChartData([]); return }
    let cancelled = false
    setChartLoading(true)
    function loadChart() {
      const from = new Date(Date.now() - hours * 3600 * 1000).toISOString()
      getGpuHistory(selected.server, selected.gpu_index, { from })
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

  function handleCardClick(gpu) {
    const key = `${gpu.server}:${gpu.gpu_index ?? gpu.idx ?? 0}`
    const selKey = selected ? `${selected.server}:${selected.gpu_index}` : null
    if (key === selKey) setSelected(null)
    else setSelected({ server: gpu.server, gpu_index: gpu.gpu_index ?? gpu.idx ?? 0 })
  }

  return (
    <div className="fade-in">
      <div style={pageHeaderStyle()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
          <h1 style={{ ...pageTitleStyle(), display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}><Cpu size={22} strokeWidth={2} /> GPUs</h1>
          <RefreshButton onRefresh={refresh} />
          <CopyButton getText={() => {
            if (gpus.length === 0) return 'No GPU data'
            const lines = gpus.map(g =>
              `${g.server} GPU ${g.gpu_index} (${g.gpu_name}): util ${g.gpu_util_pct}%, VRAM ${Math.round(g.mem_used_mb/1024)}/${Math.round(g.mem_total_mb/1024)} GB, temp ${g.temp_c}C`
            )
            return `GPUs (${new Date().toISOString()})\n${lines.join('\n')}`
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
          <TimeRangePicker value={hours} onChange={setHours} />
        </div>
      </div>

      {error && <div style={errorBannerStyle()}><Cpu size={16} /> Error: {error}</div>}

      {loading ? (
        <SkeletonGrid count={6} minWidth={280} />
      ) : gpus.length === 0 ? (
        <div style={emptyStateStyle()}>No GPUs found</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: `${spacing.md}px`,
          marginBottom: selected ? `${spacing.xxl}px` : 0,
        }}>
          {gpus.map((gpu) => {
            const key = `${gpu.server}:${gpu.gpu_index ?? gpu.idx ?? 0}`
            const selKey = selected ? `${selected.server}:${selected.gpu_index}` : null
            return (
              <GpuCard key={key} gpu={gpu} onClick={() => handleCardClick(gpu)} selected={key === selKey} />
            )
          })}
        </div>
      )}

      {selected && (
        <div className="slide-down" style={sectionStyle()}>
          <div style={{ ...sectionHeaderStyle(), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{selected.server} / GPU {selected.gpu_index} -- History</span>
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
                  { key: 'gpu_util_pct', label: 'GPU Util %' },
                  { key: 'mem_util_pct', label: 'Mem Util %' },
                  { key: 'temp_c', label: 'Temp °C' },
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
