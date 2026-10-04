// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../../api/_lib/authService'
import * as svc from '../../api/_lib/authService'
import { ensureAdmin } from '../../api/_lib/bootstrap'
import { passwordProblems } from '../../api/_lib/password'
import { callApi, type TestDb } from './testServer'

// scrypt (N=2^15) y PGlite son lentos con la máquina cargada: margen amplio para no dar falsos fallos
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const holder = vi.hoisted(() => ({ t: undefined as undefined | TestDb }))
vi.mock('../../api/_lib/db', async () => {
  const { makeTestDb } = await import('./testServer')
  holder.t = await makeTestDb()
  return { db: holder.t.db }
})

const PW = 'una-contraseña-larga-1'
const ADMIN = 'admin@example.com'
let db: Db
let n = 0

const loginAs = async (email: string, password = PW, ip = `10.0.0.${n++}`) => callApi('POST', '/api/auth/login', { body: { email, password }, ip })
const adminToken = async () => (await loginAs(ADMIN)).body.accessToken as string
async function invite(token: string, body: object = {}) {
  const r = await callApi('POST', '/api/admin/invitations', { token, body })
  expect(r.status).toBe(201)
  return r.body as { id: string; code: string; url: string; expiresAt: number }
}
async function newUser(email: string) {
  const admin = await adminToken()
  const inv = await invite(admin)
  const r = await callApi('POST', '/api/auth/register', { body: { code: inv.code, email, password: PW }, ip: `10.9.${n++}.1` })
  expect(r.status).toBe(201)
  return r.body as svc.SessionResponse
}

beforeAll(async () => {
  await import('../../api/_lib/db') // dispara el mock y crea el esquema
  await callApi('GET', '/api/auth/invite') // carga los handlers
  db = holder.t!.db as Db
})

beforeEach(async () => {
  const p = holder.t!.pglite
  await p.exec('TRUNCATE users, auth_sessions, invitations, login_attempts, workout_templates, sessions, set_logs, exercises')
  await ensureAdmin(db, { email: ADMIN, password: PW })
})

describe('login', () => {
  it('devuelve sesión y no revela si el correo existe', async () => {
    const ok = await loginAs(ADMIN)
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ user: { email: ADMIN, role: 'admin', mustChangePassword: false }, expiresIn: 900 })
    expect(ok.body.user.passwordHash).toBeUndefined()
    const bad = await loginAs(ADMIN, 'otra-contraseña-larga')
    const unknown = await loginAs('nadie@example.com')
    expect([bad.status, unknown.status]).toEqual([401, 401])
    expect(bad.body).toEqual(unknown.body)
  })

  it('normaliza el correo (mayúsculas y espacios)', async () => {
    expect((await loginAs('  ADMIN@Example.COM ')).status).toBe(200)
  })

  it('bloquea tras 5 fallos por correo (429 + Retry-After) aunque cambie la IP, y la contraseña buena no entra durante el bloqueo', async () => {
    for (let i = 0; i < 5; i++) expect((await loginAs(ADMIN, 'mala-contraseña-larga')).status).toBe(401)
    const blocked = await loginAs(ADMIN, PW)
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    expect(blocked.body.error).toBe('rate_limited')
  })

  it('limita por IP: 30 fallos con correos distintos', async () => {
    for (let i = 0; i < 30; i++) await callApi('POST', '/api/auth/login', { body: { email: `x${i}@e.com`, password: 'x' }, ip: '6.6.6.6' })
    expect((await callApi('POST', '/api/auth/login', { body: { email: ADMIN, password: PW }, ip: '6.6.6.6' })).status).toBe(429)
    expect((await loginAs(ADMIN)).status).toBe(200) // otra IP: sigue entrando
  })

  it('un login correcto reinicia el contador de fallos', async () => {
    for (let i = 0; i < 4; i++) await loginAs(ADMIN, 'mala-contraseña-larga')
    expect((await loginAs(ADMIN)).status).toBe(200)
    for (let i = 0; i < 4; i++) expect((await loginAs(ADMIN, 'mala-contraseña-larga')).status).toBe(401)
  })

  it('cuenta desactivada: 403', async () => {
    const user = await newUser('u@example.com')
    await callApi('PATCH', `/api/admin/users?id=${user.user.id}`, { token: await adminToken(), body: { disabled: true } })
    expect((await loginAs('u@example.com')).status).toBe(403)
  })
})

