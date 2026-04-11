export function fmtMem(mb) {
  if (mb == null) return '—'
  return `${(mb / 1024).toFixed(1)} GB`
}

export function fmtElapsed(secs) {
  if (secs == null || secs === 0) return '—'
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h < 24) return `${h}h ${m}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

export function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function tabStyle(active) {
  return {
    padding: '6px 16px',
    fontSize: '13px',
    border: 'none',
    borderBottom: active ? '2px solid #e94560' : '2px solid transparent',
    background: 'transparent',
    color: active ? '#e0e0e0' : '#888',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  }
}
