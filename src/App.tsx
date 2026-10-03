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
  { to: '/', label: 'Hoy', d: 'M3 12h3M18 12h3M6 7v10M18 7v10M9 9v6M15 9v6M9 12h6' },
  { to: '/templates', label: 'Rutinas', d: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3' },
  { to: '/exercises', label: 'Ejercicios', d: 'M12 3v18M4 12h16M7 7l10 10M17 7L7 17' },
  { to: '/stats', label: 'Stats', d: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { to: '/settings', label: 'Ajustes', d: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6' },
]

function SyncDot() {
  const { status } = useSyncState()
  if (!hasToken()) return null
  const color = { syncing: 'bg-e-hard animate-pulse', ok: 'bg-e-easy', error: 'bg-e-fail', unauth: 'bg-e-fail', idle: 'bg-mute' }[status]
  return <span title={`Sync: ${status}`} className={`inline-block size-2 ${color}`} />
}

export default function App() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `relative flex flex-1 md:flex-none flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3
     px-1 py-2.5 md:px-3 text-[0.625rem] md:text-sm font-bold uppercase tracking-widest transition-colors ${
      isActive
        ? `text-ink md:bg-ink md:text-paper before:absolute before:bg-signal before:top-0 before:inset-x-3
           md:before:inset-x-auto md:before:inset-y-0 md:before:left-0 md:before:w-[3px] before:h-[3px] md:before:h-auto`
        : 'text-mute hover:text-ink'
    }`

  return (
    <div className="min-h-dvh md:flex">
      <nav
        className="fixed bottom-0 inset-x-0 z-20 flex border-t-2 border-ink bg-paper pb-[env(safe-area-inset-bottom)]
                   md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:flex-col md:justify-start md:gap-0.5 md:border-t-0 md:border-r-2 md:p-4 md:pb-4"
      >
        <div className="hidden md:block px-3 pt-2 pb-8">
          <div className="display text-5xl">Gym<br />Tracker</div>
          <div className="eyebrow mt-3 flex items-center gap-2">Registro de series <SyncDot /></div>
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={link}>
            <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" aria-hidden>
              <path d={n.d} />
            </svg>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="min-w-0 flex-1 pb-28 md:pb-8">
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
