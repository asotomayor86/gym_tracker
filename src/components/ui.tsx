import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { MUSCLE_LABELS } from '../lib/labels'
import { MUSCLE_GROUPS, type MuscleGroup } from '../lib/types'

export const card = 'bg-surface border border-ink'
export const inputCls =
  'w-full rounded-none border-0 border-b-2 border-ink/30 bg-transparent px-1 py-2 min-h-11 outline-none focus:border-signal'

export function Button({
  variant = 'primary', className = '', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-signal text-on-signal border border-ink hover:brightness-110 active:translate-y-px',
    ghost: 'border border-ink hover:bg-ink hover:text-paper',
    danger: 'border border-e-fail text-e-fail hover:bg-e-fail hover:text-paper',
  }[variant]
  return (
    <button
      {...props}
      className={`px-4 min-h-11 text-sm font-bold uppercase tracking-wider disabled:opacity-40 disabled:pointer-events-none transition-colors ${styles} ${className}`}
    />
  )
}

/** Input no controlado: confirma el valor al salir del campo (evita saltos de cursor con Dexie). */
export function CommitInput({
  value, onCommit, className = inputCls, ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string | number
  onCommit: (v: string) => void
}) {
  return (
    <input
      {...props}
      key={String(value)}
      defaultValue={value}
      className={className}
      onBlur={(e) => e.target.value !== String(value) && onCommit(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

export function Page({
  title, eyebrow, actions, children,
}: { title: string; eyebrow?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 pb-6 md:px-8 md:pt-12">
      <header className="mb-8 flex items-end justify-between gap-3 border-b-4 border-ink pb-3">
        <div>
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <h1 className="display text-6xl md:text-7xl">{title}</h1>
        </div>
        {actions && <div className="pb-1">{actions}</div>}
      </header>
      <div className="rise space-y-8">{children}</div>
    </div>
  )
}

/** Cabecera de sección numerada, como el índice de un manual. */
export function SectionTitle({ n, children, aside }: { n?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-ink pb-1.5">
      <h2 className="flex items-baseline gap-2.5">
        {n && <span className="mono text-xs text-signal font-bold">{n}</span>}
        <span className="display text-2xl">{children}</span>
      </h2>
      {aside && <span className="eyebrow">{aside}</span>}
    </div>
  )
}

export function MuscleSelect({
  value, onChange,
}: { value: MuscleGroup; onChange: (m: MuscleGroup) => void }) {
  return (
    <select className={`${inputCls} bg-surface`} value={value} onChange={(e) => onChange(e.target.value as MuscleGroup)}>
      {MUSCLE_GROUPS.map((m) => (
        <option key={m} value={m}>{MUSCLE_LABELS[m]}</option>
      ))}
    </select>
  )
}

/**
 * Estado vacío con un breve margen: la siembra inicial de la base de datos llega unos instantes
 * después del primer render, así que no se muestra "no hay nada" hasta que pase (evita el parpadeo).
 */
export function EmptyState({ children, delayMs = 600 }: { children: ReactNode; delayMs?: number }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), delayMs)
    return () => clearTimeout(t)
  }, [delayMs])
  return ready ? <p className="text-mute">{children}</p> : <p className="mono text-xs text-mute" aria-busy="true">Cargando…</p>
}
