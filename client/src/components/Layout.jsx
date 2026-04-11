import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'

export default function Layout() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        padding: '24px',
        overflowY: 'auto',
        background: '#1a1a2e',
      }}>
        <Outlet />
      </main>
    </div>
  )
}
