// @vitest-environment node
/**
 * End-to-end de cuentas + sincronización: dispositivos con IndexedDB separadas (fake-indexeddb) y el cliente real
 * (authClient + syncEngine + account) contra los handlers REALES de /api sobre Postgres en memoria (PGlite).
 */
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../../api/_lib/authService'
import { ensureAdmin } from '../../api/_lib/bootstrap'
import { GymDB, alive, saveTo } from '../db/db'
import { createAccount } from '../lib/account'
import { AuthError, createAuthClient } from '../lib/authClient'
import { availabilityFor, saveGym, seedGyms, setAvailability } from '../lib/gyms'
import { buildSeedRows } from '../lib/seed'
import { planSeed } from '../lib/seedPlan'
import { createSyncEngine, type KeyValueStore } from '../lib/syncEngine'
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
let online = true
let n = 0
let ipN = 0

/** fetch de un dispositivo: enruta a los handlers reales; sin red lanza TypeError como el navegador. */
const serverFetch: typeof fetch = async (input, init) => {
  if (!online) throw new TypeError('Failed to fetch')
  const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]))
  const r = await callApi(init?.method ?? 'GET', String(input), {
    headers, ip: `20.0.0.${(ipN = (ipN + 1) % 200)}`, body: init?.body ? JSON.parse(String(init.body)) : undefined,
  })
  return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status })
}

const memStore = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), del: (k) => void data.delete(k) }
}

const device = () => {
  const db = new GymDB(`dev-${n++}`, { indexedDB, IDBKeyRange })
  const storage = memStore()
  const auth = createAuthClient({ storage, fetch: serverFetch })
  const engine = createSyncEngine({
    db, storage, fetch: serverFetch, isOnline: () => online, debounceMs: 20, retryMs: [20],
    auth: { hasSession: auth.hasSession, isAdmin: () => auth.currentUser()?.role === 'admin', getAccessToken: auth.getAccessToken, refresh: auth.refresh, expire: () => auth.clear('session_expired'), subscribe: auth.subscribe },
  })
  const account = createAccount({ db, storage, auth, syncNow: engine.syncNow, resetSync: engine.reset })
  return { db, storage, auth, engine, account }
}
type Device = ReturnType<typeof device>

const session = (id: string, notes = 'n') => ({ id, templateId: null, startedAt: 1000, endedAt: null, notes })
const log = (id: string, sessionId: string) => ({
  id, sessionId, exerciseId: 'e1', setIndex: 0, exerciseOrder: 0, reps: 10, weightKg: 50, inputUnit: 'kg' as const, inputWeight: 50,
  effort: 'hard_done' as const, completedAt: 2000,
})
/** Deja que terminen las sincronizaciones lanzadas en segundo plano por el login. */
const settle = async (d: Device) => {
  await vi.waitFor(() => expect(d.engine.getState().status).not.toBe('syncing'), { timeout: 3000 })
  await d.engine.syncNow()
}
async function registerUser(email: string): Promise<Device> {
  const admin = (await callApi('POST', '/api/auth/login', { body: { email: ADMIN, password: PW }, ip: `30.0.0.${ipN++}` })).body.accessToken
  const inv = (await callApi('POST', '/api/admin/invitations', { token: admin, body: {} })).body
  const d = device()
  await d.account.init()
  await d.account.registerWithInvite(inv.code, email, PW)
  await settle(d)
  return d
}
const loginAdmin = async (d?: Device) => {
  const dev = d ?? device()
  await dev.account.init()
  await dev.account.login(ADMIN, PW)
  await settle(dev)
  return dev
}

beforeAll(async () => {
  await import('../../api/_lib/db')
  await callApi('GET', '/api/auth/invite')
})

beforeEach(async () => {
  online = true
  await holder.t!.pglite.exec('TRUNCATE users, auth_sessions, invitations, login_attempts, exercises, gyms, exercise_gyms, workout_templates, template_exercises, sessions, set_logs, biometrics, body_weights, user_prefs')
  await ensureAdmin(holder.t!.db as Db, { email: ADMIN, password: PW })
})

