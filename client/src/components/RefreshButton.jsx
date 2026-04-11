import { useState, useEffect } from 'react'

let styleInjected = false

export default function RefreshButton({ onRefresh }) {
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    if (styleInjected) return
    const style = document.createElement('style')
    style.textContent = '@keyframes refresh-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }'
    document.head.appendChild(style)
    styleInjected = true
  }, [])

  function handleClick() {
    setSpinning(true)
    onRefresh()
    setTimeout(() => setSpinning(false), 600)
  }

  return (
    <button
      onClick={handleClick}
      title="Refresh now"
      style={{
        background: 'none',
        border: '1px solid #2a3a5c',
        borderRadius: '4px',
        color: '#888',
        cursor: 'pointer',
        padding: '4px 8px',
        fontSize: '14px',
        lineHeight: 1,
        transition: 'color 0.15s, border-color 0.15s',
        display: 'flex',
        alignItems: 'center',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#e0e0e0'; e.currentTarget.style.borderColor = '#4fc3f7' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#2a3a5c' }}
    >
      <span style={{
        display: 'inline-block',
        animation: spinning ? 'refresh-spin 0.6s linear' : 'none',
      }}>
        ↻
      </span>
    </button>
  )
}
