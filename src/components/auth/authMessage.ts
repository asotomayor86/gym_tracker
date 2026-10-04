import { AuthError } from './authShim'

/** Mensaje en español de un error de autenticación. */
export function authMessage(e: unknown): string {
  if (!(e instanceof AuthError)) return 'No se pudo completar la operación. Inténtalo de nuevo.'
  switch (e.code) {
    case 'invalid-credentials': return 'Correo o contraseña incorrectos.'
    case 'rate-limited': return `Demasiados intentos. Espera ${e.retryAfterS ? `${Math.max(1, Math.ceil(e.retryAfterS / 60))} min` : 'unos minutos'} e inténtalo de nuevo.`
    case 'network': return 'Sin conexión: necesitas red para iniciar sesión.'
    case 'disabled': return 'Esta cuenta está desactivada. Contacta con el administrador.'
    case 'invite-invalid': return 'El enlace de invitación no es válido.'
    case 'invite-expired': return 'La invitación ha caducado. Pide otra al administrador.'
    case 'invite-used': return 'Esta invitación ya se ha usado.'
    case 'email-taken': return 'Ya existe una cuenta con ese correo.'
    case 'weak-password': return e.message && e.message !== 'weak-password' ? e.message : 'La contraseña no cumple la política.'
    case 'wrong-current-password': return 'La contraseña actual no es correcta.'
    default: return 'No se pudo completar la operación. Inténtalo de nuevo.'
  }
}