describe('sync end-to-end (cuentas, dos dispositivos, API real)', () => {
  it('datos creados ANTES de iniciar sesión (dispositivo heredado) → el admin los reclama, suben y llegan a otro dispositivo', async () => {
    const A = device()
    await saveTo(A.db, 'sessions', session('s1'))
    await saveTo(A.db, 'setLogs', log('l1', 's1'))
    await A.account.init()
    expect(A.account.getState()).toMatchObject({ status: 'anonymous', notice: { kind: 'legacy-device' } })
    expect(A.engine.getState()).toMatchObject({ status: 'unauth', loggedIn: false })

    await expect(A.account.login(ADMIN, 'mala-contraseña-larga')).rejects.toMatchObject({ code: 'invalid-credentials' })
    await loginAdmin(A)
    expect(A.account.getState()).toMatchObject({ status: 'authenticated', isAdmin: true, notice: null })
    expect(A.engine.getState()).toMatchObject({ status: 'ok', loggedIn: true, pending: 0 })

    const B = await loginAdmin()
    expect((await B.db.sessions.get('s1'))?.notes).toBe('n')
    expect((await B.db.setLogs.get('l1'))?.reps).toBe(10)
  })

  it('el primer sync vuelve a encolar todo lo local propio aunque el outbox estuviera vacío', async () => {
    const A = device()
    await saveTo(A.db, 'sessions', session('s2'))
    await A.db.outbox.clear()
    await loginAdmin(A)
    expect(await (await loginAdmin()).db.sessions.get('s2')).toBeTruthy()
  })

  it('offline: guarda en local con estado "offline" y sube solo al volver la red; los fallos de red no son "error"', async () => {
    const A = await loginAdmin()
    online = false
    await saveTo(A.db, 'sessions', session('s3'))
    await A.engine.syncNow()
    expect(A.engine.getState()).toMatchObject({ status: 'offline', error: null, pending: 1 })
    expect(A.auth.hasSession()).toBe(true) // sin red no se pierde la sesión

    online = true
    await A.engine.syncNow()
    expect(A.engine.getState()).toMatchObject({ status: 'ok', pending: 0 })
    expect(await (await loginAdmin()).db.sessions.get('s3')).toBeTruthy()
  })

  it('no se puede iniciar sesión sin conexión (error "network") y no se toca nada', async () => {
    const A = device()
    await A.account.init()
    online = false
    await expect(A.account.login(ADMIN, PW)).rejects.toMatchObject({ code: 'network' })
    expect(A.account.getState().status).toBe('anonymous')
  })

  it('last-write-wins entre dispositivos de la misma cuenta y borrado lógico propagado', async () => {
    const A = await loginAdmin()
    const B = await loginAdmin()
    await saveTo(A.db, 'sessions', session('s4'))
    await A.engine.syncNow()
    await B.engine.syncNow()
    await saveTo(B.db, 'sessions', session('s4', 'editada en B'))
    await new Promise((r) => setTimeout(r, 5))
    await B.engine.syncNow()
    await A.engine.syncNow()
    expect((await A.db.sessions.get('s4'))?.notes).toBe('editada en B')

    await saveTo(A.db, 'sessions', { ...(await A.db.sessions.get('s4'))!, deletedAt: Date.now() })
    await A.engine.syncNow()
    await B.engine.syncNow()
    expect((await B.db.sessions.get('s4'))?.deletedAt).toBeTruthy()
  })

  it('el access token caducado se renueva solo (refresh rotatorio) y el sync sigue', async () => {
    const A = await loginAdmin()
    const before = JSON.parse(A.storage.get('gym-auth')!)
    A.storage.set('gym-auth', JSON.stringify({ ...before, accessExp: 1 }))
    const A2 = createAuthClient({ storage: A.storage, fetch: serverFetch }) // reabre la app con el access caducado
    await A2.getAccessToken()
    const after = JSON.parse(A.storage.get('gym-auth')!)
    expect(after.refreshToken).not.toBe(before.refreshToken)
    expect(after.accessExp).toBeGreaterThan(1)
  })

  it('sesión revocada en el servidor: pasa a "expirada" conservando el outbox; al volver a entrar se sube todo', async () => {
    const A = await loginAdmin()
    await saveTo(A.db, 'sessions', session('s5'))
    await holder.t!.pglite.exec('UPDATE auth_sessions SET revoked_at = 1')
    await A.engine.syncNow()
    expect(A.engine.getState()).toMatchObject({ status: 'unauth', loggedIn: false, pending: 1 })
    expect(A.account.getState()).toMatchObject({ status: 'expired', notice: { kind: 'session-expired' } })

    await A.account.login(ADMIN, PW) // misma cuenta: no se vacía nada
    await settle(A)
    expect(A.engine.getState()).toMatchObject({ status: 'ok', pending: 0 })
    expect(await (await loginAdmin()).db.sessions.get('s5')).toBeTruthy()
  })

  it('cuenta desactivada: el refresh falla y la sesión termina con motivo "disabled"', async () => {
    const A = await registerUser('u@example.com')
    await holder.t!.pglite.exec("UPDATE users SET disabled = true WHERE email = 'u@example.com'")
    A.storage.set('gym-auth', JSON.stringify({ ...JSON.parse(A.storage.get('gym-auth')!), accessExp: 1 }))
    await A.engine.syncNow()
    expect(A.auth.getSnapshot()).toMatchObject({ session: null, expired: 'disabled' })
  })

  it('las semillas no se suben y dos dispositivos no duplican ejercicios sembrados', async () => {
    const A = device()
    const B = device()
    for (const d of [A, B]) {
      const plan = planSeed(buildSeedRows(), { exercises: [], workoutTemplates: [], templateExercises: [] })
      await d.db.exercises.bulkPut(plan.insert.exercises)
    }
    await loginAdmin(A)
    await loginAdmin(B)
    expect(await holder.t!.pglite.query('select count(*)::int as c from exercises')).toMatchObject({ rows: [{ c: 0 }] })
    const total = buildSeedRows().exercises.length
    expect((await A.db.exercises.filter(alive).toArray()).length).toBe(total)

    const ex = (await A.db.exercises.get('seed-ex-prensa-de-piernas'))!
    await saveTo(A.db, 'exercises', { ...ex, notes: 'mi nota' })
    await A.engine.syncNow()
    await B.engine.syncNow()
    expect((await B.db.exercises.get('seed-ex-prensa-de-piernas'))?.notes).toBe('mi nota')
    expect(await B.db.exercises.count()).toBe(total)
  })

  it('start(): un guardado local se sube solo (debounce) sin llamar a syncNow', async () => {
    const g = globalThis as Record<string, unknown>
    g.window = { addEventListener() {}, removeEventListener() {} }
    g.document = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' }
    try {
      const A = await loginAdmin()
      const stop = A.engine.start()
      await saveTo(A.db, 'sessions', session('s6'))
      await vi.waitFor(
        async () => expect(await holder.t!.pglite.query('select id from sessions')).toMatchObject({ rows: [{ id: 's6' }] }),
        { timeout: 3000 },
      )
      stop()
    } finally {
      delete g.window
      delete g.document
    }
  })
})

