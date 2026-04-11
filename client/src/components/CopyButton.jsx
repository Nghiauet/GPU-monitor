import { useState } from 'react'

export default function CopyButton({ getText }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      const text = getText()
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for non-HTTPS contexts
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
      style={{
        background: copied ? '#4ecca3' : '#2a3a5c',
        color: copied ? '#1a1a2e' : '#e0e0e0',
        border: 'none',
        borderRadius: '4px',
        padding: '5px 12px',
        fontSize: '12px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontWeight: copied ? 600 : 400,
      }}
    >
      {copied ? 'Copied!' : 'Copy Status'}
    </button>
  )
}
