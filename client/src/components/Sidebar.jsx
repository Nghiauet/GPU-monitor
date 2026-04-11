import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import StatusIndicator from './StatusIndicator.jsx'
import AlertBadge from './AlertBadge.jsx'
import { getCollectorStatus } from '../api.js'

const navItems = [
  { to: '/users', label: 'Users', icon: '👤' },
  { to: '/gpus', label: 'GPUs', icon: '⚡' },
  { to: '/servers', label: 'Servers', icon: '🖥' },
  { to: '/alerts', label: 'Alerts', icon: '🔔', badge: true },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

function formatTime(isoStr) {
  if (!isoStr) return 'Never'
  try {
    return new Date(isoStr).toLocaleTimeString()
  } catch {
    return isoStr
  }
}

export default function Sidebar() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const data = await getCollectorStatus()
        if (!cancelled) setStatus(data)
      } catch {
        // ignore
      }
    }

    poll()
    const id = setInterval(poll, 10000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const isRunning = status?.running === true
  const lastRun = status?.last_run || status?.lastRun || null

  return (
    <aside style={{
      width: '200px',
      minWidth: '200px',
      background: '#16213e',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid #2a3a5c',
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 16px 16px',
        borderBottom: '1px solid #2a3a5c',
      }}>
        <span style={{
          color: '#e94560',
          fontWeight: 700,
          fontSize: '18px',
          letterSpacing: '0.5px',
        }}>
          GPU Monitor
        </span>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {navItems.map(({ to, label, icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 16px',
              color: isActive ? '#fff' : '#b0b0c0',
              background: isActive ? '#e94560' : 'transparent',
              transition: 'background 0.15s, color 0.15s',
              fontSize: '14px',
              fontWeight: isActive ? 600 : 400,
            })}
          >
            <span style={{ fontSize: '16px', lineHeight: 1 }}>{icon}</span>
            <span>{label}</span>
            {badge && <AlertBadge />}
          </NavLink>
        ))}
      </nav>

      {/* Collector status */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #2a3a5c',
        fontSize: '11px',
        color: '#888',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <StatusIndicator color={isRunning ? 'green' : 'gray'} size={8} />
          <span style={{ color: isRunning ? '#4ecca3' : '#888', fontWeight: 600 }}>
            {isRunning ? 'Running' : 'Stopped'}
          </span>
        </div>
        {lastRun && (
          <div style={{ color: '#666' }}>Last: {formatTime(lastRun)}</div>
        )}
      </div>
    </aside>
  )
}
