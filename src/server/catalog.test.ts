// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../../api/_lib/authService'
import { ensureAdmin } from '../../api/_lib/bootstrap'
import { callApi, type TestDb } from './testServer'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const holder = vi.hoisted(() => ({ t: undefined as undefined | TestDb }))
vi.mock('../../api/_lib/db', async () => {
  const { makeTestDb } = await import('./testServer')
  holder.t = await makeTestDb()
  return { db: holder.t.db }
})

const PW = 'una-contraseña-larga-1'
const ADMIN = 'admin@example.com'
let ip = 0
let adminToken = ''
let userToken = ''

const ex = (id: string, name: string, p: object = {}) => ({ id, name, primaryMuscle: 'pecho', secondaryMuscles: [], equipment: 'Máquina', notes: '', updatedAt: 100, deletedAt: null, ...p })
const push = (token: string, catalog: object, changes: object = {}) => callApi('POST', '/api/sync/push', { token, body: { changes, catalog } })
const pull = async (token: string, catalogSince = 0) => (await callApi('GET', `/api/sync/pull?since=0&catalogSince=${catalogSince}`, { token })).body

beforeAll(async () => {
  await import('../../api/_lib/db')
  await callApi('GET', '/api/auth/invite')
})

beforeEach(async () => {
  await holder.t!.pglite.exec('TRUNCATE users, auth_sessions, invitations, login_attempts, exercises, gyms, exercise_gyms, workout_templates')
  await ensureAdmin(holder.t!.db as Db, { email: ADMIN, password: PW })
  adminToken = (await callApi('POST', '/api/auth/login', { body: { email: ADMIN, password: PW }, ip: `60.0.0.${ip++ % 200}` })).body.accessToken
  const inv = (await callApi('POST', '/api/admin/invitations', { token: adminToken, body: {} })).body
  userToken = (await callApi('POST', '/api/auth/register', { body: { code: inv.code, email: 'u@example.com', password: PW }, ip: `61.0.0.${ip++ % 200}` })).body.accessToken
})

