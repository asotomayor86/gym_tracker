import { and, eq, gt, isNull, lt, ne, or, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { authSessions, invitations, loginAttempts, users } from '../../db/schema.js'
import { burnPasswordCheck, hashPassword, passwordProblems, verifyPassword } from './password.js'
import { ACCESS_TTL_S, REFRESH_TTL_MS, newId, newSecret, sha256, signAccess, verifyAccess } from './tokens.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, any, any>

export class HttpError extends Error {
  status: number
  code: string
  extra: Record<string, unknown>
  constructor(status: number, code: string, extra: Record<string, unknown> = {}) {
    super(code)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export interface PublicUser {
  id: string
  email: string
  displayName: string
  role: 'admin' | 'user'
  mustChangePassword: boolean
}
export interface SessionResponse {
  accessToken: string
  expiresIn: number
  refreshToken: string
  user: PublicUser
}
export interface AuthContext {
  userId: string
  role: 'admin' | 'user'
  sessionId: string
  user: PublicUser
}

type UserRow = typeof users.$inferSelect
const toPublic = (u: UserRow): PublicUser => ({
  id: u.id, email: u.email, displayName: u.displayName, role: u.role, mustChangePassword: u.mustChangePassword,
})

export const normalizeEmail = (raw: unknown): string => {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email) || email.length > 254) throw new HttpError(400, 'invalid_email')
  return email
}

// ───────────── Limitador de intentos (en la base: serverless no comparte memoria) ─────────────

const WINDOW_MS = 15 * 60_000
const LIMITS = { email: 5, ip: 30, invite: 20 }

type LimitKind = keyof typeof LIMITS
const limitKey = (kind: LimitKind, id: string) => `${kind}:${sha256(id)}`

async function assertNotLocked(db: Db, keys: string[], now: number) {
  for (const key of keys) {
    const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key))
    if (row && row.lockedUntil > now) throw new HttpError(429, 'rate_limited', { retryAfterS: Math.ceil((row.lockedUntil - now) / 1000) })
  }
}

/** Cuenta un fallo (atómico). Al superar el límite bloquea con espera exponencial (15 min, 30, 60… máx. 24 h). */
async function recordFailure(db: Db, kind: LimitKind, id: string, now: number) {
  const max = LIMITS[kind]
  const expired = sql`${loginAttempts.windowStart} + ${WINDOW_MS} < ${now}`
  const nextCount = sql`(case when ${expired} then 1 else ${loginAttempts.count} + 1 end)`
  await db
    .insert(loginAttempts)
    .values({ key: limitKey(kind, id), count: 1, windowStart: now, lockedUntil: 0 })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: {
        count: nextCount,
        windowStart: sql`(case when ${expired} then ${now} else ${loginAttempts.windowStart} end)`,
        lockedUntil: sql`(case when ${nextCount} >= ${max}
          then ${now} + least(${WINDOW_MS} * power(2, ${nextCount} - ${max}), 86400000)::bigint
          else ${loginAttempts.lockedUntil} end)`,
      },
    })
}

const clearFailures = (db: Db, kind: LimitKind, id: string) => db.delete(loginAttempts).where(eq(loginAttempts.key, limitKey(kind, id)))

// ───────────── Sesiones ─────────────

async function openSession(db: Db, user: UserRow, deviceLabel: string, now: number): Promise<SessionResponse> {
  const sessionId = newId()
  const refreshToken = newSecret()
  await db.insert(authSessions).values({
    id: sessionId, userId: user.id, refreshHash: sha256(refreshToken), deviceLabel: deviceLabel.slice(0, 120),
    createdAt: now, lastUsedAt: now, expiresAt: now + REFRESH_TTL_MS,
  })
  return {
    accessToken: await signAccess({ sub: user.id, role: user.role, tv: user.tokenVersion, sid: sessionId }),
    expiresIn: ACCESS_TTL_S, refreshToken, user: toPublic(user),
  }
}

const revokeUserSessions = (db: Db, userId: string, now: number, exceptId?: string) =>
  db.update(authSessions).set({ revokedAt: now }).where(
    and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt), exceptId ? ne(authSessions.id, exceptId) : undefined),
  )

