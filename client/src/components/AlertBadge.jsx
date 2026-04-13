import { useState, useEffect } from 'react'
import { getAlerts } from '../api.js'
import { colors, radius, fontSize, fontWeight } from '../theme.js'

export default function AlertBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const data = await getAlerts({ acknowledged: false })
        if (!cancelled) {
          const alerts = Array.isArray(data) ? data : (data.alerts || [])
          setCount(alerts.length)
        }
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

  if (count === 0) return null

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: colors.accent.red,
      color: '#fff',
      borderRadius: radius.pill,
      padding: '1px 7px',
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      minWidth: '18px',
      marginLeft: '8px',
      boxShadow: `0 0 8px ${colors.accent.red}44`,
      lineHeight: 1.4,
    }}>
      {count}
    </span>
  )
}
