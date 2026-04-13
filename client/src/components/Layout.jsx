import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar.jsx'
import { useIsMobile } from '../hooks/useIsMobile.js'
import { colors, spacing, radius, shadow } from '../theme.js'

export default function Layout({ onLogout }) {
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
  }, [location.pathname, isMobile])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {isMobile && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            position: 'fixed',
            top: '10px',
            left: '10px',
            zIndex: 50,
            background: colors.bg.card,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radius.md,
            color: colors.text.primary,
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: shadow.md,
          }}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
      )}

      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: colors.bg.overlay,
            zIndex: 98,
          }}
        />
      )}

      {(!isMobile || sidebarOpen) && (
        <Sidebar
          isMobile={isMobile}
          onClose={() => setSidebarOpen(false)}
          onLogout={onLogout}
        />
      )}

      <main style={{
        flex: 1,
        padding: isMobile ? '56px 16px 16px' : `${spacing.xxl}px ${spacing.xxxl}px`,
        overflowY: 'auto',
        background: colors.bg.primary,
        maxWidth: '100%',
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
