import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import UsersPage from './pages/UsersPage.jsx'
import UserDetailPage from './pages/UserDetailPage.jsx'
import GpusPage from './pages/GpusPage.jsx'
import ServersPage from './pages/ServersPage.jsx'
import AlertsPage from './pages/AlertsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
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
