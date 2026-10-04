import type { KeyValueStore } from './syncEngine'

export type Role = 'admin' | 'user'
export interface AuthUser { id: string; email: string; role: Role; displayName?: string }

export type AuthErrorCode =
  | 'invalid-credentials' | 'rate-limited' | 'network' | 'disabled'
  | 'invite-invalid' | 'invite-expired' | 'invite-used'
  | 'email-taken' | 'weak-password' | 'wrong-current-password' | 'unknown'

export class AuthError extends Error {
  code: AuthErrorCode
  retryAfterS?: number
  constructor(code: AuthErrorCode, message?: string, retryAfterS?: number) {
    super(message ?? code)
    this.name = 'AuthError'
    this.code = code
    this.retryAfterS = retryAfterS
  }
}

/** Sesión tal como la devuelve la API. */
export interface ServerSession {
  accessToken: string
  expiresIn: number
  refreshToken: string
  user: AuthUser & { mustChangePassword: boolean }
}

export type ExpiredReason = 'session_expired' | 'disabled'

interface Stored {
  accessToken: string
  /** ms epoch */
  accessExp: number
  refreshToken: string
  user: AuthUser
  mustChangePassword: boolean
}

export interface AuthSnapshot {
  session: Pick<Stored, 'user' | 'mustChangePassword'> | null
  expired: ExpiredReason | null
}

const KEY = 'gym-auth'
const LEGACY_TOKEN_KEY = 'gym-token'
/** Margen antes de caducar para pedir un token nuevo. */
const SKEW_MS = 60_000

const ERRORS: Record<string, AuthErrorCode> = {
  bad_credentials: 'invalid-credentials', rate_limited: 'rate-limited', disabled: 'disabled',
  invite_invalid: 'invite-invalid', invite_expired: 'invite-expired', invite_used: 'invite-used',
  email_taken: 'email-taken', weak_password: 'weak-password', wrong_current_password: 'wrong-current-password',
  invalid_email: 'invalid-credentials',
}

export interface AuthClientDeps {
  storage: KeyValueStore
  fetch: typeof fetch
  now?: () => number
}

