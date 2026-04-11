const BASE = '/api'

async function fetchJSON(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

function toQuery(params) {
  if (!params) return ''
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) q.set(k, v)
  }
  const s = q.toString()
  return s ? '?' + s : ''
}

// Users
export const getUsers = (params) => fetchJSON('/users' + toQuery(params))
export const getUser = (username) => fetchJSON(`/users/${encodeURIComponent(username)}`)
export const getUserHistory = (username, params) =>
  fetchJSON(`/users/${encodeURIComponent(username)}/history` + toQuery(params))

// GPUs
export const getGpus = (params) => fetchJSON('/gpus' + toQuery(params))
export const getGpu = (server, idx) =>
  fetchJSON(`/gpus/${encodeURIComponent(server)}/${idx}`)
export const getGpuHistory = (server, idx, params) =>
  fetchJSON(`/gpus/${encodeURIComponent(server)}/${idx}/history` + toQuery(params))

// Servers
export const getServers = () => fetchJSON('/servers')
export const getServer = (name) => fetchJSON(`/servers/${encodeURIComponent(name)}`)
export const getServerHistory = (name, params) =>
  fetchJSON(`/servers/${encodeURIComponent(name)}/history` + toQuery(params))
export const addServer = (data) =>
  fetchJSON('/servers', { method: 'POST', body: JSON.stringify(data) })
export const updateServer = (name, data) =>
  fetchJSON(`/servers/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteServer = (name) =>
  fetchJSON(`/servers/${encodeURIComponent(name)}`, { method: 'DELETE' })

// Alerts
export const getAlerts = (params) => fetchJSON('/alerts' + toQuery(params))
export const acknowledgeAlert = (id) =>
  fetchJSON(`/alerts/${id}/acknowledge`, { method: 'POST' })
export const getAlertRules = () => fetchJSON('/alert-rules')
export const createAlertRule = (data) =>
  fetchJSON('/alert-rules', { method: 'POST', body: JSON.stringify(data) })
export const updateAlertRule = (id, data) =>
  fetchJSON(`/alert-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteAlertRule = (id) =>
  fetchJSON(`/alert-rules/${id}`, { method: 'DELETE' })

// Collector
export const getCollectorStatus = () => fetchJSON('/collector/status')
export const startCollector = () => fetchJSON('/collector/start', { method: 'POST' })
export const stopCollector = () => fetchJSON('/collector/stop', { method: 'POST' })
export const updateCollectorConfig = (data) =>
  fetchJSON('/collector/config', { method: 'PUT', body: JSON.stringify(data) })

// Stats / Cleanup
export const getStats = () => fetchJSON('/stats')
export const triggerCleanup = () => fetchJSON('/cleanup', { method: 'POST' })