describe('tokens y sesiones', () => {
  it('refresh rota el token: el anterior vale 30 s y reutilizarlo después revoca la sesión (posible robo)', async () => {
    const s0 = (await loginAs(ADMIN)).body as svc.SessionResponse
    const t0 = Date.now()
    const s1 = await svc.refresh(db, s0.refreshToken, '', t0)
    expect(s1.refreshToken).not.toBe(s0.refreshToken)
    // dos pestañas: el anterior aún vale dentro de la gracia
    const s2 = await svc.refresh(db, s0.refreshToken, '', t0 + 10_000)
    expect(s2.user.email).toBe(ADMIN)
    // s2 rotó otra vez: ahora el anterior es s1; usado fuera de la gracia revoca la sesión entera
    await expect(svc.refresh(db, s1.refreshToken, '', t0 + 120_000)).rejects.toMatchObject({ status: 401 })
    await expect(svc.refresh(db, s2.refreshToken, '', t0 + 130_000)).rejects.toMatchObject({ status: 401 })
  })

  it('reutilizar un refresh de generaciones anteriores (no solo la última) también revoca la sesión', async () => {
    const t0 = Date.now()
    let cur = (await loginAs(ADMIN)).body as svc.SessionResponse
    const stolen = cur.refreshToken
    for (let i = 1; i <= 4; i++) cur = await svc.refresh(db, cur.refreshToken, '', t0 + i * 120_000) // rotaciones legítimas, cada una fuera de gracia
    await expect(svc.refresh(db, stolen, '', t0 + 600_000)).rejects.toMatchObject({ status: 401 })
    await expect(svc.refresh(db, cur.refreshToken, '', t0 + 610_000)).rejects.toMatchObject({ status: 401 }) // la sesión legítima también cae: hay que volver a entrar
  })

  it('un refresh inventado o caducado da 401', async () => {
    expect((await callApi('POST', '/api/auth/refresh', { body: { refreshToken: 'x'.repeat(43) } })).status).toBe(401)
    const s = (await loginAs(ADMIN)).body as svc.SessionResponse
    await expect(svc.refresh(db, s.refreshToken, '', Date.now() + 91 * 86_400_000)).rejects.toMatchObject({ status: 401 })
  })

  it('logout revoca la sesión: ni el refresh ni el access siguen valiendo', async () => {
    const s = (await loginAs(ADMIN)).body as svc.SessionResponse
    expect((await callApi('GET', '/api/auth/me', { token: s.accessToken })).status).toBe(200)
    await callApi('POST', '/api/auth/logout', { body: { refreshToken: s.refreshToken } })
    expect((await callApi('GET', '/api/auth/me', { token: s.accessToken })).status).toBe(401)
    expect((await callApi('POST', '/api/auth/refresh', { body: { refreshToken: s.refreshToken } })).status).toBe(401)
  })

  it('logout-all revoca todas las sesiones propias', async () => {
    const a = (await loginAs(ADMIN)).body as svc.SessionResponse
    const b = (await loginAs(ADMIN)).body as svc.SessionResponse
    await callApi('POST', '/api/auth/logout-all', { token: a.accessToken })
    expect((await callApi('GET', '/api/auth/me', { token: b.accessToken })).status).toBe(401)
  })

  it('desactivar a un usuario corta su acceso al instante (aunque el JWT siga vigente)', async () => {
    const u = await newUser('u@example.com')
    expect((await callApi('GET', '/api/auth/me', { token: u.accessToken })).status).toBe(200)
    await callApi('PATCH', `/api/admin/users?id=${u.user.id}`, { token: await adminToken(), body: { disabled: true } })
    expect((await callApi('GET', '/api/auth/me', { token: u.accessToken })).status).toBe(401)
    expect((await callApi('POST', '/api/auth/refresh', { body: { refreshToken: u.refreshToken } })).status).toBe(401)
  })

  it('rechaza tokens manipulados, sin firma o de otro secreto', async () => {
    const s = (await loginAs(ADMIN)).body as svc.SessionResponse
    const [h, p, sig] = s.accessToken.split('.')
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), role: 'admin', sub: 'otro' })).toString('base64url')}.${sig}`
    expect((await callApi('GET', '/api/auth/me', { token: forged })).status).toBe(401)
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${p}.`
    expect((await callApi('GET', '/api/auth/me', { token: none })).status).toBe(401)
    expect((await callApi('GET', '/api/auth/me')).status).toBe(401)
  })

  it('cambiar la contraseña revoca las demás sesiones y devuelve una nueva', async () => {
    const a = (await loginAs(ADMIN)).body as svc.SessionResponse
    const b = (await loginAs(ADMIN)).body as svc.SessionResponse
    const bad = await callApi('POST', '/api/auth/change-password', { token: a.accessToken, body: { currentPassword: 'incorrecta-incorrecta', newPassword: 'nueva-contraseña-larga-2' } })
    expect(bad.status).toBe(401)
    const weak = await callApi('POST', '/api/auth/change-password', { token: a.accessToken, body: { currentPassword: PW, newPassword: 'corta' } })
    expect([weak.status, weak.body.error]).toEqual([422, 'weak_password'])
    const ok = await callApi('POST', '/api/auth/change-password', { token: a.accessToken, body: { currentPassword: PW, newPassword: 'nueva-contraseña-larga-2' } })
    expect(ok.status).toBe(200)
    expect((await callApi('GET', '/api/auth/me', { token: b.accessToken })).status).toBe(401)
    expect((await callApi('GET', '/api/auth/me', { token: a.accessToken })).status).toBe(401)
    expect((await callApi('GET', '/api/auth/me', { token: ok.body.accessToken })).status).toBe(200)
    expect((await loginAs(ADMIN, 'nueva-contraseña-larga-2')).status).toBe(200)
    expect((await loginAs(ADMIN)).status).toBe(401)
  })
})