export function createAuthClient(deps: AuthClientDeps) {
  const { storage } = deps
  const now = deps.now ?? Date.now
  const listeners = new Set<() => void>()
  let expired: ExpiredReason | null = null
  let stored: Stored | null = read()
  let snapshot = compute()
  let refreshing: Promise<void> | null = null

  function read(): Stored | null {
    try {
      const raw = storage.get(KEY)
      return raw ? (JSON.parse(raw) as Stored) : null
    } catch {
      return null
    }
  }
  function compute(): AuthSnapshot {
    return { session: stored ? { user: stored.user, mustChangePassword: stored.mustChangePassword } : null, expired }
  }
  function publish() {
    snapshot = compute()
    listeners.forEach((l) => l())
  }
  function persist() {
    if (stored) storage.set(KEY, JSON.stringify(stored))
    else storage.del(KEY)
  }

  /** ¿Había un token de la versión anterior (contraseña compartida)? Se descarta; el dispositivo queda como "heredado". */
  function dropLegacyToken(): boolean {
    const had = !!storage.get(LEGACY_TOKEN_KEY)
    if (had) storage.del(LEGACY_TOKEN_KEY)
    return had
  }

  async function call(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
    let res: Response
    try {
      res = await deps.fetch(path, {
        method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
        headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      })
    } catch {
      throw new AuthError('network', 'Sin conexión')
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null)
    if (res.ok) return data
    const code = ERRORS[data?.error as string] ?? 'unknown'
    const message = code === 'weak-password' && Array.isArray(data?.reasons) ? data.reasons.join(' ') : undefined
    throw Object.assign(new AuthError(code, message, typeof data?.retryAfterS === 'number' ? data.retryAfterS : undefined), { http: res.status, apiError: data?.error as string | undefined })
  }

  function setSession(s: ServerSession) {
    stored = {
      accessToken: s.accessToken,
      accessExp: now() + s.expiresIn * 1000,
      refreshToken: s.refreshToken,
      user: { id: s.user.id, email: s.user.email, role: s.user.role, displayName: s.user.displayName },
      mustChangePassword: s.user.mustChangePassword,
    }
    expired = null
    persist()
    publish()
  }

  function clear(reason: ExpiredReason | null = null) {
    stored = null
    expired = reason
    persist()
    publish()
  }

  /** Renueva el access token con el refresh (rotatorio). Sin red: error 'network' y la sesión se conserva. */
  function refresh(): Promise<void> {
    refreshing ??= (async () => {
      if (!stored) throw new AuthError('unknown', 'Sin sesión')
      try {
        setSession(await call('/api/auth/refresh', { body: { refreshToken: stored.refreshToken } }))
      } catch (e) {
        const http = (e as { http?: number }).http
        if (e instanceof AuthError && e.code !== 'network') {
          // Refresh inválido, caducado o cuenta desactivada: la sesión termina (el outbox local no se toca).
          if (http === 401 || http === 403) clear(e.code === 'disabled' ? 'disabled' : 'session_expired')
        }
        throw e
      }
    })().finally(() => (refreshing = null))
    return refreshing
  }

  /** Token de acceso vigente (lo renueva si le queda poco). */
  async function getAccessToken(): Promise<string> {
    if (!stored) throw new AuthError('unknown', 'Sin sesión')
    if (stored.accessExp - SKEW_MS <= now()) await refresh()
    return stored!.accessToken
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (cb: () => void) => {
      listeners.add(cb)
      return () => void listeners.delete(cb)
    },
    hasSession: () => !!stored,
    currentUser: () => stored?.user ?? null,
    dropLegacyToken,
    call,
    setSession,
    clear,
    refresh,
    getAccessToken,

    /** Pide sesión (NO la guarda: quien llama decide, p. ej. tras comprobar de quién son los datos locales). */
    requestLogin: (email: string, password: string): Promise<ServerSession> => call('/api/auth/login', { body: { email, password } }),
    requestRegister: (code: string, email: string, password: string, displayName?: string): Promise<ServerSession> =>
      call('/api/auth/register', { body: { code, email, password, displayName } }),

    async logout() {
      const token = stored?.refreshToken
      clear()
      if (token) await call('/api/auth/logout', { body: { refreshToken: token } }).catch(() => {}) // sin red: caduca sola
    },
    /** Cierra todas las sesiones de la cuenta. Necesita red. */
    async logoutAll() {
      const access = await getAccessToken()
      await call('/api/auth/logout-all', { method: 'POST', body: {}, token: access })
      clear()
    },
    async changePassword(currentPassword: string, newPassword: string) {
      const access = await getAccessToken()
      setSession(await call('/api/auth/change-password', { body: { currentPassword, newPassword }, token: access }))
    },
    async checkInvite(code: string): Promise<{ valid: true } | { valid: false; reason: 'expired' | 'used' | 'invalid' }> {
      try {
        return await call(`/api/auth/invite?code=${encodeURIComponent(code)}`)
      } catch (e) {
        if (e instanceof AuthError && e.code === 'network') throw e
        return { valid: false, reason: 'invalid' }
      }
    },
  }
}

export type AuthClient = ReturnType<typeof createAuthClient>

/** Política de contraseña en el cliente (misma que el servidor): null si vale, o el motivo en español. */
export function validatePassword(password: string, email = ''): string | null {
  const pw = password.normalize('NFKC')
  const low = pw.toLowerCase()
  const mail = email.trim().toLowerCase()
  if (pw.length < 10) return 'Debe tener al menos 10 caracteres.'
  if (pw.length > 128) return 'Debe tener como máximo 128 caracteres.'
  if (mail && (low === mail || (mail.includes('@') && low === mail.split('@')[0]))) return 'No puede ser igual que tu correo.'
  if (COMMON.has(low) || /^(.)\1+$/.test(pw)) return 'Es una contraseña demasiado común.'
  return null
}

const COMMON = new Set([
  '1234567890', '12345678910', '0123456789', '1234567891', 'qwertyuiop', 'qwerty1234', 'qwerty12345', 'asdfghjkl1',
  'password12', 'password123', 'password1234', 'contraseña1', 'contraseña12', 'contraseña123', 'contrasena1', 'contrasena123',
  'iloveyou12', 'abc1234567', 'abcdefghij', 'abcd123456', '1q2w3e4r5t', '1qaz2wsx3edc', 'letmein123', 'welcome123',
  'administrador', 'administrator', 'gimnasio123', 'entrenamiento', 'futbol12345', 'barcelona10', 'realmadrid1', 'passw0rd123',
  '1111111111', '0000000000', '1234512345', 'aaaaaaaaaa', 'mypassword1', 'trustno1234', 'superman123', 'qazwsxedcr',
])
