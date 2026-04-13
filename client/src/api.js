const BASE = '/api'

// Auth token storage
export function getToken() { return localStorage.getItem('gpu_monitor_token') }
export function setToken(token) { localStorage.setItem('gpu_monitor_token', token) }
export function clearToken() { localStorage.removeItem('gpu_monitor_token') }

// Listeners for 401 events (auth gate subscribes to this)
let onUnauthorized = null
export function setOnUnauthorized(fn) { onUnauthorized = fn }

async function fetchJSON(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(BASE + path, { ...options, headers })
  if (res.status === 401) {
    clearToken()
    if (onUnauthorized) onUnauthorized()
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

// Auth
export const apiLogin = (password) =>
  fetchJSON('/auth/login', { method: 'POST', body: JSON.stringify({ password }) })
export const apiLogout = () =>
  fetchJSON('/auth/logout', { method: 'POST' }).catch(() => {})

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
export const getUserJobs = (username, params) =>
  fetchJSON(`/users/${encodeURIComponent(username)}/jobs` + toQuery(params))
export const getUsersSummary = (params) => fetchJSON('/users/summary' + toQuery(params))
export const getAllUsersHistory = (params) => fetchJSON('/users/history' + toQuery(params))

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
export const getAlertRules = () => fetchJSON('/alerts/rules')
export const createAlertRule = (data) =>
  fetchJSON('/alerts/rules', { method: 'POST', body: JSON.stringify(data) })
export const updateAlertRule = (id, data) =>
  fetchJSON(`/alerts/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteAlertRule = (id) =>
  fetchJSON(`/alerts/rules/${id}`, { method: 'DELETE' })

// Collector
export const getCollectorStatus = () => fetchJSON('/collector/status')
export const startCollector = () => fetchJSON('/collector/start', { method: 'POST' })
export const stopCollector = () => fetchJSON('/collector/stop', { method: 'POST' })
export const updateCollectorConfig = (data) =>
  fetchJSON('/collector/config', { method: 'PUT', body: JSON.stringify(data) })

// Stats / Cleanup
export const getStats = () => fetchJSON('/stats')
export const triggerCleanup = () => fetchJSON('/stats/cleanup', { method: 'POST' })