describe('cuentas y datos locales', () => {
  it('cada usuario solo ve lo suyo, aunque compartan ids deterministas', async () => {
    const U = await registerUser('u@example.com')
    const V = await registerUser('v@example.com')
    await saveTo(U.db, 'workoutTemplates', { id: 'seed-tpl-dia-a', name: 'de U' })
    await saveTo(V.db, 'workoutTemplates', { id: 'seed-tpl-dia-a', name: 'de V' })
    await saveTo(U.db, 'sessions', session('secreta-de-u'))
    for (const d of [U, V]) await d.engine.syncNow()
    for (const d of [U, V]) await d.engine.syncNow()
    expect((await U.db.workoutTemplates.get('seed-tpl-dia-a'))?.name).toBe('de U')
    expect((await V.db.workoutTemplates.get('seed-tpl-dia-a'))?.name).toBe('de V')
    expect(await V.db.sessions.get('secreta-de-u')).toBeUndefined()
  })

  it('otra cuenta en un dispositivo con datos sin subir: avisa (no entra), conserva todo y solo vacía al confirmar', async () => {
    const A = await loginAdmin()
    online = false
    await saveTo(A.db, 'sessions', session('s-pendiente'))
    await A.engine.syncNow()
    A.engine.reset() // cancela el reintento automático: este test quiere el outbox pendiente
    await A.account.logout() // sin red: el último intento de subir falla y el outbox se conserva
    online = true
    const adminToken = (await callApi('POST', '/api/auth/login', { body: { email: ADMIN, password: PW }, ip: '40.0.0.1' })).body.accessToken
    const inv = (await callApi('POST', '/api/admin/invitations', { token: adminToken, body: {} })).body

    await A.account.registerWithInvite(inv.code, 'u@example.com', PW)
    expect(A.account.getState()).toMatchObject({ status: 'anonymous', notice: { kind: 'other-account', pending: 1 } })
    expect(A.auth.hasSession()).toBe(false)
    expect(await A.db.sessions.get('s-pendiente')).toBeTruthy() // nada se ha tocado todavía

    await A.account.confirmAccountSwitch()
    await settle(A)
    expect(A.account.getState()).toMatchObject({ status: 'authenticated', user: { email: 'u@example.com' }, notice: null })
    expect(await A.db.sessions.get('s-pendiente')).toBeUndefined()
    expect(await A.db.outbox.count()).toBe(0)
    // lo de la otra cuenta no se sube a esta (era justo lo que el aviso advertía que se perdería)
    expect(await holder.t!.pglite.query('select id from sessions')).toMatchObject({ rows: [] })
  })

  it('al cerrar sesión con red se sube antes lo pendiente: cambiar de cuenta no pierde nada', async () => {
    const A = await loginAdmin()
    await saveTo(A.db, 'sessions', session('s-subida'))
    await A.account.logout()
    expect(await holder.t!.pglite.query('select id from sessions')).toMatchObject({ rows: [{ id: 's-subida' }] })
    expect(await A.db.outbox.count()).toBe(0)
  })

  it('cerrar sesión conserva datos y outbox, y volver con la misma cuenta no vacía nada', async () => {
    const A = await loginAdmin()
    online = false
    await saveTo(A.db, 'sessions', session('s7'))
    await A.account.logout() // sin red: no puede subir, así que conserva el outbox
    online = true
    expect(A.account.getState().status).toBe('anonymous')
    expect(await A.db.outbox.count()).toBe(1)
    await loginAdmin(A)
    expect(A.engine.getState()).toMatchObject({ status: 'ok', pending: 0 })
    expect(await holder.t!.pglite.query('select id from sessions')).toMatchObject({ rows: [{ id: 's7' }] })
  })

  it('dispositivo heredado con datos: un usuario NO admin no puede reclamarlos (aviso y vaciar)', async () => {
    const admin = (await callApi('POST', '/api/auth/login', { body: { email: ADMIN, password: PW }, ip: '40.0.0.2' })).body.accessToken
    const inv = (await callApi('POST', '/api/admin/invitations', { token: admin, body: {} })).body
    const A = device()
    await saveTo(A.db, 'sessions', session('legacy'))
    await A.account.init()
    await A.account.registerWithInvite(inv.code, 'u@example.com', PW)
    expect(A.account.getState().notice).toMatchObject({ kind: 'other-account' })
    expect(await holder.t!.pglite.query('select id from sessions')).toMatchObject({ rows: [] })
  })

  it('un dispositivo sin datos locales entra con cualquier cuenta sin avisos', async () => {
    const U = await registerUser('u@example.com')
    expect(U.account.getState()).toMatchObject({ status: 'authenticated', notice: null })
  })

  it('la contraseña obligatoria tras un reset del admin se refleja en el estado y se cambia desde la cuenta', async () => {
    const U = await registerUser('u@example.com')
    const admin = (await callApi('POST', '/api/auth/login', { body: { email: ADMIN, password: PW }, ip: '40.0.0.3' })).body.accessToken
    const { rows } = await holder.t!.pglite.query<{ id: string }>("select id from users where email = 'u@example.com'")
    const tmp = (await callApi('POST', `/api/admin/users?id=${rows[0].id}&action=reset-password`, { token: admin })).body.temporaryPassword
    await U.account.logout()
    await U.account.login('u@example.com', tmp)
    expect(U.account.getState().mustChangePassword).toBe(true)
    await expect(U.account.changePassword('incorrecta-incorrecta', 'otra-contraseña-larga-3')).rejects.toBeInstanceOf(AuthError)
    await U.account.changePassword(tmp, 'otra-contraseña-larga-3')
    expect(U.account.getState().mustChangePassword).toBe(false)
  })

  it('checkInvite avisa antes de registrar', async () => {
    const A = device()
    expect(await A.account.checkInvite('inventado-inventado-inventado')).toEqual({ valid: false, reason: 'invalid' })
  })

  it('la sesión de la versión anterior (gym-token) se descarta y el dispositivo queda como heredado', async () => {
    const A = device()
    A.storage.set('gym-token', 'jwt-viejo')
    expect(A.auth.dropLegacyToken()).toBe(true)
    expect(A.storage.get('gym-token')).toBeNull()
  })
})

