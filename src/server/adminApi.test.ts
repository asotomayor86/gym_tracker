// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../../api/_lib/authService'
import { ensureAdmin } from '../../api/_lib/bootstrap'
import { AdminApiError, createAdminApi } from '../lib/adminClient'
import { callApi, type TestDb } from './testServer'

const holder = vi.hoisted(() => ({ t: undefined as undefined | TestDb }))
vi.mock('../../api/_lib/db', async () => {
  const { makeTestDb } = await import('./testServer')
  holder.t = await makeTestDb()
  return { db: holder.t.db }
})
vi.setConfig({ testTimeout: 30_000 })

const PW = 'una-contraseña-larga-1'
const ADMIN = 'admin@example.com'
let ip = 0

const serverFetch: typeof fetch = async (input, init) => {
  const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]))
  const r = await callApi(init?.method ?? 'GET', String(input), { headers, ip: `50.0.0.${ip++ % 200}`, body: init?.body ? JSON.parse(String(init.body)) : undefined })
  return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status })
}
const login = async (email: string, password = PW) => (await callApi('POST', '/api/auth/login', { body: { email, password }, ip: `51.0.0.${ip++ % 200}` })).body.accessToken as string
const apiFor = (token: () => Promise<string>) => createAdminApi({ getToken: token, refresh: async () => {}, fetch: serverFetch })

beforeAll(async () => {
  await import('../../api/_lib/db')
  await callApi('GET', '/api/auth/invite')
})
beforeEach(async () => {
  await holder.t!.pglite.exec('TRUNCATE users, auth_sessions, invitations, login_attempts')
  await ensureAdmin(holder.t!.db as Db, { email: ADMIN, password: PW })
})

describe('cliente de administración (adminApi) contra la API real', () => {
  it('invitaciones: crear (código una sola vez), listar con su estado, usar y revocar', async () => {
    const admin = apiFor(async () => login(ADMIN))
    const inv = await admin.createInvitation({ days: 3 })
    expect(inv.code.length).toBeGreaterThan(15)
    expect(inv.url).toContain(`/invitacion/${inv.code}`)
    expect((await admin.listInvitations())[0]).toMatchObject({ id: inv.id, status: 'active', role: 'user', usedBy: null })
    expect(JSON.stringify(await admin.listInvitations())).not.toContain(inv.code) // el código no vuelve a salir

    await callApi('POST', '/api/auth/register', { body: { code: inv.code, email: 'ana@example.com', password: PW }, ip: '52.0.0.1' })
    expect((await admin.listInvitations())[0]).toMatchObject({ status: 'used', usedBy: 'ana@example.com' }) // se ve el correo

    const other = await admin.createInvitation()
    await admin.revokeInvitation(other.id)
    expect((await admin.listInvitations()).find((i) => i.id === other.id)!.status).toBe('revoked')
  })

  it('usuarios: listar, desactivar, cambiar rol, cerrar sesiones y restablecer contraseña', async () => {
    const admin = apiFor(async () => login(ADMIN))
    const inv = await admin.createInvitation()
    await callApi('POST', '/api/auth/register', { body: { code: inv.code, email: 'ana@example.com', password: PW, displayName: 'Ana' }, ip: '52.0.0.2' })
    const users = await admin.listUsers()
    expect(users.map((u) => u.email)).toEqual([ADMIN, 'ana@example.com'])
    expect(users[1]).toMatchObject({ displayName: 'Ana', role: 'user', disabled: false, sessions: 1 })
    expect(JSON.stringify(users)).not.toContain('scrypt')

    const ana = users[1].id
    await admin.updateUser(ana, { displayName: 'Ana M.', role: 'admin' })
    expect((await admin.listUsers())[1]).toMatchObject({ displayName: 'Ana M.', role: 'admin', sessions: 0 }) // cambiar el rol cierra sus sesiones
    await admin.updateUser(ana, { disabled: true })
    expect((await callApi('POST', '/api/auth/login', { body: { email: 'ana@example.com', password: PW }, ip: '52.0.0.3' })).status).toBe(403)
    await admin.updateUser(ana, { disabled: false, role: 'user' })

    const { temporaryPassword } = await admin.resetPassword(ana)
    const session = (await callApi('POST', '/api/auth/login', { body: { email: 'ana@example.com', password: temporaryPassword }, ip: '52.0.0.4' })).body
    expect(session.user.mustChangePassword).toBe(true)
    await admin.logoutUser(ana)
    expect((await callApi('GET', '/api/auth/me', { token: session.accessToken })).status).toBe(401)
  })

  it('un usuario normal recibe forbidden y un admin no puede quitarse el acceso a sí mismo', async () => {
    const admin = apiFor(async () => login(ADMIN))
    const inv = await admin.createInvitation()
    await callApi('POST', '/api/auth/register', { body: { code: inv.code, email: 'ana@example.com', password: PW }, ip: '52.0.0.5' })
    const asUser = apiFor(async () => login('ana@example.com'))
    await expect(asUser.listUsers()).rejects.toMatchObject({ status: 403, code: 'forbidden' })
    await expect(asUser.createInvitation()).rejects.toBeInstanceOf(AdminApiError)

    const me = (await admin.listUsers()).find((u) => u.email === ADMIN)!
    await expect(admin.updateUser(me.id, { disabled: true })).rejects.toMatchObject({ code: 'cannot_demote_self' })
    await expect(admin.updateUser('no-existe', { disabled: true })).rejects.toMatchObject({ status: 404 })
  })

  it('sin red lanza AdminApiError network; con 401 reintenta tras renovar el token', async () => {
    const offline = createAdminApi({ getToken: async () => 't', refresh: async () => {}, fetch: (async () => { throw new TypeError('x') }) as typeof fetch })
    await expect(offline.listUsers()).rejects.toMatchObject({ code: 'network' })
    let refreshed = 0
    let calls = 0
    const flaky = createAdminApi({
      getToken: async () => (refreshed ? await login(ADMIN) : 'caducado'),
      refresh: async () => void refreshed++,
      fetch: ((...a: Parameters<typeof fetch>) => (calls++, serverFetch(...a))) as typeof fetch,
    })
    expect((await flaky.listUsers()).length).toBe(1)
    expect([refreshed, calls]).toEqual([1, 2])
  })
})
