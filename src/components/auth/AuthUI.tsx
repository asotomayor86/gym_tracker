import { useId, useState, type ReactNode } from 'react'
import { Button, inputCls } from '../ui'
import { validatePassword } from './authShim'

/** Marco de las pantallas de acceso: marca, tarjeta de cristal centrada y el fondo vivo de la app. */
export function AuthShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-6 px-4 py-10">
      <header className="rise space-y-3">
        <div className="eyebrow">{eyebrow}</div>
        <div className="display heat pb-1 text-[clamp(2.1rem,11vw,3.2rem)] leading-[1.05]">Gym<br />Tracker</div>
        <h1 className="sr-only">{title}</h1>
      </header>
      <div className="rise glass space-y-5 p-5 sm:p-6">{children}</div>
    </main>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="block text-xs text-mute">{hint}</span>}
    </label>
  )
}

export function EmailInput({ value, onChange, disabled, autoFocus }: { value: string; onChange: (v: string) => void; disabled?: boolean; autoFocus?: boolean }) {
  return (
    <input
      className={`${inputCls} text-base`} type="email" name="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
      value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} autoFocus={autoFocus} required
    />
  )
}

/** Contraseña con botón Mostrar/Ocultar. `kind` ajusta el autocompletado del gestor de contraseñas. */
export function PasswordInput({
  value, onChange, disabled, kind = 'current', invalid, describedBy,
}: { value: string; onChange: (v: string) => void; disabled?: boolean; kind?: 'current' | 'new'; invalid?: boolean; describedBy?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        className={`${inputCls} pr-24 text-base`} name={kind === 'new' ? 'new-password' : 'password'} type={show ? 'text' : 'password'}
        autoComplete={kind === 'new' ? 'new-password' : 'current-password'} value={value} onChange={(e) => onChange(e.target.value)}
        disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} required
      />
      <button
        type="button" onClick={() => setShow((s) => !s)} aria-pressed={show}
        className="absolute inset-y-1 right-1 rounded-lg px-3 text-xs font-semibold text-mute hover:text-ink"
      >
        {show ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  )
}

/** Ayuda en vivo de la política: barra de calor hacia los 10 caracteres y motivo si no vale. */
export function PasswordHelp({ password, email }: { password: string; email: string }) {
  const id = useId()
  if (!password) return <p id={id} className="text-xs text-mute">10–128 caracteres, distinta del correo y nada común. Sin reglas de mayúsculas o símbolos.</p>
  const problem = validatePassword(password, email)
  const pct = Math.min(100, (password.length / 10) * 100)
  return (
    <div id={id} className="space-y-1.5" aria-live="polite">
      <div className="heat-track h-1.5"><div className="heat-fill" style={{ width: `${Math.max(4, pct)}%`, opacity: problem ? 0.6 : 1 }} /></div>
      <p className={`text-xs font-semibold ${problem ? 'text-mute' : 'text-signal-text'}`}>{problem ?? '✓ Contraseña válida'}</p>
    </div>
  )
}

export function FormError({ id, children }: { id?: string; children: ReactNode }) {
  if (!children) return null
  return <p id={id} role="alert" className="rounded-xl border border-e-fail/50 bg-e-fail/10 px-3 py-2 text-sm text-e-fail">{children}</p>
}

export function SubmitButton({ busy, disabled, children, busyText }: { busy: boolean; disabled?: boolean; children: ReactNode; busyText: string }) {
  return (
    <Button type="submit" disabled={busy || disabled} className="w-full">
      {busy ? <span className="inline-flex items-center gap-2"><span className="size-4 animate-spin rounded-full border-2 border-on-signal/30 border-t-on-signal" aria-hidden />{busyText}</span> : children}
    </Button>
  )
}

/** Aviso destacado (ámbar) o de peligro (rojo) para sesión caducada, dispositivo heredado, etc. */
export function Notice({ tone = 'amber', title, children }: { tone?: 'amber' | 'red'; title: string; children: ReactNode }) {
  const cls = tone === 'red' ? 'border-e-fail/60 bg-e-fail/10' : 'border-signal/50 bg-signal/10'
  return (
    <section role="status" className={`space-y-1 rounded-2xl border px-4 py-3 ${cls}`}>
      <h2 className="display text-sm" style={{ lineHeight: 1.3 }}>{title}</h2>
      <p className="text-sm text-mute">{children}</p>
    </section>
  )
}
