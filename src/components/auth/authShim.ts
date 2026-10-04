import { useSyncExternalStore } from 'react'

/**
 * Maqueta del hook de autenticación con la MISMA forma que el contrato (docs/contrato-auth-api.md §1).
 * Sirve para diseñar y probar las pantallas; cuando exista src/lib/useAuth.ts, este archivo pasa a ser
 * `export * from '../../lib/useAuth'` y no cambia nada más.
 */
export type Role = 'admin' | 'user'
export interface AuthUser { id: string; email: string; role: Role; displayName?: string }
export type AuthNotice =
  | null
  | { kind: 'legacy-device' }
  | { kind: 'other-account'; pending: number }
  | { kind: 'session-expired' }
export interface Auth {
  status: 'loading' | 'anonymous' | 'authenticated' | 'expired'
  user: AuthUser | null
  role: Role | null
  isAdmin: boolean
  mustChangePassword: boolean
  notice: AuthNotice
  pendingChanges: number
  login(email: string, password: string): Promise<void>
  registerWithInvite(code: string, email: string, password: string): Promise<void>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  logout(): Promise<void>
  logoutAll(): Promise<void>
  confirmAccountSwitch(): Promise<void>
}
export type AuthErrorCode =
  | 'invalid-credentials' | 'rate-limited' | 'network' | 'disabled'
  | 'invite-invalid' | 'invite-expired' | 'invite-used'
  | 'email-taken' | 'weak-password' | 'wrong-current-password' | 'unknown'
export class AuthError extends Error {
  code: AuthErrorCode; retryAfterS?: number
  constructor(code: AuthErrorCode, message?: string, retryAfterS?: number) { super(message ?? code); this.code = code; this.retryAfterS = retryAfterS }
}
export function validatePassword(password: string, email: string): string | null {
  if (password.length < 10) return 'Mínimo 10 caracteres.'
  if (password.length > 128) return 'Máximo 128 caracteres.'
  if (email && password.toLowerCase() === email.toLowerCase()) return 'No puede ser igual que el correo.'
  if (['password12', '1234567890', 'qwertyuiop', 'contraseña1'].includes(password.toLowerCase())) return 'Es demasiado común: elige otra.'
  return null
}
export type InviteCheck = { valid: true } | { valid: false; reason: 'expired' | 'used' | 'invalid' }

/* ---------------- maqueta ---------------- */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
type Core = Pick<Auth, 'status' | 'user' | 'mustChangePassword' | 'notice' | 'pendingChanges'>
const me: AuthUser = { id: 'u1', email: 'a.sotomayor.martinez@gmail.com', role: 'admin', displayName: 'Antonio' }
const anon: Core = { status: 'anonymous', user: null, mustChangePassword: false, notice: null, pendingChanges: 0 }
let state: Core = anon
let pendingUser: AuthUser | null = null
const subs = new Set<() => void>()
const set = (p: Partial<Core>) => { state = { ...state, ...p }; subs.forEach((l) => l()) }

// En desarrollo, ?auth=<estado> fuerza un estado para revisar cada pantalla.
export const mockAuthActive = () => import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('auth')
if (mockAuthActive()) {
  const q = new URLSearchParams(location.search).get('auth')
  if (q === 'authed') state = { ...anon, status: 'authenticated', user: me }
  if (q === 'user') state = { ...anon, status: 'authenticated', user: { id: 'u2', email: 'laura@ejemplo.es', role: 'user', displayName: 'Laura' } }
  if (q === 'must') state = { ...anon, status: 'authenticated', user: me, mustChangePassword: true }
  if (q === 'expired') state = { ...anon, status: 'expired', notice: { kind: 'session-expired' }, pendingChanges: 3 }
  if (q === 'legacy') state = { ...anon, notice: { kind: 'legacy-device' }, pendingChanges: 12 }
  if (q === 'switch') { pendingUser = { id: 'u9', email: 'otro@ejemplo.es', role: 'user' }; state = { ...anon, notice: { kind: 'other-account', pending: 7 }, pendingChanges: 7 } }
  if (q === 'loading') state = { ...anon, status: 'loading' }
}

export function useAuth(): Auth {
  const s = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => state)
  return {
    ...s, role: s.user?.role ?? null, isAdmin: s.user?.role === 'admin',
    async login(email, password) {
      await wait(700)
      if (!navigator.onLine) throw new AuthError('network')
      if (password === 'limite') throw new AuthError('rate-limited', undefined, 600)
      if (password === 'desactivada') throw new AuthError('disabled')
      if (password === 'error') throw new AuthError('invalid-credentials')
      const user: AuthUser = { id: 'u1', email, role: 'admin', displayName: email.split('@')[0] }
      if (email.startsWith('otro')) { pendingUser = user; set({ notice: { kind: 'other-account', pending: 7 }, pendingChanges: 7 }); return }
      set({ status: 'authenticated', user, mustChangePassword: password === 'temporal123', notice: null })
    },
    async registerWithInvite(code, email, password) {
      await wait(800)
      if (code === 'caducada') throw new AuthError('invite-expired')
      if (code === 'usada') throw new AuthError('invite-used')
      if (code === 'mala') throw new AuthError('invite-invalid')
      if (email.startsWith('existe')) throw new AuthError('email-taken')
      const weak = validatePassword(password, email)
      if (weak) throw new AuthError('weak-password', weak)
      set({ status: 'authenticated', user: { id: 'u3', email, role: 'user' }, notice: null })
    },
    async changePassword(current, next) {
      await wait(600)
      if (current === 'incorrecta') throw new AuthError('wrong-current-password')
      const weak = validatePassword(next, state.user?.email ?? '')
      if (weak) throw new AuthError('weak-password', weak)
      set({ mustChangePassword: false })
    },
    async logout() { await wait(200); pendingUser = null; set({ ...anon }) },
    async logoutAll() { await wait(500); set({ ...anon }) },
    async confirmAccountSwitch() {
      await wait(500)
      if (pendingUser) set({ status: 'authenticated', user: pendingUser, notice: null, pendingChanges: 0 })
      pendingUser = null
    },
  }
}

export async function checkInvite(code: string): Promise<InviteCheck> {
  await wait(600)
  if (code === 'caducada') return { valid: false, reason: 'expired' }
  if (code === 'usada') return { valid: false, reason: 'used' }
  if (code === 'mala') return { valid: false, reason: 'invalid' }
  return { valid: true }
}