describe('invitaciones y registro', () => {
  it('solo el admin gestiona invitaciones y usuarios', async () => {
    const u = await newUser('u@example.com')
    for (const [m, p] of [['GET', '/api/admin/invitations'], ['POST', '/api/admin/invitations'], ['GET', '/api/admin/users']] as const) {
      expect((await callApi(m, p, { token: u.accessToken, body: {} })).status).toBe(403)
      expect((await callApi(m, p, { body: {} })).status).toBe(401)
    }
    expect((await callApi('POST', `/api/admin/users?id=${u.user.id}&action=reset-password`, { token: u.accessToken })).status).toBe(403)
  })

  it('el enlace es de un solo uso y el código nunca queda en claro en la base', async () => {
    const admin = await adminToken()
    const inv = await invite(admin)
    expect(inv.url).toMatch(/\/invitacion\/.+/)
    expect(JSON.stringify((await holder.t!.pglite.query('select * from invitations')).rows)).not.toContain(inv.code)
    expect((await callApi('GET', `/api/auth/invite?code=${inv.code}`)).body).toEqual({ valid: true })
    const reg = await callApi('POST', '/api/auth/register', { body: { code: inv.code, email: 'a@example.com', password: PW, displayName: 'Ana' } })
    expect(reg.status).toBe(201)
    expect(reg.body.user).toMatchObject({ email: 'a@example.com', role: 'user', displayName: 'Ana' })
    expect((await callApi('GET', `/api/auth/invite?code=${inv.code}`)).body).toEqual({ valid: false, reason: 'used' })
    const again = await callApi('POST', '/api/auth/register', { body: { code: inv.code, email: 'b@example.com', password: PW } })
    expect([again.status, again.body.error]).toEqual([400, 'invite_used'])
  })

  it('dos registros simultáneos con el mismo código: solo uno entra', async () => {
    const inv = await invite(await adminToken())
    const results = await Promise.all(['p@example.com', 'q@example.com'].map((email) => callApi('POST', '/api/auth/register', { body: { code: inv.code, email, password: PW } })))
    expect(results.map((r) => r.status).sort()).toEqual([201, 400])
  })

  it('caducada, revocada o inventada: no se puede registrar', async () => {
    const admin = await adminToken()
    const inv = await invite(admin)
    await holder.t!.pglite.query('update invitations set expires_at = 1')
    expect((await callApi('GET', `/api/auth/invite?code=${inv.code}`)).body).toEqual({ valid: false, reason: 'expired' })
    expect((await callApi('POST', '/api/auth/register', { body: { code: inv.code, email: 'a@example.com', password: PW } })).body.error).toBe('invite_expired')
    const inv2 = await invite(admin)
    await callApi('DELETE', `/api/admin/invitations?id=${inv2.id}`, { token: admin })
    expect((await callApi('GET', `/api/auth/invite?code=${inv2.code}`)).body).toEqual({ valid: false, reason: 'invalid' })
    expect((await callApi('GET', '/api/auth/invite?code=inventado-inventado-inventado')).body).toEqual({ valid: false, reason: 'invalid' })
  })

  it('contraseña débil o correo repetido: error y la invitación NO se consume', async () => {
    const inv = await invite(await adminToken())
    const weak = await callApi('POST', '/api/auth/register', { body: { code: inv.code, email: 'a@example.com', password: 'corta' } })
    expect([weak.status, weak.body.error]).toEqual([422, 'weak_password'])
    expect(weak.body.reasons.length).toBeGreaterThan(0)
    const taken = await callApi('POST', '/api/auth/register', { body: { code: inv.code, email: ADMIN, password: PW } })
    expect([taken.status, taken.body.error]).toEqual([409, 'email_taken'])
    expect((await callApi('POST', '/api/auth/register', { body: { code: inv.code, email: 'a@example.com', password: PW } })).status).toBe(201)
  })

  it('el rol de la invitación lo fija el admin (y por defecto es usuario)', async () => {
    const admin = await adminToken()
    const inv = await invite(admin, { role: 'admin' })
    const reg = await callApi('POST', '/api/auth/register', { body: { code: inv.code, email: 'jefe@example.com', password: PW, role: 'admin' } })
    expect(reg.body.user.role).toBe('admin')
    const inv2 = await invite(admin)
    const reg2 = await callApi('POST', '/api/auth/register', { body: { code: inv2.code, email: 'u@example.com', password: PW, role: 'admin' } })
    expect(reg2.body.user.role).toBe('user') // el cuerpo no puede elevar el rol
  })

  it('reset por admin: contraseña temporal, cambio obligatorio y sesiones cerradas', async () => {
    const u = await newUser('u@example.com')
    const admin = await adminToken()
    const r = await callApi('POST', `/api/admin/users?id=${u.user.id}&action=reset-password`, { token: admin })
    expect(r.body.temporaryPassword).toHaveLength(16)
    expect((await callApi('GET', '/api/auth/me', { token: u.accessToken })).status).toBe(401)
    const login = await loginAs('u@example.com', r.body.temporaryPassword)
    expect(login.body.user.mustChangePassword).toBe(true)
    expect((await loginAs('u@example.com')).status).toBe(401)
  })

  it('un admin no puede desactivarse ni quitarse el rol a sí mismo', async () => {
    const admin = await svc.authenticate(db, `Bearer ${await adminToken()}`)
    const t = await adminToken()
    expect((await callApi('PATCH', `/api/admin/users?id=${admin.userId}`, { token: t, body: { disabled: true } })).status).toBe(400)
    expect((await callApi('PATCH', `/api/admin/users?id=${admin.userId}`, { token: t, body: { role: 'user' } })).status).toBe(400)
  })
})

