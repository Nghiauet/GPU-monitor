import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { buttonStyle } from '../theme.js'

export default function RefreshButton({ onRefresh }) {
  const [spinning, setSpinning] = useState(false)

  function handleClick() {
    setSpinning(true)
    onRefresh()
    setTimeout(() => setSpinning(false), 600)
  }

  return (
    <button
      onClick={handleClick}
      title="Refresh now"
      className="btn-ghost"
      style={buttonStyle('ghost')}
    >
      <span
        className={spinning ? 'spin' : undefined}
        style={{ display: 'inline-flex', alignItems: 'center' }}
      >
        <RefreshCw size={15} strokeWidth={2} />
      </span>
    </button>
  )
}
