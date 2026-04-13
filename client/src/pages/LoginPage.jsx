import { useState, useMemo } from 'react'
import { Activity, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { apiLogin, setToken } from '../api.js'
import { colors, radius, shadow } from '../theme.js'

// Random bar colors pulled from the app palette
const BAR_COLORS = [
  colors.accent.red,
  colors.accent.green,
  colors.accent.blue,
  colors.accent.purple,
  colors.accent.orange,
  colors.accent.pink,
]

function GpuBars() {
  const bars = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      color: BAR_COLORS[i % BAR_COLORS.length],
      opacity: 0.12 + Math.random() * 0.14,
    })), []
  )

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: '14px',
      padding: '0 10%',
      overflow: 'hidden',
      pointerEvents: 'none',
      maskImage: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)',
      WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)',
    }}>
      {bars.map((bar, i) => (
        <div
          key={i}
          className="login-bar"
          style={{
            flex: 1,
            maxWidth: '36px',
            height: '50%',
            background: bar.color,
            opacity: bar.opacity,
          }}
        />
      ))}
    </div>
  )
}

function GridOverlay() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundImage:
        `linear-gradient(rgba(233,69,96,0.03) 1px, transparent 1px),
         linear-gradient(90deg, rgba(233,69,96,0.03) 1px, transparent 1px)`,
      backgroundSize: '40px 40px',
      animation: 'login-gridPulse 4s ease-in-out infinite',
      pointerEvents: 'none',
    }} />
  )
}

function ScanLine() {
  return (
    <div style={{
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: '2px',
      background: `linear-gradient(90deg, transparent, ${colors.accent.red}30, transparent)`,
      animation: 'login-scanLine 4s linear infinite',
      pointerEvents: 'none',
    }} />
  )
}

export default function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password) return
    setError('')
    setLoading(true)
    try {
      const { token } = await apiLogin(password)
      setToken(token)
      onLogin()
    } catch {
      setError('Invalid password')
      setShakeKey(k => k + 1)
    } finally {
      setLoading(false)
    }
  }

  const fontDisplay = "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif"
  const fontMono = "'JetBrains Mono', monospace"

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.bg.primary,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient background */}
      <GridOverlay />
      <GpuBars />
      <ScanLine />

      {/* Radial glow behind card */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${colors.accent.red}08 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Login card */}
      <form
        onSubmit={handleSubmit}
        className="login-card"
        style={{
          position: 'relative',
          background: `linear-gradient(170deg, ${colors.bg.card} 0%, #12121f 100%)`,
          border: `1px solid ${colors.border.default}`,
          borderRadius: radius.xl,
          padding: '44px 36px 36px',
          width: '100%',
          maxWidth: '380px',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          zIndex: 1,
        }}
      >
        {/* Card scan line */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius.xl,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: '1px',
            background: `linear-gradient(90deg, transparent, ${colors.accent.red}20, ${colors.accent.purple}20, transparent)`,
            animation: 'login-scanLine 6s linear infinite',
          }} />
        </div>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            className="login-logo-icon"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `linear-gradient(135deg, ${colors.accent.red}, ${colors.accent.purple})`,
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              marginBottom: '16px',
              boxShadow: `0 6px 24px ${colors.accent.red}30`,
            }}
          >
            <Activity size={28} strokeWidth={2.5} color="#fff" />
          </div>
          <h1 style={{
            fontFamily: fontDisplay,
            color: colors.text.primary,
            fontSize: '26px',
            fontWeight: 700,
            letterSpacing: '-0.5px',
            marginBottom: '6px',
          }}>
            GPU Monitor
          </h1>
          <p style={{
            fontFamily: fontMono,
            color: colors.text.muted,
            fontSize: '11px',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}>
            Authentication Required
          </p>
        </div>

        {/* Divider */}
        <div style={{
          height: '1px',
          background: `linear-gradient(90deg, transparent, ${colors.border.light}, transparent)`,
          marginBottom: '28px',
        }} />

        {/* Password field */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontFamily: fontMono,
            color: colors.text.muted,
            fontSize: '10px',
            fontWeight: 600,
            marginBottom: '8px',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
          }}>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: colors.text.muted,
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              transition: 'color 0.15s ease',
            }}>
              <Lock size={15} />
            </div>
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Enter password"
              autoFocus
              className="login-input"
              style={{
                width: '100%',
                background: colors.bg.input,
                color: colors.text.primary,
                border: `1px solid ${error ? colors.accent.red + '80' : colors.border.default}`,
                borderRadius: radius.md,
                padding: '0 40px 0 42px',
                height: '48px',
                fontSize: '14px',
                fontFamily: fontMono,
                letterSpacing: '0.5px',
                transition: 'all 0.2s ease',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              style={{
                position: 'absolute',
                right: '6px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: colors.text.muted,
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: radius.sm,
                transition: 'color 0.15s ease',
              }}
              tabIndex={-1}
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            key={shakeKey}
            className="login-error-shake"
            style={{
              color: colors.accent.red,
              fontSize: '12px',
              fontFamily: fontMono,
              marginBottom: '16px',
              textAlign: 'center',
              padding: '8px 12px',
              background: `${colors.accent.red}08`,
              border: `1px solid ${colors.accent.red}20`,
              borderRadius: radius.md,
            }}
          >
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !password}
          className="login-btn"
          style={{
            width: '100%',
            height: '48px',
            background: loading || !password
              ? colors.border.default
              : `linear-gradient(135deg, ${colors.accent.red}, #c73550)`,
            color: loading || !password ? colors.text.muted : '#fff',
            border: 'none',
            borderRadius: radius.md,
            fontSize: '14px',
            fontFamily: fontDisplay,
            fontWeight: 600,
            cursor: loading || !password ? 'default' : 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            letterSpacing: '0.3px',
          }}
        >
          {loading ? (
            <>
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.6s linear infinite',
              }} />
              Authenticating
            </>
          ) : (
            <>
              Sign In
              <ArrowRight size={16} strokeWidth={2.5} />
            </>
          )}
        </button>

        {/* Footer */}
        <div style={{
          marginTop: '24px',
          textAlign: 'center',
          fontFamily: fontMono,
          fontSize: '10px',
          color: colors.text.muted,
          letterSpacing: '0.5px',
          opacity: 0.6,
        }}>
          Secured session
        </div>
      </form>
    </div>
  )
}
