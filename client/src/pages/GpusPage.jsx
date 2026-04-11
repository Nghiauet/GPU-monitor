import { useState, useEffect } from 'react'
import { getGpus, getGpuHistory, getServers } from '../api.js'
import GpuCard from '../components/GpuCard.jsx'
import TimeRangePicker from '../components/TimeRangePicker.jsx'
import UsageChart from '../components/UsageChart.jsx'
import CopyButton from '../components/CopyButton.jsx'
import RefreshButton from '../components/RefreshButton.jsx'
import { useRefreshKey } from '../hooks/useRefreshKey.js'

export default function GpusPage() {
  const [gpus, setGpus] = useState([])
  const [servers, setServers] = useState([])
  const [serverFilter, setServerFilter] = useState('')
  const [hours, setHours] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null) // { server, gpu_index }
  const [chartData, setChartData] = useState([])
  const [chartLoading, setChartLoading] = useState(false)
  const [refreshKey, refresh] = useRefreshKey()

  // Load servers once
  useEffect(() => {
    getServers()
      .then((data) => setServers(Array.isArray(data) ? data : (data.servers || [])))
      .catch(() => {})
  }, [])

  // Poll GPUs
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
  }, [serverFilter, refreshKey])

  // Load chart when GPU selected
  useEffect(() => {
    if (!selected) {
      setChartData([])
      return
    }
    let cancelled = false
    setChartLoading(true)

    const from = new Date(Date.now() - hours * 3600 * 1000).toISOString()
    getGpuHistory(selected.server, selected.gpu_index, { from })
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

  function handleCardClick(gpu) {
    const key = `${gpu.server}:${gpu.gpu_index ?? gpu.idx ?? 0}`
    const selKey = selected ? `${selected.server}:${selected.gpu_index}` : null
    if (key === selKey) {
      setSelected(null)
    } else {
      setSelected({ server: gpu.server, gpu_index: gpu.gpu_index ?? gpu.idx ?? 0 })
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#e0e0e0' }}>GPUs</h1>
          <RefreshButton onRefresh={refresh} />
          <CopyButton getText={() => {
            if (gpus.length === 0) return 'No GPU data'
            const lines = gpus.map(g =>
              `${g.server} GPU ${g.gpu_index} (${g.gpu_name}): util ${g.gpu_util_pct}%, VRAM ${Math.round(g.mem_used_mb/1024)}/${Math.round(g.mem_total_mb/1024)} GB, temp ${g.temp_c}C`
            )
            return `GPUs (${new Date().toISOString()})\n${lines.join('\n')}`
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
              <option key={s.name || s} value={s.name || s}>{s.name || s}</option>
            ))}
          </select>
          <TimeRangePicker value={hours} onChange={setHours} />
        </div>
      </div>

      {error && (
        <div style={{ color: '#e94560', background: '#2a1a1a', border: '1px solid #e94560', borderRadius: '6px', padding: '10px', marginBottom: '16px' }}>
          Error: {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>Loading...</div>
      ) : gpus.length === 0 ? (
        <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>No GPUs found</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '10px',
          marginBottom: selected ? '24px' : 0,
        }}>
          {gpus.map((gpu) => {
            const key = `${gpu.server}:${gpu.gpu_index ?? gpu.idx ?? 0}`
            const selKey = selected ? `${selected.server}:${selected.gpu_index}` : null
            return (
              <GpuCard
                key={key}
                gpu={gpu}
                onClick={() => handleCardClick(gpu)}
                selected={key === selKey}
              />
            )
          })}
        </div>
      )}

      {/* Chart panel */}
      {selected && (
        <div style={{ background: '#16213e', border: '1px solid #2a3a5c', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '14px', color: '#888', fontWeight: 600 }}>
              {selected.server} / GPU {selected.gpu_index} — History
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
                { key: 'gpu_util_pct', label: 'GPU Util %' },
                { key: 'mem_util_pct', label: 'Mem Util %' },
                { key: 'temp_c', label: 'Temp °C' },
              ]}
              height={250}
            />
          )}
        </div>
      )}
    </div>
  )
}
