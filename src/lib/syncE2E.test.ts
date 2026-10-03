// @vitest-environment node
/**
 * End-to-end de sincronización: dos "dispositivos" (IndexedDB separadas con fake-indexeddb) contra los
 * handlers REALES de /api (login, push, pull, SQL de Drizzle) sobre Postgres en memoria (PGlite).
 */
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GymDB, alive, saveTo } from '../db/db'
import { buildSeedRows } from './seed'
import { planSeed } from './seedPlan'
import { createSyncEngine, type KeyValueStore } from './syncEngine'

type Handler = (req: unknown, res: unknown) => Promise<unknown>
const handlers: Record<string, Handler> = {}
let pglite: import('@electric-sql/pglite').PGlite
let online = true

// Los handlers importan ../_lib/db (Neon): se sustituye por PGlite con el mismo esquema.
vi.mock('../../api/_lib/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('../../db/schema')
  const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api')
  pglite = new PGlite()
  const db = drizzle(pglite)
  const ddl = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema as never))
  await pglite.exec(ddl.join('\n'))
  return { db }
})

const call = async (handler: Handler, method: string, url: URL, headers: Record<string, string>, body?: unknown) => {
  const out = { status: 200, body: undefined as unknown }
  const res = {
    status(c: number) { out.status = c; return res },
    json(b: unknown) { out.body = b; return res },
    end() { return res },
  }
  await handler({ method, headers, body, query: Object.fromEntries(url.searchParams) }, res)
  return out
}

/** fetch de un dispositivo: enruta a los handlers reales; sin red lanza TypeError como el navegador. */
const serverFetch: typeof fetch = async (input, init) => {
  if (!online) throw new TypeError('Failed to fetch')
  const url = new URL(String(input), 'http://localhost')
  const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]))
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  const handler = handlers[url.pathname]
  const r = await call(handler, init?.method ?? 'GET', url, headers, body)
  return new Response(JSON.stringify(r.body ?? {}), { status: r.status })
}

const memStore = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), del: (k) => void data.delete(k) }
}

let n = 0
const device = () => {
  const db = new GymDB(`dev-${n++}`, { indexedDB, IDBKeyRange })
  const storage = memStore()
  const engine = createSyncEngine({ db, storage, fetch: serverFetch, isOnline: () => online, debounceMs: 20, retryMs: [20] })
  return { db, storage, engine }
}

const session = (id: string) => ({ id, templateId: null, startedAt: 1000, endedAt: null, notes: 'n' })

beforeAll(async () => {
  process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret'
  process.env.APP_PASSWORD = 'pw'
  handlers['/api/login'] = (await import(/* @vite-ignore */ '../../api/login')).default as Handler
  handlers['/api/sync/push'] = (await import(/* @vite-ignore */ '../../api/sync/push')).default as Handler
  handlers['/api/sync/pull'] = (await import(/* @vite-ignore */ '../../api/sync/pull')).default as Handler
})

beforeEach(async () => {
  online = true
  await pglite.exec('TRUNCATE exercises, workout_templates, template_exercises, sessions, set_logs, biometrics')
})