export async function login(db: Db, input: { email: unknown; password: unknown; ip?: string; device?: string }, now = Date.now()): Promise<SessionResponse> {
  let email: string
  try {
    email = normalizeEmail(input.email)
  } catch {
    throw new HttpError(401, 'bad_credentials')
  }
  const password = typeof input.password === 'string' ? input.password.slice(0, 1024) : ''
  const ip = input.ip || 'unknown'
  await assertNotLocked(db, [limitKey('email', email), limitKey('ip', ip)], now)

  const [user] = await db.select().from(users).where(eq(users.email, email))
  const ok = user ? await verifyPassword(password, user.passwordHash) : (await burnPasswordCheck(password), false)
  if (!user || !ok) {
    await recordFailure(db, 'email', email, now)
    await recordFailure(db, 'ip', ip, now)
    throw new HttpError(401, 'bad_credentials')
  }
  if (user.disabled) throw new HttpError(403, 'disabled')
  await clearFailures(db, 'email', email)
  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id))
  return openSession(db, user, input.device ?? '', now)
}

export async function refresh(db: Db, refreshToken: unknown, device = '', now = Date.now()): Promise<SessionResponse> {
  if (typeof refreshToken !== 'string' || refreshToken.length < 20 || refreshToken.length > 200) throw new HttpError(401, 'invalid_refresh')
  const old = sha256(refreshToken)
  const next = newSecret()
  // Rotación atómica; el refresh anterior sigue valiendo 30 s (dos pestañas refrescando a la vez).
  const [row] = await db
    .update(authSessions)
    .set({
      prevHash: authSessions.refreshHash, prevValidUntil: now + 30_000, refreshHash: sha256(next),
      retiredHashes: sql`(array_prepend(${authSessions.refreshHash}, ${authSessions.retiredHashes}))[1:8]`,
      lastUsedAt: now, expiresAt: now + REFRESH_TTL_MS,
    })
    .where(
      and(
        or(eq(authSessions.refreshHash, old), and(eq(authSessions.prevHash, old), gt(authSessions.prevValidUntil, now))),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    )
    .returning()
  if (!row) {
    // Un refresh ya rotado (de cualquiera de las últimas 8 generaciones) y fuera de la gracia: se asume robo y se revoca la sesión.
    await db
      .update(authSessions)
      .set({ revokedAt: now })
      .where(and(or(eq(authSessions.prevHash, old), sql`${old} = any(${authSessions.retiredHashes})`), isNull(authSessions.revokedAt)))
    throw new HttpError(401, 'invalid_refresh')
  }
  const [user] = await db.select().from(users).where(eq(users.id, row.userId))
  if (!user || user.disabled) {
    await db.update(authSessions).set({ revokedAt: now }).where(eq(authSessions.id, row.id))
    throw new HttpError(user ? 403 : 401, user ? 'disabled' : 'invalid_refresh')
  }
  void device
  return {
    accessToken: await signAccess({ sub: user.id, role: user.role, tv: user.tokenVersion, sid: row.id }),
    expiresIn: ACCESS_TTL_S, refreshToken: next, user: toPublic(user),
  }
}

export async function logout(db: Db, refreshToken: unknown, now = Date.now()) {
  if (typeof refreshToken !== 'string') return
  const h = sha256(refreshToken)
  await db.update(authSessions).set({ revokedAt: now }).where(and(or(eq(authSessions.refreshHash, h), eq(authSessions.prevHash, h)), isNull(authSessions.revokedAt)))
}

export const logoutAll = (db: Db, ctx: AuthContext, now = Date.now()) => revokeUserSessions(db, ctx.userId, now)

/** Valida el access token y que la cuenta/sesión sigan vigentes (desactivar o revocar corta el acceso al instante). */
export async function authenticate(db: Db, header: string | undefined): Promise<AuthContext> {
  const token = header?.replace(/^Bearer /i, '')
  if (!token) throw new HttpError(401, 'unauthorized')
  let claims
  try {
    claims = await verifyAccess(token)
  } catch {
    throw new HttpError(401, 'unauthorized')
  }
  const [row] = await db
    .select({ user: users, revokedAt: authSessions.revokedAt, sessionUser: authSessions.userId })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.id, claims.sid))
  if (!row || row.revokedAt || row.sessionUser !== claims.sub || row.user.id !== claims.sub || row.user.disabled || row.user.tokenVersion !== claims.tv) {
    throw new HttpError(401, 'unauthorized')
  }
  return { userId: row.user.id, role: row.user.role, sessionId: claims.sid, user: toPublic(row.user) }
}

