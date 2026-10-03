import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { MUSCLE_LABELS } from '../lib/labels'
import { MUSCLE_GROUPS, type MuscleGroup } from '../lib/types'

/** Tarjeta de cristal (con desenfoque). Para listas largas usar `cardFlat`. */
export const card = 'glass'
export const cardFlat = 'glass-flat'
export const inputCls =
  'w-full rounded-xl border border-hair bg-ink/5 px-3 py-2 min-h-11 outline-none transition-colors focus:border-signal'

export function Button({
  variant = 'primary', className = '', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-gradient-to-br from-signal to-signal-2 text-on-signal glow',
    ghost: 'border border-hair bg-ink/5 text-ink hover:bg-ink/10',
    danger: 'border border-e-fail/60 text-e-fail hover:bg-e-fail hover:text-on-signal',
  }[variant]
  return (
    <button
      {...props}
      className={`press rounded-full px-5 min-h-11 text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none ${styles} ${className}`}
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
      <header className="mb-7 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <h1 className="display heat text-[clamp(1.9rem,9.5vw,3.75rem)] pb-1">{title}</h1>
        </div>
        {actions && <div className="pb-1 shrink-0">{actions}</div>}
      </header>
      <div className="rise space-y-7">{children}</div>
    </div>
  )
}

/** Cabecera de sección numerada. */
export function SectionTitle({ n, children, aside }: { n?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="flex items-baseline gap-2.5">
        {n && <span className="num text-xs text-signal-text">{n}</span>}
        <span className="display text-lg">{children}</span>
      </h2>
      {aside && <span className="eyebrow">{aside}</span>}
    </div>
  )
}

/** Barra de calor: relleno proporcional con degradado acero → blanco → ámbar. */
export function HeatBar({ value, max = 1, label, note, cold }: { value: number; max?: number; label: string; note?: ReactNode; cold?: boolean }) {
  const pct = Math.max(2, Math.min(100, (value / Math.max(max, 1e-9)) * 100))
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        {note && <span className={`text-xs font-semibold ${cold ? 'text-cold' : 'text-signal-text'}`}>{note}</span>}
      </div>
      <div className="heat-track"><div className="heat-fill" style={{ width: `${pct}%`, opacity: cold ? 0.8 : 1 }} /></div>
    </div>
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
  return ready ? <p className="text-mute">{children}</p> : <p className="text-xs text-mute" aria-busy="true">Cargando…</p>
}

export function MuscleSelect({
  value, onChange,
}: { value: MuscleGroup; onChange: (m: MuscleGroup) => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as MuscleGroup)}>
      {MUSCLE_GROUPS.map((m) => (
        <option key={m} value={m}>{MUSCLE_LABELS[m]}</option>
      ))}
    </select>
  )
}
