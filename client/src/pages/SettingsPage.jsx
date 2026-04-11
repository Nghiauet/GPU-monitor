import { useState, useEffect } from 'react'
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

const EMPTY_SERVER = { name: '', hostname: '', ssh_user: '', ssh_key_path: '' }

function Section({ title, children }) {
  return (
    <section style={{
      background: '#16213e',
      border: '1px solid #2a3a5c',
      borderRadius: '8px',
      marginBottom: '20px',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a3a5c' }}>
        <h2 style={{ fontSize: '14px', color: '#888', fontWeight: 600 }}>{title}</h2>
      </div>
      <div style={{ padding: '16px' }}>{children}</div>
    </section>
  )
}

function Input({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      {label && <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '4px' }}>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: '100%',
          background: '#1a1a2e',
          color: '#e0e0e0',
          border: '1px solid #2a3a5c',
          borderRadius: '4px',
          padding: '6px 8px',
          fontSize: '13px',
        }}
      />
    </div>
  )
}

export default function SettingsPage() {
  const [collector, setCollector] = useState(null)
  const [interval, setInterval_] = useState('')
  const [servers, setServers] = useState([])
  const [stats, setStats] = useState(null)
  const [newServer, setNewServer] = useState(EMPTY_SERVER)
  const [showAddServer, setShowAddServer] = useState(false)
  const [serverError, setServerError] = useState('')
  const [cleanupMsg, setCleanupMsg] = useState('')
  const [saving, setSaving] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [col, srvs, st] = await Promise.all([
          getCollectorStatus(),
          getServers(),
          getStats().catch(() => null),
        ])
        setCollector(col)
        setInterval_(String(col?.interval_seconds ?? col?.interval ?? ''))
        setServers(Array.isArray(srvs) ? srvs : (srvs.servers || []))
        setStats(st)
      } catch {}
    }
    load()
  }, [])

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
      setNewServer(EMPTY_SERVER)
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
    <div>
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#e0e0e0', marginBottom: '24px' }}>Settings</h1>

      {/* Collector */}
      <Section title="COLLECTOR">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={handleCollectorToggle}
              disabled={saving === 'collector'}
              style={{
                background: collector?.running ? '#e94560' : '#4ecca3',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 18px',
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {saving === 'collector' ? '...' : collector?.running ? 'Stop Collector' : 'Start Collector'}
            </button>
            <span style={{ color: '#888', fontSize: '12px' }}>
              Status: <span style={{ color: collector?.running ? '#4ecca3' : '#888', fontWeight: 600 }}>
                {collector?.running ? 'Running' : 'Stopped'}
              </span>
            </span>
            {collector?.last_run && (
              <span style={{ color: '#888', fontSize: '12px' }}>
                Last run: {new Date(collector.last_run).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '120px' }}>
              <Input
                label="Interval (seconds)"
                value={interval}
                onChange={(e) => setInterval_(e.target.value)}
                type="number"
                placeholder="60"
              />
            </div>
            <button
              onClick={handleUpdateInterval}
              disabled={saving === 'interval'}
              style={{
                background: '#2a3a5c',
                color: '#e0e0e0',
                border: '1px solid #3a4a6c',
                borderRadius: '4px',
                padding: '6px 14px',
                fontSize: '12px',
                cursor: 'pointer',
                marginTop: '16px',
              }}
            >
              {saving === 'interval' ? '...' : 'Update'}
            </button>
          </div>
        </div>
      </Section>

      {/* Servers */}
      <Section title="SERVERS">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {servers.length === 0 ? (
            <div style={{ color: '#888', padding: '10px', textAlign: 'center' }}>No servers configured</div>
          ) : (
            servers.map((server) => (
              <div
                key={server.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  background: '#1a1a2e',
                  border: '1px solid #2a3a5c',
                  borderRadius: '6px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#e0e0e0', fontWeight: 600 }}>{server.name}</span>
                  {server.hostname && (
                    <span style={{ color: '#888', fontSize: '11px', marginLeft: '8px' }}>{server.hostname}</span>
                  )}
                </div>
                <button
                  onClick={() => handleToggleServer(server)}
                  style={{
                    background: server.enabled ? '#2a3a5c' : '#1a1a2e',
                    color: server.enabled ? '#4ecca3' : '#888',
                    border: '1px solid #3a4a6c',
                    borderRadius: '4px',
                    padding: '3px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {server.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button
                  onClick={() => handleRemoveServer(server.name)}
                  style={{
                    background: 'none',
                    color: '#e94560',
                    border: '1px solid #e94560',
                    borderRadius: '4px',
                    padding: '3px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        {!showAddServer ? (
          <button
            onClick={() => setShowAddServer(true)}
            style={{
              background: 'none',
              color: '#4ecca3',
              border: '1px solid #4ecca3',
              borderRadius: '4px',
              padding: '6px 14px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            + Add Server
          </button>
        ) : (
          <form onSubmit={handleAddServer} style={{ marginTop: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <Input label="Name *" value={newServer.name} onChange={(e) => setNewServer((s) => ({ ...s, name: e.target.value }))} placeholder="prod-gpu-01" />
              <Input label="Hostname *" value={newServer.hostname} onChange={(e) => setNewServer((s) => ({ ...s, hostname: e.target.value }))} placeholder="192.168.1.10" />
              <Input label="SSH User" value={newServer.ssh_user} onChange={(e) => setNewServer((s) => ({ ...s, ssh_user: e.target.value }))} placeholder="ubuntu" />
              <Input label="SSH Key Path" value={newServer.ssh_key_path} onChange={(e) => setNewServer((s) => ({ ...s, ssh_key_path: e.target.value }))} placeholder="/home/user/.ssh/id_rsa" />
            </div>
            {serverError && <div style={{ color: '#e94560', fontSize: '12px', marginBottom: '8px' }}>{serverError}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="submit"
                disabled={saving === 'addserver'}
                style={{ background: '#4ecca3', color: '#1a1a2e', border: 'none', borderRadius: '4px', padding: '6px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
              >
                {saving === 'addserver' ? 'Adding...' : 'Add Server'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddServer(false); setNewServer(EMPTY_SERVER); setServerError('') }}
                style={{ background: 'none', color: '#888', border: '1px solid #2a3a5c', borderRadius: '4px', padding: '6px 16px', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Section>

      {/* Data & Retention */}
      <Section title="DATA & RETENTION">
        {stats ? (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              {[
                { label: 'DB Size', value: stats.db_size_mb ? `${stats.db_size_mb} MB` : (stats.size_mb ? `${stats.size_mb} MB` : '—') },
                { label: 'GPU Snapshots', value: stats.gpu_snapshots ?? stats.gpu_snapshot_count ?? '—' },
                { label: 'Server Snapshots', value: stats.server_snapshots ?? stats.server_snapshot_count ?? '—' },
                { label: 'Alerts', value: stats.alert_count ?? stats.alerts ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#1a1a2e', border: '1px solid #2a3a5c', borderRadius: '6px', padding: '10px 14px' }}>
                  <div style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>{label}</div>
                  <div style={{ color: '#e0e0e0', fontWeight: 600 }}>{String(value)}</div>
                </div>
              ))}
            </div>
            {(stats.oldest || stats.date_range?.oldest) && (
              <div style={{ color: '#888', fontSize: '12px' }}>
                Data range: {stats.oldest || stats.date_range?.oldest} — {stats.newest || stats.date_range?.newest}
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: '#888', fontSize: '12px', marginBottom: '12px' }}>Stats unavailable</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleCleanup}
            style={{
              background: '#f5a623',
              color: '#1a1a2e',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 16px',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Run Cleanup Now
          </button>
          {cleanupMsg && (
            <span style={{ color: '#888', fontSize: '12px' }}>{cleanupMsg}</span>
          )}
        </div>
      </Section>
    </div>
  )
}