export const requireAdmin = (ctx: AuthContext) => {
  if (ctx.role !== 'admin') throw new HttpError(403, 'forbidden')
}

// ───────────── Registro por invitación ─────────────

export type InviteStatus = { valid: true } | { valid: false; reason: 'expired' | 'used' | 'invalid' }

export async function checkInvite(db: Db, code: unknown, ip = 'unknown', now = Date.now()): Promise<InviteStatus> {
  if (typeof code !== 'string' || code.length < 10 || code.length > 100) return { valid: false, reason: 'invalid' }
  await assertNotLocked(db, [limitKey('invite', ip)], now)
  const [inv] = await db.select().from(invitations).where(eq(invitations.codeHash, sha256(code)))
  if (!inv || inv.revokedAt) {
    await recordFailure(db, 'invite', ip, now)
    return { valid: false, reason: 'invalid' }
  }
  if (inv.usedAt) return { valid: false, reason: 'used' }
  if (inv.expiresAt <= now) return { valid: false, reason: 'expired' }
  return { valid: true }
}

export async function register(
  db: Db, input: { code: unknown; email: unknown; password: unknown; displayName?: unknown; ip?: string; device?: string }, now = Date.now(),
): Promise<SessionResponse> {
  const ip = input.ip || 'unknown'
  const status = await checkInvite(db, input.code, ip, now)
  if (!status.valid) throw new HttpError(400, `invite_${status.reason}`)
  const email = normalizeEmail(input.email)
  const reasons = passwordProblems(input.password, email)
  if (reasons.length) throw new HttpError(422, 'weak_password', { reasons })
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (taken) throw new HttpError(409, 'email_taken')

  const userId = newId()
  // Consumir la invitación es una única sentencia atómica: dos registros simultáneos con el mismo código no pasan ambos.
  const [inv] = await db
    .update(invitations)
    .set({ usedAt: now, usedBy: userId })
    .where(and(eq(invitations.codeHash, sha256(input.code as string)), isNull(invitations.usedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, now)))
    .returning()
  if (!inv) throw new HttpError(400, 'invite_used')

  const displayName = typeof input.displayName === 'string' && input.displayName.trim() ? input.displayName.trim().slice(0, 60) : email.split('@')[0]
  try {
    const [user] = await db
      .insert(users)
      .values({ id: userId, email, passwordHash: await hashPassword(input.password as string), displayName, role: inv.role, createdAt: now, lastLoginAt: now })
      .returning()
    return await openSession(db, user, input.device ?? '', now)
  } catch (e) {
    // Si el alta falla (p. ej. correo duplicado en carrera) la invitación se libera.
    await db.update(invitations).set({ usedAt: null, usedBy: null }).where(eq(invitations.id, inv.id))
    if (String(e).includes('users_email_uq') || String((e as { cause?: unknown })?.cause).includes('users_email_uq')) throw new HttpError(409, 'email_taken')
    throw e
  }
}

// ───────────── Cuenta ─────────────

export async function changePassword(
  db: Db, ctx: AuthContext, input: { currentPassword: unknown; newPassword: unknown; device?: string }, now = Date.now(),
): Promise<SessionResponse> {
  await assertNotLocked(db, [limitKey('email', ctx.user.email)], now)
  const [user] = await db.select().from(users).where(eq(users.id, ctx.userId))
  const current = typeof input.currentPassword === 'string' ? input.currentPassword.slice(0, 1024) : ''
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    await recordFailure(db, 'email', ctx.user.email, now)
    throw new HttpError(401, 'wrong_current_password')
  }
  const reasons = passwordProblems(input.newPassword, user.email)
  if (reasons.length) throw new HttpError(422, 'weak_password', { reasons })
  if (input.newPassword === current) throw new HttpError(422, 'weak_password', { reasons: ['La nueva contraseña debe ser distinta de la actual.'] })
  const [updated] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword as string), tokenVersion: user.tokenVersion + 1, mustChangePassword: false })
    .where(eq(users.id, user.id))
    .returning()
  await revokeUserSessions(db, user.id, now)
  await clearFailures(db, 'email', user.email)
  return openSession(db, updated, input.device ?? '', now)
}

// ───────────── Administración ─────────────