describe('aislamiento de datos entre usuarios', () => {
  const tpl = (id: string, name: string, updatedAt = 100) => ({ id, name, updatedAt, deletedAt: null })

  it('A no lee ni escribe lo de B, aunque compartan ids deterministas', async () => {
    const a = await newUser('a@example.com')
    const b = await newUser('b@example.com')
    await callApi('POST', '/api/sync/push', { token: a.accessToken, body: { changes: { workoutTemplates: [tpl('seed-tpl-dia-a', 'Rutina de A')] } } })
    await callApi('POST', '/api/sync/push', { token: b.accessToken, body: { changes: { workoutTemplates: [tpl('seed-tpl-dia-a', 'Rutina de B', 999)] } } })
    const pullA = (await callApi('GET', '/api/sync/pull?since=0', { token: a.accessToken })).body.changes.workoutTemplates
    const pullB = (await callApi('GET', '/api/sync/pull?since=0', { token: b.accessToken })).body.changes.workoutTemplates
    expect(pullA.map((r: { name: string }) => r.name)).toEqual(['Rutina de A']) // B no pisó la de A pese al mismo id y updatedAt mayor
    expect(pullB.map((r: { name: string }) => r.name)).toEqual(['Rutina de B'])
  })

  it('el user_id del cuerpo se ignora: siempre manda el token', async () => {
    const a = await newUser('a@example.com')
    const b = await newUser('b@example.com')
    await callApi('POST', '/api/sync/push', { token: a.accessToken, body: { changes: { workoutTemplates: [{ ...tpl('t1', 'mía'), userId: b.user.id }] } } })
    const pullB = (await callApi('GET', '/api/sync/pull?since=0', { token: b.accessToken })).body.changes.workoutTemplates
    expect(pullB).toEqual([])
    const pullA = (await callApi('GET', '/api/sync/pull?since=0', { token: a.accessToken })).body.changes.workoutTemplates
    expect(pullA).toHaveLength(1)
    expect(pullA[0].userId).toBeUndefined() // el pull no expone user_id
  })

  it('sin token válido no se puede subir ni bajar', async () => {
    expect((await callApi('POST', '/api/sync/push', { body: { changes: {} } })).status).toBe(401)
    expect((await callApi('GET', '/api/sync/pull?since=0')).status).toBe(401)
    expect((await callApi('GET', '/api/sync/pull?since=0', { token: 'basura' })).status).toBe(401)
  })

  it('LWW dentro del mismo usuario: una escritura más antigua no pisa a la nueva', async () => {
    const a = await newUser('a@example.com')
    await callApi('POST', '/api/sync/push', { token: a.accessToken, body: { changes: { workoutTemplates: [tpl('t1', 'nueva', 200)] } } })
    await callApi('POST', '/api/sync/push', { token: a.accessToken, body: { changes: { workoutTemplates: [tpl('t1', 'vieja', 100)] } } })
    const pull = (await callApi('GET', '/api/sync/pull?since=0', { token: a.accessToken })).body.changes.workoutTemplates
    expect(pull.map((r: { name: string }) => r.name)).toEqual(['nueva'])
  })

  it('el cursor es por usuario: B no ve cambios de A ni siquiera con since=0', async () => {
    const a = await newUser('a@example.com')
    const b = await newUser('b@example.com')
    await callApi('POST', '/api/sync/push', { token: a.accessToken, body: { changes: { sessions: [{ id: 's1', templateId: null, startedAt: 1, endedAt: null, notes: 'secreto', updatedAt: 5, deletedAt: null }] } } })
    const pullB = (await callApi('GET', '/api/sync/pull?since=0', { token: b.accessToken })).body.changes
    expect(Object.values(pullB).flat()).toEqual([])
  })
})