describe('catálogo global y preferencias (sync)', () => {
  it('lo que edita el admin (ejercicios, gimnasios, disponibilidad) llega a los demás usuarios', async () => {
    const admin = await loginAdmin()
    await saveGym({ id: 'gym-forus', name: 'Forus' }, admin.db)
    await saveTo(admin.db, 'exercises', { id: 'seed-ex-prensa-de-piernas', name: 'Prensa de piernas', primaryMuscle: 'cuadriceps', secondaryMuscles: [], equipment: 'Máquina', notes: 'catálogo' })
    await setAvailability('seed-ex-prensa-de-piernas', 'gym-forus', false, admin.db)
    await admin.engine.syncNow()

    const user = await registerUser('u@example.com')
    await user.engine.syncNow()
    expect((await user.db.gyms.get('gym-forus'))?.name).toBe('Forus')
    expect((await user.db.exercises.get('seed-ex-prensa-de-piernas'))?.notes).toBe('catálogo')
    expect(availabilityFor('gym-forus', 'seed-ex-prensa-de-piernas', await user.db.exerciseGyms.toArray())).toBe('unavailable')
  })

  it('un usuario normal no sube catálogo: sus cambios locales se descartan del outbox y el servidor no cambia', async () => {
    const user = await registerUser('u@example.com')
    await saveTo(user.db, 'exercises', { id: 'mio', name: 'Ejercicio mío', primaryMuscle: 'pecho', secondaryMuscles: [], equipment: '', notes: '' })
    await saveTo(user.db, 'sessions', session('s-user'))
    await user.engine.syncNow()
    expect(user.engine.getState()).toMatchObject({ status: 'ok', pending: 0 })
    expect(await holder.t!.pglite.query('select id from exercises')).toMatchObject({ rows: [] })
    expect(await holder.t!.pglite.query('select id from sessions')).toMatchObject({ rows: [{ id: 's-user' }] })
  })

  it('las filas semilla de gimnasios/disponibilidad sirven offline y el catálogo del servidor las sustituye', async () => {
    const admin = await loginAdmin()
    await setAvailability('seed-ex-prensa-de-piernas', 'gym-forus', false, admin.db)
    await saveGym({ id: 'gym-forus', name: 'Forus Centro' }, admin.db)
    await admin.engine.syncNow()

    const dev = device()
    await seedGyms(dev.db)
    expect(availabilityFor('gym-forus', 'seed-ex-prensa-de-piernas', await dev.db.exerciseGyms.toArray())).toBe('available') // semilla
    await dev.account.init()
    await dev.account.login(ADMIN, PW)
    await settle(dev)
    expect(availabilityFor('gym-forus', 'seed-ex-prensa-de-piernas', await dev.db.exerciseGyms.toArray())).toBe('unavailable') // servidor
    expect((await dev.db.gyms.get('gym-forus'))?.name).toBe('Forus Centro')
    expect(await dev.db.outbox.count()).toBe(0) // las semillas no se encolan ni se suben
  })

  it('las preferencias (gimnasio habitual, unidad) viajan entre dispositivos de la misma cuenta', async () => {
    const A = await loginAdmin()
    const B = await loginAdmin()
    await saveTo(A.db, 'userPrefs', { id: 'prefs', unit: 'lb', incrementKg: 5, gymId: 'gym-forus' })
    await A.engine.syncNow()
    await B.engine.syncNow()
    expect(await B.db.userPrefs.get('prefs')).toMatchObject({ unit: 'lb', incrementKg: 5, gymId: 'gym-forus' })
    const other = await registerUser('u@example.com')
    expect(await other.db.userPrefs.get('prefs')).toBeUndefined() // aisladas por usuario
  })
})
