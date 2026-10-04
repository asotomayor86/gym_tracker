import type { ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { ForcedPasswordChange } from './components/auth/AccountSection'
import { mockAuthActive, useAuth } from './components/auth/authShim'
import { bodyWeightReady } from './components/weight/weightData'
import { LoginSheetHost, NavDot, SyncBadge } from './components/SyncUI'
import ExercisesPage from './pages/ExercisesPage'
import BodyWeightPage from './pages/BodyWeightPage'
import HomePage from './pages/HomePage'
import InvitePage from './pages/InvitePage'
import LoginPage from './pages/LoginPage'
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

/** Fondo vivo y contenido de las pantallas sin sesión. */
function Bare({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div className="live-bg" aria-hidden><i /><i /><i /><i /></div>
      {children}
    </div>
  )
}

/** La app solo funciona con cuenta: sin sesión → acceso (o registro por invitación); con reinicio de contraseña → cambio obligatorio. */
export default function App() {
  const auth = useAuth()
  if (mockAuthActive()) {
    if (auth.status === 'loading') return <Bare><main className="grid min-h-dvh place-items-center text-sm text-mute" aria-busy="true">Cargando…</main></Bare>
    if (auth.status !== 'authenticated') {
      return (
        <Bare>
          <Routes>
            <Route path="/invitacion/:codigo" element={<InvitePage />} />
            <Route path="*" element={<LoginPage />} />
          </Routes>
        </Bare>
      )
    }
    if (auth.mustChangePassword) return <Bare><ForcedPasswordChange /></Bare>
  }
  return <MainApp />
}

function MainApp() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `press flex flex-1 md:flex-none flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3
     rounded-2xl px-1 py-2 md:px-4 md:py-3 text-[0.65rem] md:text-sm font-semibold ${
      isActive ? 'bg-gradient-to-br from-signal to-signal-2 text-on-signal' : 'text-mute hover:text-ink'
    }`

  return (
    <div className="min-h-dvh md:flex">
      <div className="live-bg" aria-hidden><i /><i /><i /><i /></div>
      <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-30 md:hidden"><SyncBadge /></div>
      <LoginSheetHost />
      <nav
        className="glass-flat fixed bottom-3 inset-x-3 z-20 flex gap-1 p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]
                   md:sticky md:top-4 md:bottom-auto md:inset-x-auto md:m-4 md:h-[calc(100dvh-2rem)] md:w-60 md:shrink-0 md:flex-col md:justify-start md:gap-1 md:p-3"
      >
        <div className="hidden md:block px-3 pt-3 pb-7">
          <div className="display heat text-3xl leading-tight pb-1">Gym<br />Tracker</div>
          <div className="eyebrow mt-3">Registro de series</div>
          <SyncBadge className="mt-3" />
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={link}>
            <span className="relative shrink-0">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={n.d} />
            </svg>
              {n.to === '/settings' && <NavDot />}
            </span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="min-w-0 flex-1 pb-32 md:pb-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/templates/:id" element={<TemplateEditPage />} />
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/stats" element={<StatsPage />} />
          {bodyWeightReady() && <Route path="/peso" element={<BodyWeightPage />} />}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/invitacion/:codigo" element={<InvitePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
