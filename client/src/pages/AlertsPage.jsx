import { useState, useEffect } from 'react'
import { Bell, Check, Plus, Trash2, AlertTriangle, ShieldCheck, BellOff } from 'lucide-react'
import CopyButton from '../components/CopyButton.jsx'
import RefreshButton from '../components/RefreshButton.jsx'
import { useRefreshKey } from '../hooks/useRefreshKey.js'
import { timeAgo } from '../utils/fmt.js'
import {
  getAlerts,
  acknowledgeAlert,
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
} from '../api.js'
import {
  colors, spacing, fontSize, fontWeight, radius, transition,
  pageHeaderStyle, pageTitleStyle, errorBannerStyle, emptyStateStyle,
  sectionHeaderStyle, cardStyle, buttonStyle, inputStyle, selectStyle, badgeStyle,
} from '../theme.js'

const CONDITION_TYPES = [
  { value: 'user_gpu_mem_exceeds', label: 'User GPU Memory Exceeds' },
  { value: 'user_gpu_count_exceeds', label: 'User GPU Count Exceeds' },
  { value: 'gpu_idle', label: 'GPU Idle' },
  { value: 'server_load_exceeds', label: 'Server Load Exceeds' },
  { value: 'server_unreachable', label: 'Server Unreachable' },
  { value: 'gpu_temp_exceeds', label: 'GPU Temperature Exceeds' },
]

