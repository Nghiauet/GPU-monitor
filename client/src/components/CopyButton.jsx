import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { colors, buttonStyle } from '../theme.js'

export default function CopyButton({ getText }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      const text = getText()
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const text = getText()
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={copied ? 'btn-success' : 'btn-secondary'}
      style={{
        ...buttonStyle(copied ? 'success' : 'secondary'),
        fontSize: '12px',
        padding: '6px 12px',
      }}
    >
      {copied ? <><Check size={14} strokeWidth={2.5} /> Copied</> : <><Copy size={14} /> Copy</>}
    </button>
  )
}
