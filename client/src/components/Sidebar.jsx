import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Users, Cpu, Server, Bell, Settings, X, Activity, LogOut } from 'lucide-react'
import StatusIndicator from './StatusIndicator.jsx'
import AlertBadge from './AlertBadge.jsx'
import { getCollectorStatus } from '../api.js'
import { timeAgo } from '../utils/fmt.js'
import { colors, spacing, fontSize, fontWeight, radius, transition, shadow } from '../theme.js'

const navItems = [
  { to: '/users', label: 'Users', Icon: Users },
  { to: '/gpus', label: 'GPUs', Icon: Cpu },
  { to: '/servers', label: 'Servers', Icon: Server },
  { to: '/alerts', label: 'Alerts', Icon: Bell },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

export default function Sidebar({ isMobile, onClose, onLogout }) {
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
  const isCollecting = status?.collecting === true
  const lastRun = status?.lastRunAt || null
  const lastError = status?.lastError || null
  const durationMs = status?.lastDurationMs || null

  // Re-render every second to keep time-ago fresh
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <aside style={{
      width: isMobile ? '260px' : '220px',
      minWidth: isMobile ? '260px' : '220px',
      background: colors.bg.secondary,
      display: 'flex',
      flexDirection: 'column',
      borderRight: `1px solid ${colors.border.default}`,
      ...(isMobile ? {
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 99,
        boxShadow: shadow.lg,
      } : {}),
    }}>
      {/* Logo + close on mobile */}
      <div style={{
        padding: `${spacing.xl}px ${spacing.lg}px ${spacing.lg}px`,
        borderBottom: `1px solid ${colors.border.default}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
          <span style={{
            background: `linear-gradient(135deg, ${colors.accent.red}, ${colors.accent.purple})`,
            width: '28px',
            height: '28px',
            borderRadius: radius.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: `0 2px 8px ${colors.accent.red}33`,
          }}>
            <Activity size={16} strokeWidth={2.5} />
          </span>
          <span style={{
            color: colors.text.primary,
            fontWeight: fontWeight.bold,
            fontSize: fontSize.xl,
            letterSpacing: '-0.3px',
          }}>
            GPU Monitor
          </span>
        </div>
        {isMobile && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: colors.text.muted,
              cursor: 'pointer',
              padding: '2px',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: `${spacing.sm}px` }}>
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className="nav-link"
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: `${spacing.md}px`,
              padding: isMobile ? '12px 14px' : '10px 14px',
              color: isActive ? '#fff' : colors.text.secondary,
              background: isActive ? colors.accent.red : 'transparent',
              borderRadius: radius.md,
              transition: `all ${transition.fast}`,
              fontSize: fontSize.lg,
              fontWeight: isActive ? fontWeight.semibold : fontWeight.normal,
              marginBottom: '2px',
              ...(isActive ? { boxShadow: `0 2px 8px ${colors.accent.red}33` } : {}),
            })}
          >
            <Icon size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />
            <span>{label}</span>
            {label === 'Alerts' && <AlertBadge />}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div style={{ padding: `${spacing.sm}px ${spacing.sm}px 0` }}>
        <button
          onClick={onLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.md}px`,
            padding: '10px 14px',
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderRadius: radius.md,
            color: colors.text.muted,
            fontSize: fontSize.lg,
            cursor: 'pointer',
            transition: `all ${transition.fast}`,
          }}
          className="nav-link"
        >
          <LogOut size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />
          <span>Logout</span>
        </button>
      </div>

      {/* Collector status */}
      <div style={{
        padding: `${spacing.md}px ${spacing.lg}px`,
        borderTop: `1px solid ${colors.border.default}`,
        fontSize: fontSize.sm,
        color: colors.text.muted,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <StatusIndicator
            color={isCollecting ? 'blue' : isRunning ? 'green' : 'gray'}
            size={8}
            pulse={isCollecting || isRunning}
          />
          <span style={{
            color: isCollecting ? colors.status.info : isRunning ? colors.status.healthy : colors.text.muted,
            fontWeight: fontWeight.semibold,
            fontSize: fontSize.base,
          }}>
            {isCollecting ? 'Collecting...' : isRunning ? 'Running' : 'Stopped'}
          </span>
        </div>
        {lastRun && (
          <div style={{ color: lastError ? colors.accent.red : colors.text.muted, marginBottom: '2px' }}>
            {lastError ? 'Error ' : 'Last: '}{timeAgo(lastRun) || 'Never'}
          </div>
        )}
        {lastRun && !lastError && durationMs != null && (
          <div style={{ color: colors.text.muted }}>
            Took {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
          </div>
        )}
        {lastError && (
          <div style={{
            color: colors.accent.red,
            fontSize: fontSize.xs,
            marginTop: '2px',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
            title={lastError}
          >
            {lastError.split('\n')[0]}
          </div>
        )}
      </div>
    </aside>
  )
}