export interface InvitationView {
  id: string; role: 'admin' | 'user'; createdAt: number; expiresAt: number; usedAt: number | null; usedBy: string | null; revokedAt: number | null
  status: 'active' | 'used' | 'expired' | 'revoked'
}

export async function listInvitations(db: Db, now = Date.now()): Promise<InvitationView[]> {
  const rows = await db.select().from(invitations)
  const emails = new Map((await db.select({ id: users.id, email: users.email }).from(users)).map((u) => [u.id, u.email]))
  return rows
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ codeHash: _h, createdBy: _c, ...r }) => ({
      ...r,
      usedBy: r.usedBy ? (emails.get(r.usedBy) ?? r.usedBy) : null, // se muestra el correo de quien la usó
      status: r.revokedAt ? 'revoked' : r.usedAt ? 'used' : r.expiresAt <= now ? 'expired' : 'active',
    }))
}

export async function createInvitation(db: Db, ctx: AuthContext, opts: { role?: unknown; days?: unknown }, origin: string, now = Date.now()) {
  const role = opts.role === 'admin' ? 'admin' : 'user'
  const days = Math.min(Math.max(Number(opts.days) || 7, 1), 30)
  const code = newSecret(16)
  const id = newId()
  const expiresAt = now + days * 86_400_000
  await db.insert(invitations).values({ id, codeHash: sha256(code), role, createdBy: ctx.userId, createdAt: now, expiresAt })
  return { id, code, url: `${origin.replace(/\/$/, '')}/invitacion/${code}`, expiresAt }
}

export const revokeInvitation = (db: Db, id: string, now = Date.now()) =>
  db.update(invitations).set({ revokedAt: now }).where(and(eq(invitations.id, id), isNull(invitations.usedAt)))

export async function listUsers(db: Db) {
  const rows = await db.select().from(users)
  const sessions = await db
    .select({ userId: authSessions.userId, n: sql<number>`count(*)::int` })
    .from(authSessions)
    .where(and(isNull(authSessions.revokedAt), gt(authSessions.expiresAt, Date.now())))
    .groupBy(authSessions.userId)
  const count = new Map(sessions.map((s) => [s.userId, s.n]))
  return rows
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((u) => ({
      id: u.id, email: u.email, displayName: u.displayName, role: u.role, disabled: u.disabled,
      createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, sessions: count.get(u.id) ?? 0,
    }))
}

export async function updateUser(db: Db, ctx: AuthContext, id: string, patch: { disabled?: unknown; role?: unknown; displayName?: unknown }, now = Date.now()) {
  const set: Partial<typeof users.$inferInsert> = {}
  if (typeof patch.disabled === 'boolean') set.disabled = patch.disabled
  if (patch.role === 'admin' || patch.role === 'user') set.role = patch.role
  if (typeof patch.displayName === 'string') set.displayName = patch.displayName.trim().slice(0, 60)
  // Un admin no puede quitarse a sí mismo el acceso (evita quedarse sin administradores).
  if (id === ctx.userId && (set.disabled === true || set.role === 'user')) throw new HttpError(400, 'cannot_demote_self')
  if (!Object.keys(set).length) return
  const [u] = await db.update(users).set(set).where(eq(users.id, id)).returning()
  if (!u) throw new HttpError(404, 'not_found')
  if (set.disabled || set.role) await revokeUserSessions(db, id, now) // los cambios de rol/estado obligan a reiniciar sesión
}

/** Contraseña temporal legible (sin caracteres ambiguos). El usuario deberá cambiarla al entrar. */
export async function resetPassword(db: Db, id: string, now = Date.now()) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = newSecret(24)
  const temporaryPassword = Array.from(Buffer.from(bytes, 'base64url').subarray(0, 16), (b) => alphabet[b % alphabet.length]).join('')
  const [u] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, id))
    .returning()
  if (!u) throw new HttpError(404, 'not_found')
  await revokeUserSessions(db, id, now)
  return { temporaryPassword }
}

export const logoutUser = (db: Db, id: string, now = Date.now()) => revokeUserSessions(db, id, now)

/** Limpieza oportunista de contadores caducados. */
export const purgeAttempts = (db: Db, now = Date.now()) => db.delete(loginAttempts).where(and(lt(loginAttempts.windowStart, now - 2 * WINDOW_MS), lt(loginAttempts.lockedUntil, now)))
