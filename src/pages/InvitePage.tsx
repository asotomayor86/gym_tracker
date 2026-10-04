import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AuthShell, EmailInput, Field, FormError, Notice, PasswordHelp, PasswordInput, SubmitButton,
} from '../components/auth/AuthUI'
import { useSubmit } from '../components/auth/useSubmit'
import { checkInvite, useAuth, validatePassword, type InviteCheck } from '../components/auth/authShim'

const REASON: Record<'expired' | 'used' | 'invalid', string> = {
  expired: 'La invitación ha caducado. Pide otra al administrador.',
  used: 'Esta invitación ya se ha usado. Si ya creaste tu cuenta, inicia sesión.',
  invalid: 'El enlace de invitación no es válido. Revisa que lo hayas copiado completo.',
}

/** Registro por invitación: /invitacion/:codigo. Comprueba el código antes de pedir datos. */
export default function InvitePage() {
  const { codigo = '' } = useParams()
  const auth = useAuth()
  const navigate = useNavigate()
  const [check, setCheck] = useState<InviteCheck | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, run } = useSubmit(async () => {
    await auth.registerWithInvite(codigo, email.trim(), password)
    navigate('/', { replace: true })
  })

  useEffect(() => {
    let live = true
    checkInvite(codigo).then((r) => live && setCheck(r)).catch(() => live && setCheck({ valid: false, reason: 'invalid' }))
    return () => { live = false }
  }, [codigo])

  const weak = password ? validatePassword(password, email) : 'vacía'

  if (auth.status === 'authenticated') {
    return (
      <AuthShell eyebrow="Invitación" title="Ya tienes sesión">
        <Notice title="Ya has iniciado sesión">Para usar una invitación en otra cuenta, cierra antes la sesión en Ajustes.</Notice>
        <Link to="/" className="press block rounded-full bg-ink/5 px-5 py-3 text-center text-sm font-semibold hover:bg-ink/10">Ir a la app</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell eyebrow="Invitación" title="Crear cuenta">
      {!check && <p className="text-sm text-mute" aria-busy="true">Comprobando la invitación…</p>}
      {check && !check.valid && (
        <>
          <Notice tone="red" title="No se puede usar esta invitación">{REASON[check.reason]}</Notice>
          <Link to="/" className="press block rounded-full bg-ink/5 px-5 py-3 text-center text-sm font-semibold hover:bg-ink/10">Ir al inicio de sesión</Link>
        </>
      )}
      {check?.valid && (
        <form onSubmit={run} className="space-y-4">
          <div>
            <h2 className="display text-lg">Crea tu cuenta</h2>
            <p className="mt-1 text-sm text-mute">Te han invitado a Gym Tracker. Elige tu correo y una contraseña.</p>
          </div>
          <Field label="Correo"><EmailInput value={email} onChange={setEmail} disabled={busy} autoFocus /></Field>
          <Field label="Contraseña"><PasswordInput kind="new" value={password} onChange={setPassword} disabled={busy} describedBy="pw-help" /></Field>
          <PasswordHelp password={password} email={email} />
          <FormError>{error}</FormError>
          <SubmitButton busy={busy} disabled={!email || !!weak} busyText="Creando cuenta…">Crear cuenta y entrar</SubmitButton>
          <p className="text-xs text-mute">Sin recuperación por correo: si olvidas la contraseña, contacta con el administrador.</p>
        </form>
      )}
    </AuthShell>
  )
}
