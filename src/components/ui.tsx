import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { MUSCLE_LABELS } from '../lib/labels'
import { MUSCLE_GROUPS, type MuscleGroup } from '../lib/types'

export const card = 'rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800'
export const inputCls =
  'w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 min-h-11 outline-none focus:border-blue-500'

export function Button({
  variant = 'primary', className = '', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-500',
    ghost: 'border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800',
    danger: 'text-red-600 border border-red-300 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950',
  }[variant]
  return <button {...props} className={`rounded-lg px-4 min-h-11 font-medium disabled:opacity-50 ${styles} ${className}`} />
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

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        {actions}
      </div>
      {children}
    </div>
  )
}

export function MuscleSelect({
  value, onChange,
}: { value: MuscleGroup; onChange: (m: MuscleGroup) => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as MuscleGroup)}>
      {MUSCLE_GROUPS.map((m) => (
        <option key={m} value={m} className="text-black">{MUSCLE_LABELS[m]}</option>
      ))}
    </select>
  )
}
