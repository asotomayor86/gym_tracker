# Contrato de auth: API y hooks de cliente

Estado: **contrato acordado para F1** (ARQUITECTO ⇄ DISEÑADOR). Si algo cambia, ARQUITECTO avisa a DISEÑADOR. Diseño completo en `docs/diseno-usuarios-y-auth.md`.

## 1. Hook `useAuth()` (src/lib/useAuth.ts) — forma acordada con DISEÑADOR

```ts
export type Role = 'admin' | 'user'
export interface AuthUser { id: string; email: string; role: Role; displayName?: string }
export type AuthNotice =
  | null
  | { kind: 'legacy-device' }                 // el dispositivo tiene datos de antes del login con cuenta: iniciar sesión (cuenta admin) los reclama
  | { kind: 'other-account'; pending: number } // el login ha ido bien pero el dispositivo tiene datos de OTRA cuenta; hasta confirmAccountSwitch() no se completa
  | { kind: 'session-expired' }               // el refresh dejó de valer (caducó, revocada o desactivada)

export interface Auth {
  status: 'loading' | 'anonymous' | 'authenticated' | 'expired'
  user: AuthUser | null
  role: Role | null
  isAdmin: boolean
  mustChangePassword: boolean
  notice: AuthNotice
  /** Nº de cambios locales sin subir (outbox), para el aviso de cambio de cuenta. */
  pendingChanges: number
  login(email: string, password: string): Promise<void>
  registerWithInvite(code: string, email: string, password: string): Promise<void>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  logout(): Promise<void>
  logoutAll(): Promise<void>
  /** Tras notice 'other-account': vacía lo local, completa el login y empieza a sincronizar. Para cancelar: logout(). */
  confirmAccountSwitch(): Promise<void>
}
export function useAuth(): Auth

export type AuthErrorCode =
  | 'invalid-credentials' | 'rate-limited' | 'network' | 'disabled'
  | 'invite-invalid' | 'invite-expired' | 'invite-used'
  | 'email-taken' | 'weak-password' | 'wrong-current-password' | 'unknown'
export class AuthError extends Error { code: AuthErrorCode; retryAfterS?: number }   // 'weak-password': message en español listo para pintar

/** Pura, sin red: null si vale, o el motivo en español (10–128, distinta del correo, no común). */
export function validatePassword(password: string, email: string): string | null
/** Antes de registrar: GET /api/auth/invite?code=… */
export function checkInvite(code: string): Promise<{ valid: true } | { valid: false; reason: 'expired' | 'used' | 'invalid' }>
```

Reglas de UI:
- La app **funciona sin sesión** (datos locales); sin sesión simplemente no sincroniza (aviso persistente vía `useSyncView`). `status: 'expired'` = tenía sesión y dejó de valer.
- `mustChangePassword` (tras un reset del admin): pedir cambio de contraseña antes de seguir.
- Tras `login`/`registerWithInvite` correctos la sincronización arranca sola.
- Ruta de invitación: **`/invitacion/:codigo`** (BrowserRouter; el enlace que genera el admin es `<origen>/invitacion/<código>`).

## 2. Cliente de administración (src/lib/adminApi.ts) — F5

```ts
export interface Invitation { id: string; role: Role; createdAt: number; expiresAt: number; usedAt: number | null; usedBy: string | null; revokedAt: number | null; status: 'active'|'used'|'expired'|'revoked' }
export interface AdminUser { id: string; email: string; displayName: string; role: Role; disabled: boolean; createdAt: number; lastLoginAt: number | null; sessions: number }
listInvitations(): Promise<Invitation[]>
createInvitation(opts?: { role?: Role; days?: number }): Promise<{ id: string; code: string; url: string; expiresAt: number }>   // el código solo se ve aquí, una vez
revokeInvitation(id: string): Promise<void>
listUsers(): Promise<AdminUser[]>
updateUser(id: string, patch: { disabled?: boolean; role?: Role; displayName?: string }): Promise<void>
resetPassword(id: string): Promise<{ temporaryPassword: string }>   // se muestra una vez; el usuario deberá cambiarla
logoutUser(id: string): Promise<void>
```

## 3. API HTTP (JSON; autenticación `Authorization: Bearer <accessToken>`)

Objeto `user`: `{ id, email, displayName, role, mustChangePassword }`.
Respuesta de sesión: `{ accessToken, expiresIn, refreshToken, user }` (`expiresIn` en segundos; access = 15 min; refresh = 90 d deslizante y rotatorio).

| Método y ruta | Cuerpo | Respuestas |
|---|---|---|
| `POST /api/auth/login` | `{email, password}` | 200 sesión · 401 `bad_credentials` · 403 `disabled` · 429 `rate_limited` (+`retryAfterS`) |
| `POST /api/auth/refresh` | `{refreshToken}` | 200 sesión nueva (el refresh anterior deja de valer, salvo 30 s de gracia) · 401 `invalid_refresh` · 403 `disabled` |
| `POST /api/auth/logout` | `{refreshToken}` | 204 (idempotente) |
| `POST /api/auth/logout-all` | — (Bearer) | 204 (revoca todas las sesiones propias) |
| `POST /api/auth/register` | `{code, email, password, displayName?}` | 201 sesión · 400 `invalid_invite` · 409 `email_taken` · 422 `weak_password` (+`reasons`) · 429 |
| `POST /api/auth/change-password` | `{currentPassword, newPassword}` (Bearer) | 200 sesión nueva (las demás sesiones se revocan) · 401 `wrong_current_password` · 422 `weak_password` |
| `GET /api/auth/me` | — (Bearer) | 200 `{user}` |
| `GET /api/auth/invite?code=` | — (público, con límite de intentos) | 200 `{valid:true}` o `{valid:false, reason:'expired'\|'used'\|'invalid'}` |
| `GET /api/admin/invitations` · `POST` `{role?, days?}` · `DELETE ?id=` | Bearer admin | 200 / 201 `{id, code, url, expiresAt}` / 204 |
| `GET /api/admin/users` · `PATCH ?id=` `{disabled?, role?, displayName?}` · `POST ?id=&action=reset-password` · `POST ?id=&action=logout` | Bearer admin | 200 / 204 / `{temporaryPassword}` |
| `POST /api/sync/push`, `GET /api/sync/pull` | como hoy (ver diseño §3) | 401 → el cliente intenta refresh y reintenta; si el refresh falla → sin sesión |

Códigos comunes: 401 `unauthorized` (token ausente/inválido/caducado), 403 `forbidden` (no admin), 429 con cabecera `Retry-After`.

## 4. Almacenamiento en el cliente (informativo)
`localStorage['gym-auth']` = `{accessToken, accessExp, refreshToken, user}`; `localStorage['gym-owner']` = id de la cuenta propietaria de los datos locales. El token legacy `gym-token` se descarta (la sesión antigua pasa a "sin sesión" conservando el outbox).
