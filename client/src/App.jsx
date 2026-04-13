import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import LoginPage from './pages/LoginPage.jsx'
import UsersPage from './pages/UsersPage.jsx'
import UserDetailPage from './pages/UserDetailPage.jsx'
import GpusPage from './pages/GpusPage.jsx'
import ServersPage from './pages/ServersPage.jsx'
import AlertsPage from './pages/AlertsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import { getToken, clearToken, setOnUnauthorized, apiLogout } from './api.js'

export default function App() {
  const [authed, setAuthed] = useState(!!getToken())

  const handleLogout = useCallback(() => {
    apiLogout()
    clearToken()
    setAuthed(false)
  }, [])

  // Listen for 401 responses from any API call
  useEffect(() => {
    setOnUnauthorized(() => setAuthed(false))
    return () => setOnUnauthorized(null)
  }, [])

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />
  }

  return (
    <Routes>
      <Route path="/" element={<Layout onLogout={handleLogout} />}>
        <Route index element={<Navigate to="/users" replace />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:username" element={<UserDetailPage />} />
        <Route path="gpus" element={<GpusPage />} />
        <Route path="servers" element={<ServersPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
