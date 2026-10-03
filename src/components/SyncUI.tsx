import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { login } from '../lib/sync'
import { pendingText, type SyncKind, useSyncView } from '../lib/syncView'
import { Button, inputCls } from './ui'
import { DESC, ICON, LABEL, TONE, openLogin, setSheet, useSheetOpen } from './syncMeta'

/**
 * Interfaz de sincronización: indicador de estado siempre visible, aviso cuando no hay sesión,
 * formulario de acceso (en Ajustes y en una hoja inferior) y resultado de la primera subida.
 */

const Svg = ({ d, className = 'size-3.5' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
)
export const KindIcon = ({ kind }: { kind: SyncKind }) => <Svg d={ICON[kind]} className="size-5" />

/** Indicador discreto: icono + texto corto. Sin sesión abre el acceso; en el resto lleva a Ajustes. */
export function SyncBadge({ className = '' }: { className?: string }) {
  const v = useSyncView()
  const cls = `press inline-flex h-6 items-center gap-1.5 rounded-full border bg-paper/70 px-2.5 text-[0.68rem] font-semibold backdrop-blur ${TONE[v.kind]} ${className}`
  const body = (
    <>
      <span className={v.kind === 'syncing' ? 'animate-spin' : ''}><Svg d={ICON[v.kind]} /></span>
      <span>{LABEL[v.kind](v.pending)}</span>
    </>
  )
  const aria = DESC[v.kind](v.pending)
  return v.kind === 'nosession'
    ? <button type="button" onClick={openLogin} aria-label={`${aria}. Iniciar sesión`} className={cls}>{body}</button>
    : <Link to="/settings" role="status" aria-label={aria} className={cls}>{body}</Link>
}

/** Punto sobre el icono de Ajustes en la navegación: visible solo si hay algo que atender. */
export function NavDot() {
  const v = useSyncView()
  if (v.kind === 'synced' || v.kind === 'syncing') return null
  const color = v.kind === 'error' ? 'bg-e-fail' : v.kind === 'offline' ? 'bg-cold' : 'bg-signal'
  return <span aria-hidden className={`absolute -right-1 -top-1 size-2.5 rounded-full ring-2 ring-[var(--surface)] ${color} ${v.kind === 'nosession' ? 'animate-pulse' : ''}`} />
}

/* ---------- Formulario de acceso ---------- */
function loginError(e: unknown): string {
  if (!navigator.onLine || e instanceof TypeError) return 'Sin conexión: necesitas red para iniciar sesión la primera vez.'
  return e instanceof Error ? e.message : 'No se pudo iniciar sesión'
}

export function LoginForm({ id = 'sync-password', autoFocus, onDone }: { id?: string; autoFocus?: boolean; onDone?: () => void }) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setPhase('busy')
    try {
      const before = await db.outbox.count()
      await login(password)
      const after = await db.outbox.count()
      const up = Math.max(0, before - after)
      setResult(
        after > 0
          ? `Sesión iniciada. Quedan ${pendingText(after)}; se subirán solos.`
          : up > 0 ? `${up} ${up === 1 ? 'cambio subido' : 'cambios subidos'}` : 'Sesión iniciada. Todo está sincronizado',
      )
      setPassword('')
      setPhase('done')
      if (onDone) setTimeout(onDone, 2200)
    } catch (err) {
      setError(loginError(err))
      setPhase('idle')
    }
  }

  if (phase === 'done') {
    return (
      <p role="status" className="flex items-center gap-3 rounded-xl border border-signal/50 bg-signal/10 px-4 py-3 text-sm font-semibold">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-signal text-on-signal"><Svg d={ICON.synced} className="size-4" /></span>
        {result}
      </p>
    )
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor={id} className="eyebrow block">Contraseña</label>
      <div className="relative">
        <input
          id={id} name="password" autoFocus={autoFocus} autoComplete="current-password" enterKeyHint="go"
          type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
          disabled={phase === 'busy'} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
          className={`${inputCls} pr-24 text-base`}
        />
        <button
          type="button" onClick={() => setShow((s) => !s)} aria-pressed={show}
          className="absolute inset-y-1 right-1 rounded-lg px-3 text-xs font-semibold text-mute hover:text-ink"
        >
          {show ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      <p id={`${id}-err`} role="alert" className={`text-sm text-e-fail ${error ? '' : 'hidden'}`}>{error}</p>
      <Button type="submit" disabled={!password || phase === 'busy'} className="w-full">
        {phase === 'busy' ? (
          <span className="inline-flex items-center gap-2"><span className="animate-spin"><Svg d={ICON.syncing} className="size-4" /></span>Sincronizando…</span>
        ) : 'Iniciar sesión y sincronizar'}
      </Button>
    </form>
  )
}

/* ---------- Hoja inferior (móvil) / modal (escritorio) ---------- */
export function LoginSheetHost() {
  const open = useSheetOpen()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(false)
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="sheet-fade absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setSheet(false)} aria-hidden />
      <div
        role="dialog" aria-modal="true" aria-labelledby="login-title"
        className="sheet-in glass-flat relative w-full max-w-md space-y-4 !rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:!rounded-[20px] md:pb-5"
      >
        <button type="button" onClick={() => setSheet(false)} aria-label="Cerrar" className="press absolute right-3 top-3 grid size-9 place-items-center rounded-full text-mute hover:text-ink">
          <Svg d="M6 6l12 12M18 6L6 18" className="size-4" />
        </button>
        <div className="pr-10">
          <h2 id="login-title" className="display text-xl">Inicia sesión</h2>
          <p className="mt-1 text-sm text-mute">Sincroniza tus entrenos con la nube. Seguirás pudiendo entrenar sin conexión.</p>
        </div>
        <LoginForm id="sheet-password" autoFocus onDone={() => setSheet(false)} />
      </div>
    </div>
  )
}

/* ---------- Aviso persistente sin sesión ---------- */
export function SyncBanner({ onLogin }: { onLogin?: () => void }) {
  const v = useSyncView()
  if (v.loggedIn) return null
  const expired = !!v.error?.startsWith('Sesión caducada')
  return (
    <section role="status" className="glass relative flex flex-col gap-4 overflow-hidden !border-signal/60 p-4 sm:flex-row sm:items-center sm:p-5">
      <span aria-hidden className="relative grid size-11 shrink-0 place-items-center rounded-full bg-signal text-on-signal">
        <span className="pulse-ring" />
        <Svg d={ICON.nosession} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="display text-base" style={{ lineHeight: 1.3 }}>{expired ? 'Tu sesión ha caducado' : 'Tus entrenos solo están en este dispositivo'}</h2>
        <p className="mt-1 text-sm text-mute">
          Inicia sesión para sincronizarlos con la nube y no perderlos si cambias de móvil.
          {v.pending > 0 && <> <b className="text-ink">{pendingText(v.pending)}</b> esperando subir.</>}
        </p>
      </div>
      <Button onClick={onLogin ?? openLogin} className="shrink-0">Iniciar sesión</Button>
    </section>
  )
}

/* ---------- Panel de estado (Ajustes) ---------- */
export function StatusFacts({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {items.map((i) => (
        <div key={i.k} className="rounded-xl border border-hair bg-ink/5 px-2 py-2.5">
          <dt className="eyebrow !text-[0.62rem]">{i.k}</dt>
          <dd className="num mt-1 text-sm font-semibold">{i.v}</dd>
        </div>
      ))}
    </dl>
  )
}
