import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { type SyncKind, useSyncView } from '../lib/syncView'
import { DESC, ICON, LABEL, TONE } from './syncMeta'

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
  return (
    <Link to="/settings" role="status" aria-label={aria} className={cls}>{body}</Link>
  )
}

/** Punto sobre el icono de Ajustes en la navegación: visible solo si hay algo que atender. */
export function NavDot() {
  const v = useSyncView()
  if (v.kind === 'synced' || v.kind === 'syncing') return null
  const color = v.kind === 'error' ? 'bg-e-fail' : v.kind === 'offline' ? 'bg-cold' : 'bg-signal'
  return <span aria-hidden className={`absolute -right-1 -top-1 size-2.5 rounded-full ring-2 ring-[var(--surface)] ${color} ${v.kind === 'nosession' ? 'animate-pulse' : ''}`} />
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