describe('sync end-to-end (dos dispositivos, API real)', () => {
  it('A crea una sesión sin sesión iniciada → login → sync → B la recibe', async () => {
    const A = device()
    const B = device()
    // Datos creados ANTES de iniciar sesión (como en el móvil del usuario).
    await saveTo(A.db, 'sessions', session('s1'))
    await saveTo(A.db, 'setLogs', {
      id: 'l1', sessionId: 's1', exerciseId: 'e1', setIndex: 0, reps: 10, weightKg: 50, inputUnit: 'kg', inputWeight: 50,
      effort: 'hard_done', completedAt: 2000,
    })
    expect(A.engine.getState()).toMatchObject({ status: 'unauth', loggedIn: false })

    await expect(A.engine.login('mal')).rejects.toThrow('Contraseña incorrecta')
    await A.engine.login('pw')
    expect(A.engine.getState()).toMatchObject({ status: 'ok', loggedIn: true, pending: 0 })

    await B.engine.login('pw')
    expect((await B.db.sessions.get('s1'))?.notes).toBe('n')
    expect((await B.db.setLogs.get('l1'))?.reps).toBe(10)
  })

  it('el primer sync vuelve a encolar todo lo local aunque el outbox estuviera vacío', async () => {
    const A = device()
    await saveTo(A.db, 'sessions', session('s2'))
    await A.db.outbox.clear() // p. ej. outbox perdido
    await A.engine.login('pw')
    const B = device()
    await B.engine.login('pw')
    expect(await B.db.sessions.get('s2')).toBeTruthy()
  })

  it('offline: guarda en local con estado "offline" y sube solo al volver la red; los fallos de red no son "error"', async () => {
    const A = device()
    await A.engine.login('pw')
    online = false
    await saveTo(A.db, 'sessions', session('s3'))
    await A.engine.syncNow()
    expect(A.engine.getState()).toMatchObject({ status: 'offline', error: null, pending: 1 })

    online = true
    await A.engine.syncNow()
    expect(A.engine.getState()).toMatchObject({ status: 'ok', pending: 0 })
    const B = device()
    await B.engine.login('pw')
    expect(await B.db.sessions.get('s3')).toBeTruthy()
  })

  it('last-write-wins entre dispositivos y borrado lógico propagado', async () => {
    const A = device()
    const B = device()
    await A.engine.login('pw')
    await B.engine.login('pw')
    await saveTo(A.db, 'sessions', session('s4'))
    await A.engine.syncNow()
    await B.engine.syncNow()
    await saveTo(B.db, 'sessions', { ...session('s4'), notes: 'editada en B' })
    await new Promise((r) => setTimeout(r, 5))
    await B.engine.syncNow()
    await A.engine.syncNow()
    expect((await A.db.sessions.get('s4'))?.notes).toBe('editada en B')

    await saveTo(A.db, 'sessions', { ...(await A.db.sessions.get('s4'))!, deletedAt: Date.now() })
    await A.engine.syncNow()
    await B.engine.syncNow()
    expect((await B.db.sessions.get('s4'))?.deletedAt).toBeTruthy()
  })

  it('un token que caduca en <30 días se renueva en el pull', async () => {
    const A = device()
    await A.engine.login('pw')
    const { SignJWT } = await import('jose')
    const old = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('owner')
      .setExpirationTime('5d').sign(new TextEncoder().encode(process.env.AUTH_SECRET))
    A.storage.set('gym-token', old)
    await A.engine.syncNow()
    expect(A.storage.get('gym-token')).not.toBe(old)
    expect(A.engine.getState().status).toBe('ok')
  })

  it('token inválido → sin sesión, y el outbox se conserva', async () => {
    const A = device()
    await A.engine.login('pw')
    online = true
    await saveTo(A.db, 'sessions', session('s5'))
    A.storage.set('gym-token', 'basura')
    await A.engine.syncNow()
    expect(A.engine.getState()).toMatchObject({ status: 'unauth', loggedIn: false, pending: 1 })
  })

  it('las semillas no se suben y dos dispositivos no duplican ejercicios sembrados', async () => {
    const A = device()
    const B = device()
    for (const d of [A, B]) {
      const plan = planSeed(buildSeedRows(), { exercises: [], workoutTemplates: [], templateExercises: [] })
      await d.db.exercises.bulkPut(plan.insert.exercises)
    }
    await A.engine.login('pw')
    await B.engine.login('pw')
    expect(await pglite.query('select count(*)::int as c from exercises')).toMatchObject({ rows: [{ c: 0 }] })
    expect((await A.db.exercises.filter(alive).toArray()).length).toBe(buildSeedRows().exercises.length)

    // El usuario edita una semilla en A: se sube y B la recibe sin duplicar.
    const ex = (await A.db.exercises.get('seed-ex-prensa-de-piernas'))!
    await saveTo(A.db, 'exercises', { ...ex, notes: 'mi nota' })
    await A.engine.syncNow()
    await B.engine.syncNow()
    expect((await B.db.exercises.get('seed-ex-prensa-de-piernas'))?.notes).toBe('mi nota')
    expect(await B.db.exercises.count()).toBe(buildSeedRows().exercises.length)
  })

  it('start(): un guardado local se sube solo (debounce) sin llamar a syncNow', async () => {
    const g = globalThis as Record<string, unknown>
    g.window = { addEventListener() {}, removeEventListener() {} }
    g.document = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' }
    try {
      const A = device()
      await A.engine.login('pw')
      const stop = A.engine.start()
      await saveTo(A.db, 'sessions', session('s6'))
      await vi.waitFor(
        async () => expect(await pglite.query('select id from sessions')).toMatchObject({ rows: [{ id: 's6' }] }),
        { timeout: 3000 },
      )
      stop()
      const B = device()
      await B.engine.login('pw')
      expect(await B.db.sessions.get('s6')).toBeTruthy()
    } finally {
      delete g.window
      delete g.document
    }
  })
})
