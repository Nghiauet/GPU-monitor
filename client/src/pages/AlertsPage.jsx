import { useState, useEffect } from 'react'
import {
  getAlerts,
  acknowledgeAlert,
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
} from '../api.js'

const CONDITION_TYPES = [
  { value: 'gpu_util_pct', label: 'GPU Utilization %' },
  { value: 'mem_util_pct', label: 'Memory Utilization %' },
  { value: 'temp_c', label: 'Temperature °C' },
  { value: 'cpu_user_pct', label: 'CPU User %' },
  { value: 'load_1', label: 'Load Average 1m' },
]

const EMPTY_RULE = {
  name: '',
  condition_type: 'gpu_util_pct',
  target: '',
  threshold: '',
  duration_min: '',
}

function timeAgo(ts) {
  if (!ts) return ''
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([])
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_RULE)
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [alertData, rulesData] = await Promise.all([getAlerts(), getAlertRules()])
        if (!cancelled) {
          setAlerts(Array.isArray(alertData) ? alertData : (alertData.alerts || []))
          setRules(Array.isArray(rulesData) ? rulesData : (rulesData.rules || []))
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const id = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  async function handleAcknowledge(id) {
    try {
      await acknowledgeAlert(id)
      setAlerts((prev) =>
        prev.map((a) => a.id === id ? { ...a, acknowledged: true, acknowledged_at: new Date().toISOString() } : a)
      )
    } catch (err) {
      alert('Failed: ' + err.message)
    }
  }

  async function handleToggleRule(rule) {
    try {
      const updated = await updateAlertRule(rule.id, { enabled: !rule.enabled })
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, ...updated } : r))
    } catch (err) {
      alert('Failed: ' + err.message)
    }
  }

  async function handleDeleteRule(id) {
    if (!confirm('Delete this rule?')) return
    try {
      await deleteAlertRule(id)
      setRules((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      alert('Failed: ' + err.message)
    }
  }

  async function handleCreateRule(e) {
    e.preventDefault()
    if (!form.name.trim()) { setFormError('Name is required'); return }
    if (!form.threshold) { setFormError('Threshold is required'); return }
    setFormError('')
    setFormSaving(true)
    try {
      const rule = await createAlertRule({
        ...form,
        threshold: Number(form.threshold),
        duration_min: form.duration_min ? Number(form.duration_min) : undefined,
      })
      setRules((prev) => [...prev, rule])
      setForm(EMPTY_RULE)
      setShowForm(false)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setFormSaving(false)
    }
  }

  if (loading) {
    return <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>Loading...</div>
  }

  const unacked = alerts.filter((a) => !a.acknowledged)
  const acked = alerts.filter((a) => a.acknowledged)

  return (
    <div>
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#e0e0e0', marginBottom: '24px' }}>Alerts</h1>

      {/* Triggered Alerts */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '14px', color: '#888', fontWeight: 600, marginBottom: '12px' }}>
          TRIGGERED ALERTS {unacked.length > 0 && (
            <span style={{ color: '#e94560', marginLeft: '6px' }}>({unacked.length} unacknowledged)</span>
          )}
        </h2>

        {alerts.length === 0 ? (
          <div style={{ color: '#888', padding: '20px', textAlign: 'center' }}>No alerts triggered</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[...unacked, ...acked].map((alert) => (
              <div
                key={alert.id}
                style={{
                  background: '#16213e',
                  border: '1px solid #2a3a5c',
                  borderLeft: `4px solid ${alert.acknowledged ? '#444' : '#e94560'}`,
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#e0e0e0', fontWeight: 600, marginBottom: '4px' }}>
                    {alert.rule_name || alert.message || 'Alert'}
                  </div>
                  <div style={{ color: '#888', fontSize: '11px', display: 'flex', gap: '12px' }}>
                    {alert.target && <span>Target: {alert.target}</span>}
                    {alert.value != null && <span>Value: {alert.value}</span>}
                    <span>{timeAgo(alert.triggered_at || alert.created_at)}</span>
                  </div>
                </div>
                {!alert.acknowledged && (
                  <button
                    onClick={() => handleAcknowledge(alert.id)}
                    style={{
                      background: '#2a3a5c',
                      color: '#e0e0e0',
                      border: '1px solid #3a4a6c',
                      borderRadius: '4px',
                      padding: '4px 10px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Acknowledge
                  </button>
                )}
                {alert.acknowledged && (
                  <span style={{ color: '#4ecca3', fontSize: '12px' }}>✓ Acknowledged</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Alert Rules */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '14px', color: '#888', fontWeight: 600 }}>ALERT RULES</h2>
          <button
            onClick={() => setShowForm((s) => !s)}
            style={{
              background: '#e94560',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 14px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            + New Rule
          </button>
        </div>

        {/* New rule form */}
        {showForm && (
          <form onSubmit={handleCreateRule} style={{
            background: '#16213e',
            border: '1px solid #2a3a5c',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '12px',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '4px' }}>Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  style={{ width: '100%', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #2a3a5c', borderRadius: '4px', padding: '6px 8px' }}
                  placeholder="Rule name"
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '4px' }}>Condition</label>
                <select
                  value={form.condition_type}
                  onChange={(e) => setForm((f) => ({ ...f, condition_type: e.target.value }))}
                  style={{ width: '100%', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #2a3a5c', borderRadius: '4px', padding: '6px 8px' }}
                >
                  {CONDITION_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '4px' }}>Target</label>
                <input
                  value={form.target}
                  onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                  style={{ width: '100%', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #2a3a5c', borderRadius: '4px', padding: '6px 8px' }}
                  placeholder="server or * for all"
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '4px' }}>Threshold *</label>
                <input
                  type="number"
                  value={form.threshold}
                  onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                  style={{ width: '100%', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #2a3a5c', borderRadius: '4px', padding: '6px 8px' }}
                  placeholder="e.g. 80"
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '4px' }}>Duration (min)</label>
                <input
                  type="number"
                  value={form.duration_min}
                  onChange={(e) => setForm((f) => ({ ...f, duration_min: e.target.value }))}
                  style={{ width: '100%', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #2a3a5c', borderRadius: '4px', padding: '6px 8px' }}
                  placeholder="e.g. 5"
                />
              </div>
            </div>
            {formError && <div style={{ color: '#e94560', fontSize: '12px', marginBottom: '8px' }}>{formError}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="submit"
                disabled={formSaving}
                style={{ background: '#e94560', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 16px', fontSize: '13px', cursor: 'pointer' }}
              >
                {formSaving ? 'Saving...' : 'Create Rule'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(EMPTY_RULE); setFormError('') }}
                style={{ background: 'none', color: '#888', border: '1px solid #2a3a5c', borderRadius: '4px', padding: '6px 16px', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {rules.length === 0 ? (
          <div style={{ color: '#888', padding: '20px', textAlign: 'center' }}>No alert rules configured</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  background: '#16213e',
                  border: '1px solid #2a3a5c',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: rule.enabled ? '#e0e0e0' : '#888', fontWeight: 600, marginBottom: '4px' }}>
                    {rule.name}
                  </div>
                  <div style={{ color: '#888', fontSize: '11px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span>{rule.condition_type}</span>
                    {rule.target && <span>target: {rule.target}</span>}
                    <span>threshold: {rule.threshold}</span>
                    {rule.duration_min && <span>for {rule.duration_min}m</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleToggleRule(rule)}
                  style={{
                    background: rule.enabled ? '#2a3a5c' : '#1a1a2e',
                    color: rule.enabled ? '#4ecca3' : '#888',
                    border: '1px solid #3a4a6c',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {rule.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  style={{
                    background: 'none',
                    color: '#e94560',
                    border: '1px solid #e94560',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
