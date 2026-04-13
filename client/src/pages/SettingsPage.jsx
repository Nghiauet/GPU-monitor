import { useState, useEffect } from 'react'
import { Settings, Plus, Trash2, Play, Square, Database, ServerCog } from 'lucide-react'
import CopyButton from '../components/CopyButton.jsx'
import RefreshButton from '../components/RefreshButton.jsx'
import StatusIndicator from '../components/StatusIndicator.jsx'
import { useRefreshKey } from '../hooks/useRefreshKey.js'
import {
  getCollectorStatus,
  startCollector,
  stopCollector,
  updateCollectorConfig,
  getServers,
  addServer,
  updateServer,
  deleteServer,
  getStats,
  triggerCleanup,
} from '../api.js'
import {
  colors, spacing, fontSize, fontWeight, radius,
  pageHeaderStyle, pageTitleStyle, sectionStyle, sectionHeaderStyle,
  buttonStyle, inputStyle, cardStyle, badgeStyle, metricLabelStyle, metricValueStyle,
} from '../theme.js'

export default function SettingsPage() {
  const [collector, setCollector] = useState(null)
  const [interval, setInterval_] = useState('')
  const [servers, setServers] = useState([])
  const [stats, setStats] = useState(null)
  const [newServer, setNewServer] = useState({ name: '', hostname: '', ssh_user: '', ssh_key_path: '' })
  const [showAddServer, setShowAddServer] = useState(false)
  const [serverError, setServerError] = useState('')
  const [cleanupMsg, setCleanupMsg] = useState('')
  const [saving, setSaving] = useState('')
  const [refreshKey, refresh] = useRefreshKey()

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [col, srvs, st] = await Promise.all([
          getCollectorStatus(),
          getServers(),
          getStats().catch(() => null),
        ])
        if (!cancelled) {
          setCollector(col)
          setInterval_(String(col?.interval_seconds ?? col?.interval ?? ''))
          setServers(Array.isArray(srvs) ? srvs : (srvs.servers || []))
          setStats(st)
        }
      } catch {}
    }
    load()
    const id = setInterval(load, 10000)
    return () => { cancelled = true; clearInterval(id) }
  }, [refreshKey])

  async function handleCollectorToggle() {
    setSaving('collector')
    try {
      const fn = collector?.running ? stopCollector : startCollector
      const result = await fn()
      setCollector((c) => ({ ...c, running: !c?.running, ...result }))
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving('')
    }
  }

  async function handleUpdateInterval() {
    const val = parseInt(interval, 10)
    if (!val || val < 1) { alert('Invalid interval'); return }
    setSaving('interval')
    try {
      await updateCollectorConfig({ interval_seconds: val })
      setCollector((c) => ({ ...c, interval_seconds: val }))
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving('')
    }
  }

  async function handleToggleServer(server) {
    try {
      const updated = await updateServer(server.name, { enabled: !server.enabled })
      setServers((prev) => prev.map((s) => s.name === server.name ? { ...s, ...updated } : s))
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  async function handleRemoveServer(name) {
    if (!confirm(`Remove server "${name}"?`)) return
    try {
      await deleteServer(name)
      setServers((prev) => prev.filter((s) => s.name !== name))
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  async function handleAddServer(e) {
    e.preventDefault()
    if (!newServer.name.trim()) { setServerError('Name required'); return }
    if (!newServer.hostname.trim()) { setServerError('Hostname required'); return }
    setServerError('')
    setSaving('addserver')
    try {
      const created = await addServer(newServer)
      setServers((prev) => [...prev, created])
      setNewServer({ name: '', hostname: '', ssh_user: '', ssh_key_path: '' })
      setShowAddServer(false)
    } catch (err) {
      setServerError(err.message)
    } finally {
      setSaving('')
    }
  }

  async function handleCleanup() {
    setCleanupMsg('Running...')
    try {
      const result = await triggerCleanup()
      setCleanupMsg(result?.message || 'Cleanup complete')
    } catch (err) {
      setCleanupMsg('Error: ' + err.message)
    }
  }

  return (
    <div className="fade-in">
      <div style={pageHeaderStyle()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
          <h1 style={{ ...pageTitleStyle(), display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}><Settings size={22} strokeWidth={2} /> Settings</h1>
          <RefreshButton onRefresh={refresh} />
          <CopyButton getText={() => {
            const lines = [`Settings (${new Date().toISOString()})`]
            if (collector) {
              lines.push(`Collector: ${collector.running ? 'Running' : 'Stopped'}, interval ${collector.interval_seconds}s`)
            }
            lines.push(`Servers: ${servers.length}`)
            servers.forEach(s => lines.push(`  ${s.name} (${s.hostname}): ${s.enabled ? 'enabled' : 'disabled'}`))
            if (stats) {
              lines.push('Data:')
              Object.entries(stats.tables || {}).forEach(([t, v]) => {
                if (v.count != null) lines.push(`  ${t}: ${v.count} rows`)
              })
            }
            return lines.join('\n')
          }} />
        </div>
      </div>

      {/* Collector */}
      <div style={sectionStyle()}>
        <div style={{ ...sectionHeaderStyle(), display: 'flex', alignItems: 'center', gap: '6px' }}><Play size={13} /> Collector</div>
        <div style={{ padding: `${spacing.lg}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.lg}px`, marginBottom: `${spacing.lg}px`, flexWrap: 'wrap' }}>
            <button
              onClick={handleCollectorToggle}
              disabled={saving === 'collector'}
              className={collector?.running ? 'btn-primary' : 'btn-success'}
              style={buttonStyle(collector?.running ? 'primary' : 'success')}
            >
              {saving === 'collector' ? '...' : collector?.running ? <><Square size={14} fill="currentColor" /> Stop Collector</> : <><Play size={14} fill="currentColor" /> Start Collector</>}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
              <StatusIndicator
                color={collector?.running ? 'green' : 'gray'}
                size={8}
                pulse={collector?.running}
              />
              <span style={badgeStyle(collector?.running ? colors.status.healthy : colors.text.muted)}>
                {collector?.running ? 'Running' : 'Stopped'}
              </span>
            </div>
            {collector?.last_run && (
              <span style={{ color: colors.text.secondary, fontSize: fontSize.base }}>
                Last run: {new Date(collector.last_run).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: `${spacing.sm}px` }}>
            <div style={{ width: '140px' }}>
              <label style={{ display: 'block', color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: '4px', fontWeight: fontWeight.medium }}>
                Interval (seconds)
              </label>
              <input
                type="number"
                value={interval}
                onChange={(e) => setInterval_(e.target.value)}
                placeholder="60"
                style={inputStyle()}
              />
            </div>
            <button
              onClick={handleUpdateInterval}
              disabled={saving === 'interval'}
              className="btn-secondary"
              style={buttonStyle('secondary')}
            >
              {saving === 'interval' ? '...' : 'Update'}
            </button>
          </div>
        </div>
      </div>

      {/* Servers */}
      <div style={sectionStyle()}>
        <div style={{ ...sectionHeaderStyle(), display: 'flex', alignItems: 'center', gap: '6px' }}><ServerCog size={13} /> Servers</div>
        <div style={{ padding: `${spacing.lg}px` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px`, marginBottom: `${spacing.md}px` }}>
            {servers.length === 0 ? (
              <div style={{ color: colors.text.muted, padding: `${spacing.md}px`, textAlign: 'center' }}>No servers configured</div>
            ) : (
              servers.map((server) => (
                <div
                  key={server.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${spacing.md}px`,
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    background: colors.bg.input,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: radius.md,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
                    <StatusIndicator color={server.enabled ? 'green' : 'gray'} size={8} />
                    <span style={{ color: colors.text.primary, fontWeight: fontWeight.semibold }}>{server.name}</span>
                    {server.hostname && (
                      <span style={{ color: colors.text.muted, fontSize: fontSize.sm }}>{server.hostname}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggleServer(server)}
                    className={server.enabled ? 'toggle-enabled' : 'toggle-disabled'}
                    style={{ ...buttonStyle('ghost'), fontSize: fontSize.base, padding: '4px 12px' }}
                  >
                    {server.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => handleRemoveServer(server.name)}
                    className="btn-danger"
                    style={{ ...buttonStyle('danger'), fontSize: fontSize.base, padding: '4px 12px' }}
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                </div>
              ))
            )}
          </div>

          {!showAddServer ? (
            <button
              onClick={() => setShowAddServer(true)}
              className="btn-success"
              style={{ ...buttonStyle('success'), background: 'transparent', color: colors.accent.green, border: `1px solid ${colors.accent.green}` }}
            >
              <Plus size={15} strokeWidth={2.5} /> Add Server
            </button>
          ) : (
            <form onSubmit={handleAddServer} className="slide-down" style={{ marginTop: `${spacing.sm}px` }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
                {[
                  { label: 'Name *', key: 'name', placeholder: 'prod-gpu-01' },
                  { label: 'Hostname *', key: 'hostname', placeholder: '192.168.1.10' },
                  { label: 'SSH User', key: 'ssh_user', placeholder: 'ubuntu' },
                  { label: 'SSH Key Path', key: 'ssh_key_path', placeholder: '/home/user/.ssh/id_rsa' },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label style={{ display: 'block', color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: '4px', fontWeight: fontWeight.medium }}>{label}</label>
                    <input
                      value={newServer[key]}
                      onChange={(e) => setNewServer((s) => ({ ...s, [key]: e.target.value }))}
                      placeholder={placeholder}
                      style={inputStyle()}
                    />
                  </div>
                ))}
              </div>
              {serverError && <div style={{ color: colors.accent.red, fontSize: fontSize.base, marginBottom: `${spacing.sm}px` }}>{serverError}</div>}
              <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
                <button type="submit" disabled={saving === 'addserver'} className="btn-success" style={buttonStyle('success')}>
                  {saving === 'addserver' ? 'Adding...' : 'Add Server'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddServer(false); setNewServer({ name: '', hostname: '', ssh_user: '', ssh_key_path: '' }); setServerError('') }}
                  className="btn-ghost"
                  style={buttonStyle('ghost')}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Data & Retention */}
      <div style={sectionStyle()}>
        <div style={{ ...sectionHeaderStyle(), display: 'flex', alignItems: 'center', gap: '6px' }}><Database size={13} /> Data & Retention</div>
        <div style={{ padding: `${spacing.lg}px` }}>
          {stats ? (
            <div style={{ marginBottom: `${spacing.lg}px` }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
                {[
                  { label: 'DB Size', value: stats.db_size_bytes != null ? `${(stats.db_size_bytes / 1024 / 1024).toFixed(1)} MB` : '--' },
                  { label: 'GPU Snapshots', value: stats.tables?.gpu_devices?.count ?? '--' },
                  { label: 'Server Snapshots', value: stats.tables?.host_summaries?.count ?? '--' },
                  { label: 'Alerts', value: stats.tables?.alerts?.count ?? '--' },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    background: colors.bg.input,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: radius.lg,
                    padding: `${spacing.md}px ${spacing.lg}px`,
                  }}>
                    <div style={metricLabelStyle()}>{label}</div>
                    <div style={{ ...metricValueStyle(), fontSize: fontSize.xl }}>{String(value)}</div>
                  </div>
                ))}
              </div>
              {stats.tables?.gpu_devices?.oldest && (
                <div style={{ color: colors.text.secondary, fontSize: fontSize.base }}>
                  Data range: {stats.tables.gpu_devices.oldest} &mdash; {stats.tables.gpu_devices.newest}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: colors.text.muted, fontSize: fontSize.base, marginBottom: `${spacing.md}px` }}>Stats unavailable</div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
            <button
              onClick={handleCleanup}
              className="btn-primary"
              style={{ ...buttonStyle('warning') }}
            >
              Run Cleanup Now
            </button>
            {cleanupMsg && (
              <span style={{ color: colors.text.secondary, fontSize: fontSize.base }}>{cleanupMsg}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
