import { useState } from 'react'
import { AuthShell, EmailInput, Field, FormError, Notice, PasswordInput, SubmitButton } from '../components/auth/AuthUI'
import { useAuth } from '../components/auth/authShim'
import { Button } from '../components/ui'
import { useSubmit } from '../components/auth/useSubmit'

const plural = (n: number) => `${n} ${n === 1 ? 'cambio' : 'cambios'}`

/** Acceso con correo y contraseña. Sin recuperación por correo: la restablece el administrador. */
export default function LoginPage() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, run } = useSubmit(() => auth.login(email.trim(), password))
  const n = auth.notice

  // El inicio de sesión fue correcto pero el dispositivo guarda datos de otra cuenta: hay que decidir antes de seguir.
  if (n?.kind === 'other-account') return <SwitchAccount pending={n.pending} />

  return (
    <AuthShell eyebrow="Acceso" title="Iniciar sesión">
      {n?.kind === 'session-expired' && (
        <Notice title="Tu sesión ha caducado">
          Vuelve a iniciar sesión.{auth.pendingChanges > 0 && <> Tus {plural(auth.pendingChanges)} locales se conservan y se subirán al entrar.</>}
        </Notice>
      )}
      {n?.kind === 'legacy-device' && (
        <Notice title="Este dispositivo ya tenía datos">
          Inicia sesión con la <b className="text-ink">cuenta administradora</b> para reclamarlos{auth.pendingChanges > 0 && <> y subir {plural(auth.pendingChanges)} pendientes</>}.
        </Notice>
      )}
      <form onSubmit={run} className="space-y-4" noValidate={false}>
        <Field label="Correo"><EmailInput value={email} onChange={setEmail} disabled={busy} autoFocus /></Field>
        <Field label="Contraseña"><PasswordInput value={password} onChange={setPassword} disabled={busy} invalid={!!error} describedBy="login-error" /></Field>
        <FormError id="login-error">{error}</FormError>
        {!navigator.onLine && <p className="text-xs text-mute">Estás sin conexión: iniciar sesión necesita red.</p>}
        <SubmitButton busy={busy} disabled={!email || !password} busyText="Entrando…">Entrar</SubmitButton>
      </form>
      <ul className="space-y-1.5 border-t border-hair pt-4 text-xs text-mute">
        <li>¿Olvidaste la contraseña? <b className="text-ink">Contacta con el administrador</b> para restablecerla.</li>
        <li>¿No tienes cuenta? Necesitas una invitación del administrador.</li>
      </ul>
    </AuthShell>
  )
}

/** Cambio de cuenta en un dispositivo: avisa y vacía lo local solo si el usuario lo confirma (dos pasos). */
function SwitchAccount({ pending }: { pending: number }) {
  const auth = useAuth()
  const [armed, setArmed] = useState(false)
  const { busy, error, run } = useSubmit(() => auth.confirmAccountSwitch())
  return (
    <AuthShell eyebrow="Otra cuenta" title="Este dispositivo tiene datos de otra cuenta">
      <Notice tone="red" title="Este dispositivo tiene datos de otra cuenta">
        Hay {plural(pending)} sin subir. Si continúas con esta cuenta se <b className="text-ink">borrarán de este dispositivo</b>. Para conservarlos,
        cancela, entra con la cuenta anterior y espera a que se sincronicen.
      </Notice>
      <FormError>{error}</FormError>
      <div className="flex flex-col gap-2">
        {!armed ? (
          <Button variant="danger" onClick={() => setArmed(true)}>Borrar datos locales y entrar</Button>
        ) : (
          <Button variant="danger" disabled={busy} onClick={() => run()} className="!bg-e-fail !text-on-signal">
            {busy ? 'Borrando…' : `Confirmar: borrar ${plural(pending)}`}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={() => void auth.logout()}>Cancelar y conservar mis datos</Button>
      </div>
    </AuthShell>
  )
}