describe('política de contraseñas y bootstrap', () => {
  it('valida longitud, parte local del correo y contraseñas comunes', () => {
    expect(passwordProblems('corta', 'a@b.com')).not.toEqual([])
    expect(passwordProblems('x'.repeat(129))).not.toEqual([])
    expect(passwordProblems('maria.lopez', 'maria.lopez@b.com')).not.toEqual([])
    expect(passwordProblems('password123')).not.toEqual([])
    expect(passwordProblems('aaaaaaaaaaaa')).not.toEqual([])
    expect(passwordProblems('una-contraseña-larga-1', 'a@b.com')).toEqual([])
    expect(passwordProblems('frase con espacios y ñ 2026')).toEqual([])
  })

  it('ensureAdmin es idempotente y no cambia la contraseña salvo reset explícito', async () => {
    const again = await ensureAdmin(db, { email: ADMIN, password: 'otra-contraseña-distinta-9' })
    expect(again).toMatchObject({ created: false, reason: 'exists' })
    expect((await loginAs(ADMIN)).status).toBe(200)
    await ensureAdmin(db, { email: ADMIN, password: 'otra-contraseña-distinta-9', resetPassword: true })
    expect((await loginAs(ADMIN, 'otra-contraseña-distinta-9')).status).toBe(200)
    await expect(ensureAdmin(db, { email: 'x@y.com', password: 'corta' })).rejects.toMatchObject({ status: 422 })
  })

  it('las contraseñas se guardan con scrypt y sal, nunca en claro', async () => {
    const { rows } = await holder.t!.pglite.query<{ password_hash: string }>('select password_hash from users')
    expect(rows[0].password_hash).toMatch(/^scrypt\$32768\$8\$1\$/)
    expect(rows[0].password_hash).not.toContain(PW)
  })
})
