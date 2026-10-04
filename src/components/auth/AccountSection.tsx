import { useState } from 'react'
import { Button, SectionTitle } from '../ui'
import { AuthShell, Field, FormError, Notice, PasswordHelp, PasswordInput, SubmitButton } from './AuthUI'
import { useAuth, validatePassword } from './authShim'
import { useSubmit } from './useSubmit'

/** Formulario de cambio de contraseña (en Ajustes y en la pantalla de cambio obligatorio). */
export function ChangePasswordForm({ onDone, onCancel, forced }: { onDone?: () => void; onCancel?: () => void; forced?: boolean }) {
  const auth = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [ok, setOk] = useState(false)
  const email = auth.user?.email ?? ''
  const mismatch = !!again && again !== next
  const { busy, error, run } = useSubmit(async () => {
    await auth.changePassword(current, next)
    setOk(true); setCurrent(''); setNext(''); setAgain('')
    onDone?.()
  })
  if (ok && !forced) return <p role="status" className="rounded-xl border border-signal/50 bg-signal/10 px-4 py-3 text-sm font-semibold">✓ Contraseña cambiada. Se han cerrado las demás sesiones.</p>
  return (
    <form onSubmit={run} className="space-y-4">
      <Field label={forced ? 'Contraseña temporal' : 'Contraseña actual'}><PasswordInput value={current} onChange={setCurrent} disabled={busy} /></Field>
      <Field label="Contraseña nueva"><PasswordInput kind="new" value={next} onChange={setNext} disabled={busy} /></Field>
      <PasswordHelp password={next} email={email} />
      <Field label="Repite la contraseña nueva"><PasswordInput kind="new" value={again} onChange={setAgain} disabled={busy} invalid={mismatch} /></Field>
      {mismatch && <p className="text-xs font-semibold text-e-fail" role="alert">No coinciden.</p>}
      <FormError>{error}</FormError>
      <div className="flex gap-2">
        <SubmitButton busy={busy} disabled={!current || !!validatePassword(next, email) || next !== again} busyText="Guardando…">Cambiar contraseña</SubmitButton>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>}
      </div>
    </form>
  )
}

/** Pantalla que bloquea la app tras un reinicio de contraseña por el administrador. */
export function ForcedPasswordChange() {
  const auth = useAuth()
  return (
    <AuthShell eyebrow="Seguridad" title="Cambia tu contraseña">
      <Notice title="Tienes que cambiar la contraseña">El administrador la ha restablecido. Elige una nueva para seguir usando la app.</Notice>
      <ChangePasswordForm forced />
      <Button variant="ghost" className="w-full" onClick={() => void auth.logout()}>Cerrar sesión</Button>
    </AuthShell>
  )
}

/** Sección «Cuenta» de Ajustes: correo, rol, cambio de contraseña y cierre de sesión. */
export default function AccountSection() {
  const auth = useAuth()
  const [changing, setChanging] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const out = useSubmit(() => auth.logout())
  const all = useSubmit(async () => { await auth.logoutAll() })
  if (!auth.user) return null
  const initial = (auth.user.displayName || auth.user.email)[0]?.toUpperCase() ?? '?'
  return (
    <section className="glass space-y-4 p-5">
      <SectionTitle>Cuenta</SectionTitle>
      <div className="flex items-center gap-3">
        <span aria-hidden className="display grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-signal to-signal-2 text-lg text-on-signal">{initial}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{auth.user.email}</div>
          <span className={`mt-1 inline-block rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold ${auth.isAdmin ? 'border-signal/60 text-signal-text' : 'border-hair text-mute'}`}>
            {auth.isAdmin ? 'Administrador' : 'Usuario'}
          </span>
        </div>
      </div>

      {changing ? (
        <ChangePasswordForm onCancel={() => setChanging(false)} onDone={() => setChanging(false)} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setChanging(true)}>Cambiar contraseña</Button>
          <Button variant="ghost" disabled={out.busy} onClick={() => out.run()}>{out.busy ? 'Cerrando…' : 'Cerrar sesión'}</Button>
        </div>
      )}

      {auth.pendingChanges > 0 && (
        <p className="text-xs text-mute">Tienes {auth.pendingChanges} {auth.pendingChanges === 1 ? 'cambio' : 'cambios'} sin subir: al cerrar sesión se conservan en este dispositivo y se subirán cuando vuelvas a entrar.</p>
      )}

      <div className="space-y-2 border-t border-hair pt-4">
        <p className="text-xs text-mute">Si has perdido un dispositivo, cierra la sesión en todos. Tus datos no se borran.</p>
        {!confirmAll ? (
          <Button variant="danger" onClick={() => setConfirmAll(true)}>Cerrar sesión en todos los dispositivos</Button>
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Confirmar cierre en todos los dispositivos">
            <Button variant="danger" disabled={all.busy} onClick={() => all.run()}>{all.busy ? 'Cerrando…' : 'Sí, cerrar todas las sesiones'}</Button>
            <Button variant="ghost" disabled={all.busy} onClick={() => setConfirmAll(false)}>Cancelar</Button>
          </div>
        )}
        <FormError>{out.error || all.error}</FormError>
      </div>
    </section>
  )
}
