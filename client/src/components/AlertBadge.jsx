import { useState, useEffect } from 'react'
import { getAlerts } from '../api.js'

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
      background: '#e94560',
      color: '#fff',
      borderRadius: '10px',
      padding: '1px 6px',
      fontSize: '11px',
      fontWeight: 600,
      minWidth: '18px',
      marginLeft: '6px',
    }}>
      {count}
    </span>
  )
}