describe('catálogo global: ejercicios, gimnasios y disponibilidad', () => {
  it('el admin escribe y cualquier usuario lo lee (con cursor del catálogo)', async () => {
    const r = await push(adminToken, {
      exercises: [ex('seed-ex-prensa', 'Prensa de piernas')],
      gyms: [{ id: 'gym-forus', name: 'Forus', notes: '', sort: 0, updatedAt: 100, deletedAt: null }],
      exerciseGyms: [{ id: 'seed-ex-prensa:gym-forus', exerciseId: 'seed-ex-prensa', gymId: 'gym-forus', available: true, updatedAt: 100, deletedAt: null }],
    })
    expect(r.body.catalog).toMatchObject({ applied: 3, rejected: {} })

    const asUser = await pull(userToken)
    expect(asUser.catalog.exercises.map((e: { id: string }) => e.id)).toEqual(['seed-ex-prensa'])
    expect(asUser.catalog.gyms[0]).toMatchObject({ name: 'Forus' })
    expect(asUser.catalog.exerciseGyms[0]).toMatchObject({ available: true })
    expect(asUser.catalog.exercises[0].userId).toBeUndefined()
    expect(asUser.catalog.exercises[0].syncedAt).toBeUndefined()
    // Con el cursor devuelto no vuelve a bajar nada; un cambio nuevo sí.
    await new Promise((r) => setTimeout(r, 1100)) // el cursor lleva 1 s de margen hacia atrás (re-aplicar es idempotente)
    expect((await pull(userToken, asUser.catalogCursor + 1500)).catalog.exercises).toEqual([])
    await push(adminToken, { exercises: [ex('seed-ex-prensa', 'Prensa 45°', { updatedAt: 200 })] })
    expect((await pull(userToken, asUser.catalogCursor)).catalog.exercises.map((e: { name: string }) => e.name)).toEqual(['Prensa 45°'])
  })

  it('un usuario normal NO puede escribir el catálogo (403) y nada queda guardado', async () => {
    const r = await push(userToken, { exercises: [ex('malo', 'Ejercicio trampa')], gyms: [{ id: 'g', name: 'X', updatedAt: 1, deletedAt: null }] })
    expect(r.status).toBe(403)
    expect((await pull(adminToken)).catalog.exercises).toEqual([])
    // Subir solo sus datos (sin catálogo) sigue funcionando.
    const own = await push(userToken, {}, { workoutTemplates: [{ id: 't1', name: 'mía', updatedAt: 5, deletedAt: null }] })
    expect(own.status).toBe(200)
  })

  it('no admite ejercicios duplicados por nombre, ni músculos inválidos, ni ids de disponibilidad incoherentes', async () => {
    await push(adminToken, { exercises: [ex('a', 'Press de pecho')] })
    const r = await push(adminToken, {
      exercises: [ex('b', 'press  DE pecho'), ex('c', 'Otro', { primaryMuscle: 'cerebro' }), ex('d', '   ')],
      gyms: [{ id: 'g', name: '', updatedAt: 1, deletedAt: null }],
      exerciseGyms: [{ id: 'cualquiera', exerciseId: 'a', gymId: 'g', available: true, updatedAt: 1, deletedAt: null }, { id: 'a:g', exerciseId: 'a', gymId: 'g', available: 'si', updatedAt: 1, deletedAt: null }],
    })
    expect(r.body.catalog.applied).toBe(0)
    expect(r.body.catalog.rejected).toEqual({ exercises: 3, gyms: 1, exerciseGyms: 2 })
    expect((await pull(userToken)).catalog.exercises.map((e: { id: string }) => e.id)).toEqual(['a'])
  })

  it('last-write-wins en el catálogo y un borrado de algo desconocido se ignora', async () => {
    await push(adminToken, { exercises: [ex('a', 'Nuevo', { updatedAt: 200 })] })
    await push(adminToken, { exercises: [ex('a', 'Viejo', { updatedAt: 100 })] })
    expect((await pull(adminToken)).catalog.exercises[0].name).toBe('Nuevo')
    const r = await push(adminToken, { exercises: [ex('fantasma', 'Duplicado antiguo', { updatedAt: 5, deletedAt: 5 })] })
    expect(r.body.catalog).toMatchObject({ applied: 0, rejected: {} })
    expect((await pull(adminToken)).catalog.exercises.map((e: { id: string }) => e.id)).toEqual(['a'])
    // Un borrado de algo conocido sí se propaga (borrado lógico, y el nombre queda libre).
    await push(adminToken, { exercises: [ex('a', 'Nuevo', { updatedAt: 300, deletedAt: 300 })] })
    expect((await pull(userToken)).catalog.exercises[0].deletedAt).toBe(300)
    expect((await push(adminToken, { exercises: [ex('b', 'Nuevo')] })).body.catalog.applied).toBe(1)
  })

  it('nameEn: lo guarda el admin (recortado), se valida y un cliente antiguo que no lo envía no lo pisa', async () => {
    await push(adminToken, { exercises: [ex('a', 'Prensa de piernas', { nameEn: '  Leg Press  ' })] })
    expect((await pull(userToken)).catalog.exercises[0]).toMatchObject({ name: 'Prensa de piernas', nameEn: 'Leg Press' })
    // Cliente antiguo (sin el campo) edita el nombre más tarde: el nombre cambia y el nameEn se conserva.
    const old = ex('a', 'Prensa 45', { updatedAt: 200 }) as Record<string, unknown>
    delete old.nameEn
    expect((await push(adminToken, { exercises: [old] })).body.catalog.applied).toBe(1)
    expect((await pull(userToken)).catalog.exercises[0]).toMatchObject({ name: 'Prensa 45', nameEn: 'Leg Press' })
    // Valores no válidos se rechazan.
    const bad = await push(adminToken, { exercises: [ex('b', 'Otro', { nameEn: 'x'.repeat(121) }), ex('c', 'Otro 2', { nameEn: 5 })] })
    expect(bad.body.catalog).toMatchObject({ applied: 0, rejected: { exercises: 2 } })
    // Vaciarlo explícitamente (admin) sí está permitido.
    await push(adminToken, { exercises: [ex('a', 'Prensa 45', { updatedAt: 300, nameEn: '' })] })
    expect((await pull(userToken)).catalog.exercises[0].nameEn).toBe('')
  })

  it('los datos por usuario siguen aislados aunque el catálogo sea global', async () => {
    await push(userToken, {}, { workoutTemplates: [{ id: 't1', name: 'del usuario', updatedAt: 5, deletedAt: null }] })
    expect((await pull(adminToken)).changes.workoutTemplates).toEqual([])
    expect((await pull(userToken)).changes.workoutTemplates).toHaveLength(1)
  })
})