const EMPTY_RULE = {
  name: '',
  condition_type: 'user_gpu_mem_exceeds',
  target: '',
  threshold: '',
  duration_min: '',
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([])
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_RULE)
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  const [refreshKey, refresh] = useRefreshKey()

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
    return () => { cancelled = true; clearInterval(id) }
  }, [refreshKey])

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
    return (
      <div className="fade-in" style={{ padding: `${spacing.lg}px 0` }}>
        <div style={pageHeaderStyle()}>
          <h1 style={{ ...pageTitleStyle(), display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}><Bell size={22} strokeWidth={2} /> Alerts</h1>
        </div>
        <div className="skeleton" style={{ height: 120, borderRadius: radius.lg, marginBottom: spacing.md }} />
        <div className="skeleton" style={{ height: 120, borderRadius: radius.lg, marginBottom: spacing.md }} />
        <div className="skeleton" style={{ height: 80, borderRadius: radius.lg }} />
      </div>
    )
  }

  const unacked = alerts.filter((a) => !a.acknowledged)
  const acked = alerts.filter((a) => a.acknowledged)

  return (
    <div className="fade-in">
      <div style={pageHeaderStyle()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
          <h1 style={{ ...pageTitleStyle(), display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}><Bell size={22} strokeWidth={2} /> Alerts</h1>
          <RefreshButton onRefresh={refresh} />
          <CopyButton getText={() => {
            const lines = [`Alerts (${new Date().toISOString()})`]
            const unack = alerts.filter(a => !a.acknowledged)
            lines.push(`Unacknowledged: ${unack.length}`)
            unack.forEach(a => lines.push(`  [${a.ts_utc}] ${a.message}`))
            lines.push(`Rules: ${rules.length}`)
            rules.forEach(r => lines.push(`  ${r.name}: ${r.condition_type} target=${r.target} threshold=${r.threshold} duration=${r.duration_min}min ${r.enabled ? 'ON' : 'OFF'}`))
            return lines.join('\n')
          }} />
        </div>
      </div>

      {/* Triggered Alerts */}
      <section style={{ marginBottom: `${spacing.xxxl}px` }}>
        <div style={{ ...sectionHeaderStyle(), background: 'none', border: 'none', padding: `0 0 ${spacing.md}px`, position: 'static', display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
          <AlertTriangle size={14} /> <span>Triggered Alerts</span>
          {unacked.length > 0 && (
            <span style={badgeStyle(colors.accent.red)}>{unacked.length} unacknowledged</span>
          )}
        </div>

        {alerts.length === 0 ? (
          <div style={emptyStateStyle()}>No alerts triggered</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
            {[...unacked, ...acked].map((al) => (
              <div
                key={al.id}
                style={{
                  ...cardStyle({ hoverable: false }),
                  borderLeft: `4px solid ${al.acknowledged ? colors.text.muted : colors.accent.red}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${spacing.md}px`,
                  flexWrap: 'wrap',
                  ...(al.acknowledged ? {} : { background: `${colors.accent.red}08` }),
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: colors.text.primary, fontWeight: fontWeight.semibold, marginBottom: '4px' }}>
                    {al.rule_name || al.message || 'Alert'}
                  </div>
                  <div style={{ color: colors.text.secondary, fontSize: fontSize.sm, display: 'flex', gap: `${spacing.md}px`, flexWrap: 'wrap' }}>
                    {al.target && <span>Target: {al.target}</span>}
                    {al.value != null && <span>Value: {al.value}</span>}
                    <span>{timeAgo(al.triggered_at || al.created_at) || ''}</span>
                  </div>
                </div>
                {!al.acknowledged && (
                  <button
                    onClick={() => handleAcknowledge(al.id)}
                    className="btn-secondary"
                    style={buttonStyle('secondary')}
                  >
                    Acknowledge
                  </button>
                )}
                {al.acknowledged && (
                  <span style={badgeStyle(colors.status.healthy)}><Check size={13} strokeWidth={2.5} /> Acknowledged</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Alert Rules */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: `${spacing.md}px` }}>
          <div style={{ ...sectionHeaderStyle(), background: 'none', border: 'none', padding: 0, position: 'static', display: 'flex', alignItems: 'center', gap: '6px' }}><ShieldCheck size={14} /> Alert Rules</div>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="btn-primary"
            style={buttonStyle('primary')}
          >
            <Plus size={15} strokeWidth={2.5} /> New Rule
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreateRule} className="slide-down" style={{
            ...cardStyle({ hoverable: false }),
            marginBottom: `${spacing.md}px`,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
              <div>
                <label style={{ display: 'block', color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: '4px', fontWeight: fontWeight.medium }}>Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  style={inputStyle()}
                  placeholder="Rule name"
                />
              </div>
              <div>
                <label style={{ display: 'block', color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: '4px', fontWeight: fontWeight.medium }}>Condition</label>
                <select
                  value={form.condition_type}
                  onChange={(e) => setForm((f) => ({ ...f, condition_type: e.target.value }))}
                  style={selectStyle()}
                >
                  {CONDITION_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: '4px', fontWeight: fontWeight.medium }}>Target</label>
                <input
                  value={form.target}
                  onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                  style={inputStyle()}
                  placeholder="server or * for all"
                />
              </div>
              <div>
                <label style={{ display: 'block', color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: '4px', fontWeight: fontWeight.medium }}>Threshold *</label>
                <input
                  type="number"
                  value={form.threshold}
                  onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                  style={inputStyle()}
                  placeholder="e.g. 80"
                />
              </div>
              <div>
                <label style={{ display: 'block', color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: '4px', fontWeight: fontWeight.medium }}>Duration (min)</label>
                <input
                  type="number"
                  value={form.duration_min}
                  onChange={(e) => setForm((f) => ({ ...f, duration_min: e.target.value }))}
                  style={inputStyle()}
                  placeholder="e.g. 5"
                />
              </div>
            </div>
            {formError && <div style={{ color: colors.accent.red, fontSize: fontSize.base, marginBottom: `${spacing.sm}px` }}>{formError}</div>}
            <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
              <button type="submit" disabled={formSaving} className="btn-primary" style={buttonStyle('primary')}>
                {formSaving ? 'Saving...' : 'Create Rule'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(EMPTY_RULE); setFormError('') }}
                className="btn-ghost"
                style={buttonStyle('ghost')}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {rules.length === 0 ? (
          <div style={emptyStateStyle()}>No alert rules configured</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
            {rules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  ...cardStyle({ hoverable: false }),
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${spacing.md}px`,
                  flexWrap: 'wrap',
                  opacity: rule.enabled ? 1 : 0.7,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: rule.enabled ? colors.text.primary : colors.text.secondary, fontWeight: fontWeight.semibold, marginBottom: '4px' }}>
                    {rule.name}
                  </div>
                  <div style={{ color: colors.text.secondary, fontSize: fontSize.sm, display: 'flex', gap: `${spacing.md}px`, flexWrap: 'wrap' }}>
                    <span>{rule.condition_type}</span>
                    {rule.target && <span>target: {rule.target}</span>}
                    <span>threshold: {rule.threshold}</span>
                    {rule.duration_min && <span>for {rule.duration_min}m</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleToggleRule(rule)}
                  className={rule.enabled ? 'toggle-enabled' : 'toggle-disabled'}
                  style={{
                    ...buttonStyle('ghost'),
                    fontSize: fontSize.base,
                    padding: '5px 12px',
                  }}
                >
                  {rule.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  className="btn-danger"
                  style={{ ...buttonStyle('danger'), padding: '5px 12px', fontSize: fontSize.base }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
