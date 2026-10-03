import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { hasToken, useSyncState } from './lib/sync'
import ExercisesPage from './pages/ExercisesPage'
import HomePage from './pages/HomePage'
import SessionPage from './pages/SessionPage'
import SettingsPage from './pages/SettingsPage'
import StatsPage from './pages/StatsPage'
import TemplateEditPage from './pages/TemplateEditPage'
import TemplatesPage from './pages/TemplatesPage'

const NAV = [
  { to: '/', label: 'Hoy', icon: '🏋️' },
  { to: '/templates', label: 'Rutinas', icon: '📋' },
  { to: '/exercises', label: 'Ejercicios', icon: '💪' },
  { to: '/stats', label: 'Stats', icon: '📊' },
  { to: '/settings', label: 'Ajustes', icon: '⚙️' },
]

function SyncDot() {
  const { status } = useSyncState()
  if (!hasToken()) return null
  const color = { syncing: 'bg-amber-400', ok: 'bg-green-500', error: 'bg-red-500', unauth: 'bg-red-500', idle: 'bg-zinc-400' }[status]
  return <span title={`Sync: ${status}`} className={`inline-block size-2.5 rounded-full ${color}`} />
}

export default function App() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 md:rounded-lg text-xs md:text-base ${
      isActive ? 'text-blue-600 dark:text-blue-400 font-semibold md:bg-blue-50 md:dark:bg-zinc-800' : 'text-zinc-500'
    }`

  return (
    <div className="min-h-dvh md:flex">
      <nav
        className="fixed bottom-0 inset-x-0 z-20 flex justify-around border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950
                   md:static md:w-56 md:flex-col md:justify-start md:gap-1 md:border-t-0 md:border-r md:p-3 md:min-h-dvh"
      >
        <div className="hidden md:flex items-center gap-2 px-3 py-4 text-lg font-bold">
          Gym Tracker <SyncDot />
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={link}>
            <span className="text-lg">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 pb-24 md:pb-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/templates/:id" element={<TemplateEditPage />} />
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
