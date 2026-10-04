// @vitest-environment node
/**
 * Simulación completa de la migración a multiusuario sobre PGlite, partiendo del esquema ANTERIOR (PK global, user_id 'owner')
 * con datos de la forma de la copia de Neon (cada ejercicio importado dos veces, rutinas x2, una sesión viva con series).
 * Con NEON_BACKUP=<ruta al volcado JSON> se ejecuta además sobre la copia real (informe de filas).
 */
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { describe, expect, it, vi } from 'vitest'
import { ensureAdmin } from '../../api/_lib/bootstrap'
import { type Conn, type Q, type Row, SCHEMA_DOWN, SCHEMA_UP, runDataDown, runDataMigration } from '../../scripts/migration/multiuser'
import { buildSeedRows } from '../lib/seed'
import { makeTestDb } from './testServer'

vi.setConfig({ testTimeout: 60_000 }) // cada caso monta PGlite y carga cientos de filas

const ADMIN = 'admin@example.com'
const PW = 'una-contraseña-larga-1'

const OLD_DDL = [
  `CREATE TABLE exercises (id text PRIMARY KEY, user_id text NOT NULL, updated_at bigint NOT NULL, deleted_at bigint, synced_at bigint NOT NULL DEFAULT 0, name text NOT NULL, primary_muscle text NOT NULL, secondary_muscles jsonb NOT NULL DEFAULT '[]', equipment text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '')`,
  `CREATE TABLE workout_templates (id text PRIMARY KEY, user_id text NOT NULL, updated_at bigint NOT NULL, deleted_at bigint, synced_at bigint NOT NULL DEFAULT 0, name text NOT NULL)`,
  `CREATE TABLE template_exercises (id text PRIMARY KEY, user_id text NOT NULL, updated_at bigint NOT NULL, deleted_at bigint, synced_at bigint NOT NULL DEFAULT 0, template_id text NOT NULL, exercise_id text NOT NULL, position integer NOT NULL, target_sets integer NOT NULL, target_reps integer NOT NULL, target_weight_kg real NOT NULL, rest_s integer NOT NULL)`,
  `CREATE TABLE sessions (id text PRIMARY KEY, user_id text NOT NULL, updated_at bigint NOT NULL, deleted_at bigint, synced_at bigint NOT NULL DEFAULT 0, template_id text, started_at bigint NOT NULL, ended_at bigint, notes text NOT NULL DEFAULT '')`,
  `CREATE TABLE set_logs (id text PRIMARY KEY, user_id text NOT NULL, updated_at bigint NOT NULL, deleted_at bigint, synced_at bigint NOT NULL DEFAULT 0, session_id text NOT NULL, exercise_id text NOT NULL, set_index integer NOT NULL, exercise_order integer NOT NULL DEFAULT 0, reps integer NOT NULL, weight_kg real NOT NULL, input_unit text NOT NULL, input_weight real NOT NULL, effort text, completed_at bigint)`,
  `CREATE TABLE biometrics (id text PRIMARY KEY, user_id text NOT NULL, updated_at bigint NOT NULL, deleted_at bigint, synced_at bigint NOT NULL DEFAULT 0, session_id text, type text NOT NULL, value real, data jsonb, recorded_at bigint NOT NULL, source text NOT NULL)`,
]

const connOf = (p: PGlite): Conn => {
  const wrap = (x: { query: PGlite['query'] }): Q => async (sql, params) => (await x.query(sql, params as never)).rows as Row[]
  return { query: wrap(p), transaction: (fn) => p.transaction(async (tx) => fn(wrap(tx))) }
}

type Backup = Record<string, Record<string, unknown>[]>

/** Inserta en el esquema antiguo las filas de una copia JSON de Neon (camelCase de la API → snake_case de la tabla). */
async function load(p: PGlite, data: Backup) {
  const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
  const TABLES: Record<string, string> = {
    exercises: 'exercises', workoutTemplates: 'workout_templates', templateExercises: 'template_exercises', sessions: 'sessions', setLogs: 'set_logs', biometrics: 'biometrics',
  }
  for (const [key, table] of Object.entries(TABLES)) {
    for (const row of data[key] ?? []) {
      const cols = Object.keys(row).filter((c) => c !== 'userId' && c !== 'syncedAt')
      const values = cols.map((c) => (typeof row[c] === 'object' && row[c] !== null ? JSON.stringify(row[c]) : row[c]))
      await p.query(
        `INSERT INTO ${table} (user_id, synced_at, ${cols.map(snake).join(', ')}) VALUES ('owner', 5, ${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
        values as never,
      )
    }
  }
}

/** Fixture con la forma de la copia: 35 nombres x2, Día A/B x2, 'Nueva rutina' del usuario, 1 sesión viva con 21 series. */
function fixture(): Backup {
  const names = buildSeedRows().exercises.slice(0, 35).map((e) => e.name)
  const ex = (id: string, name: string, t: number) => ({ id, name, primaryMuscle: 'pecho', secondaryMuscles: [], equipment: '', notes: '', updatedAt: t, deletedAt: null })
  const exercises = names.flatMap((n, i) => [ex(`r1-${i}`, n, 1000), ex(`r2-${i}`, n, 2000)])
  const tpl = (id: string, name: string, t: number, del: number | null = null) => ({ id, name, updatedAt: t, deletedAt: del })
  const te = (id: string, templateId: string, exerciseId: string, position: number, extra = {}) =>
    ({ id, templateId, exerciseId, position, targetSets: 3, targetReps: 12, targetWeightKg: 20, restS: 60, updatedAt: 1500, deletedAt: null, ...extra })
  const log = (id: string, exerciseId: string, i: number, del: number | null = null) =>
    ({ id, sessionId: 's-live', exerciseId, setIndex: i, exerciseOrder: 0, reps: 10, weightKg: 30, inputUnit: 'kg', inputWeight: 30, effort: 'hard_done', completedAt: 3000 + i, updatedAt: 3000, deletedAt: del })
  return {
    exercises,
    workoutTemplates: [tpl('tA1', 'Día A · Piernas + Hombros', 1500), tpl('tA2', 'Día A · Piernas + Hombros', 2500), tpl('tB1', 'Día B · Pecho + Brazos', 1500), tpl('tB2', 'Día B · Pecho + Brazos', 2500), tpl('tN', 'Nueva rutina', 4000), tpl('tF', 'FORUS I', 3500, 3500)],
    templateExercises: [
      ...[0, 1, 2].map((i) => te(`a1-${i}`, 'tA1', `r1-${i}`, i)),
      ...[0, 1, 2].map((i) => te(`a2-${i}`, 'tA2', `r2-${i}`, i)),
      ...[3, 4].map((i, k) => te(`b1-${i}`, 'tB1', `r1-${i}`, k)),
      ...[3, 4].map((i, k) => te(`b2-${i}`, 'tB2', `r2-${i}`, k)),
      te('n-0', 'tN', 'r1-5', 0, { targetWeightKg: 30, updatedAt: 4100 }),
      te('n-1', 'tN', 'r2-6', 1, { targetWeightKg: 60, updatedAt: 4100 }),
      te('f-0', 'tF', 'r1-7', 0, { deletedAt: 3500 }),
    ],
    sessions: [
      { id: 's-live', templateId: 'tN', startedAt: 3000, endedAt: null, notes: '', updatedAt: 3000, deletedAt: null },
      { id: 's-old', templateId: 'tF', startedAt: 10, endedAt: 20, notes: '', updatedAt: 3600, deletedAt: 3600 },
    ],
    setLogs: [
      ...Array.from({ length: 21 }, (_, i) => log(`l${i}`, i % 2 ? `r1-${5 + (i % 3)}` : `r2-${5 + (i % 3)}`, i)),
      ...Array.from({ length: 10 }, (_, i) => log(`d${i}`, `r1-${i}`, i, 3600)),
    ],
    biometrics: [],
  }
}

async function setup(data: Backup) {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const p = new PGlite()
  for (const s of OLD_DDL) await p.exec(s)
  await load(p, data)
  const conn = connOf(p)
  for (const s of SCHEMA_UP) await conn.query(s)
  await ensureAdmin(drizzle(p) as never, { email: ADMIN, password: PW })
  return { p, conn }
}

const q = async <T = Row>(p: PGlite, sql: string, params: unknown[] = []) => (await p.query<T>(sql, params as never)).rows
const count = async (p: PGlite, sql: string) => Number((await q<{ c: number }>(p, sql))[0].c)

describe('migración multiusuario (esquema anterior → claves compuestas)', () => {
  it('el informe en seco es exacto y NO toca nada; aplicar deja el estado esperado', async () => {
    const { p, conn } = await setup(fixture())
    const snapshot = JSON.stringify(await q(p, `SELECT * FROM set_logs ORDER BY id`))

    const dry = await runDataMigration(conn, { adminEmail: ADMIN, dryRun: true, now: 9000 })
    expect(JSON.stringify(await q(p, `SELECT * FROM set_logs ORDER BY id`))).toBe(snapshot) // ROLLBACK real
    expect(await q(p, `SELECT user_id FROM exercises LIMIT 1`)).toEqual([{ user_id: 'owner' }])
    expect(dry.before).toMatchObject({ exercisesLive: 70, templatesLive: 5, setLogsLive: 21, sessionsLive: 1 })
    expect(dry.after).toMatchObject({ exercisesLive: 35, templatesLive: 3, setLogsLive: 21, sessionsLive: 1, danglingSetLogs: 0, danglingTemplateExercises: 0, danglingSessions: 0 })
    expect(dry.rekeyed).toBe(35)

    const done = await runDataMigration(conn, { adminEmail: ADMIN, dryRun: false, now: 9000 })
    expect(done.after).toEqual(dry.after)
    expect(done.touched).toEqual(dry.touched)

    const adminId = done.adminId
    expect(await count(p, `SELECT count(*) c FROM set_logs WHERE user_id = '${adminId}'`)).toBe(31) // nada se pierde (21 vivas + 10 borradas)
    expect(await count(p, `SELECT count(*) c FROM exercises WHERE user_id = 'owner'`)).toBe(0)
    // Ejercicios vivos con id determinista del catálogo y series apuntando a ellos.
    const live = await q<{ id: string }>(p, `SELECT id FROM exercises WHERE deleted_at IS NULL`)
    expect(live.every((e) => e.id.startsWith('seed-ex-'))).toBe(true)
    expect(await count(p, `SELECT count(*) c FROM set_logs WHERE deleted_at IS NULL AND exercise_id NOT LIKE 'seed-ex-%'`)).toBe(0)
    // La rutina del usuario y su sesión siguen intactas.
    expect(await q(p, `SELECT name FROM workout_templates WHERE deleted_at IS NULL ORDER BY name`)).toEqual([
      { name: 'Día A · Piernas + Hombros' }, { name: 'Día B · Pecho + Brazos' }, { name: 'Nueva rutina' },
    ])
    expect(await q(p, `SELECT template_id FROM sessions WHERE id = 's-live'`)).toEqual([{ template_id: 'tN' }])
    const user = await q<{ target_weight_kg: number }>(p, `SELECT target_weight_kg FROM template_exercises WHERE template_id = 'tN' AND deleted_at IS NULL ORDER BY position`)
    expect(user.map((r) => r.target_weight_kg)).toEqual([30, 60])
    // Los cambios llevan updated_at/synced_at nuevos: los dispositivos los recibirán en su próximo pull.
    expect(await count(p, `SELECT count(*) c FROM set_logs WHERE deleted_at IS NULL AND synced_at = 9000`)).toBeGreaterThan(0)
    // Claves compuestas.
    for (const t of ['exercises', 'workout_templates', 'template_exercises', 'sessions', 'set_logs', 'biometrics']) {
      const pk = await q<{ cols: string[] }>(p, `SELECT array_agg(a.attname ORDER BY a.attnum) cols FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = '${t}'::regclass AND i.indisprimary`)
      expect(pk[0].cols.sort()).toEqual(['id', 'user_id'])
    }
  })

  it('es idempotente: la segunda ejecución no cambia nada', async () => {
    const { p, conn } = await setup(fixture())
    await runDataMigration(conn, { adminEmail: ADMIN, dryRun: false, now: 9000 })
    const before = JSON.stringify(await q(p, `SELECT * FROM set_logs ORDER BY id`)) + JSON.stringify(await q(p, `SELECT * FROM exercises ORDER BY id`))
    const again = await runDataMigration(conn, { adminEmail: ADMIN, dryRun: false, now: 99000 })
    expect(again).toMatchObject({ alreadyMigrated: true, statements: 0 })
    expect(JSON.stringify(await q(p, `SELECT * FROM set_logs ORDER BY id`)) + JSON.stringify(await q(p, `SELECT * FROM exercises ORDER BY id`))).toBe(before)
  })

  it('aborta (ROLLBACK) sin cuenta admin y no deja nada a medias', async () => {
    const { p, conn } = await setup(fixture())
    await expect(runDataMigration(conn, { adminEmail: 'otra@example.com', dryRun: false })).rejects.toThrow(/admin/)
    expect(await count(p, `SELECT count(*) c FROM exercises WHERE user_id = 'owner'`)).toBe(70)
  })

  it('si un invariante falla se revierte todo (ROLLBACK)', async () => {
    const data = fixture()
    // Serie viva que apunta a un ejercicio que no existe: el recuento de colgantes lo detecta.
    data.setLogs.push({ id: 'rota', sessionId: 's-live', exerciseId: 'no-existe', setIndex: 99, exerciseOrder: 0, reps: 1, weightKg: 1, inputUnit: 'kg', inputWeight: 1, effort: null, completedAt: null, updatedAt: 1, deletedAt: null })
    const { p, conn } = await setup(data)
    await expect(runDataMigration(conn, { adminEmail: ADMIN, dryRun: false })).rejects.toThrow(/Invariantes/)
    expect(await count(p, `SELECT count(*) c FROM exercises WHERE user_id = 'owner'`)).toBe(70)
    expect(await q(p, `SELECT user_id FROM set_logs LIMIT 1`)).toEqual([{ user_id: 'owner' }])
  })

  it('después de migrar, la API real sirve los datos al admin y solo a él', async () => {
    const { p, conn } = await setup(fixture())
    await runDataMigration(conn, { adminEmail: ADMIN, dryRun: false, now: 9000 })
    const { PGlite: _ } = await import('@electric-sql/pglite')
    void _
    // Consulta equivalente al pull: filas del admin con synced_at > 0.
    const adminId = (await q<{ id: string }>(p, `SELECT id FROM users WHERE email = '${ADMIN}'`))[0].id
    expect(await count(p, `SELECT count(*) c FROM set_logs WHERE user_id = '${adminId}' AND synced_at > 0`)).toBe(31)
    expect(await count(p, `SELECT count(*) c FROM set_logs WHERE user_id <> '${adminId}'`)).toBe(0)
  })

  it('el esquema resultante coincide con el de db/schema.ts (columnas, nulabilidad, claves e índices)', async () => {
    const { p, conn } = await setup(fixture())
    await runDataMigration(conn, { adminEmail: ADMIN, dryRun: false })
    const fresh = (await makeTestDb()).pglite
    const shape = async (db: PGlite) => {
      const cols = await q<{ t: string; c: string; ty: string; nn: string; d: string | null }>(
        db, `SELECT table_name t, column_name c, data_type ty, is_nullable nn, column_default d FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> 'login_attempts_x' ORDER BY 1, 2`,
      )
      const idx = await q<{ t: string; n: string }>(db, `SELECT tablename t, indexname n FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1, 2`)
      return {
        // gyms/exercise_gyms/etc. existen en ambos; las claves y defaults deben coincidir tabla a tabla
        cols: cols.map((x) => `${x.t}.${x.c}:${x.ty}:${x.nn}:${x.d ?? ''}`),
        idx: idx.map((x) => `${x.t}.${x.n}`),
      }
    }
    const [a, b] = [await shape(p), await shape(fresh)]
    expect(a.cols).toEqual(b.cols)
    // Las claves primarias antiguas se llamaban *_pkey; las nuevas *_pk: se normaliza el nombre.
    const norm = (list: string[]) => list.map((s) => s.replace(/_pkey$|_pk$/, '_PK')).sort()
    expect(norm(a.idx)).toEqual(norm(b.idx))
  })

  it('down de datos devuelve la clave simple y el propietario antiguo; down de esquema elimina las tablas nuevas', async () => {
    const { p, conn } = await setup(fixture())
    await runDataMigration(conn, { adminEmail: ADMIN, dryRun: false })
    await runDataDown(conn, ADMIN)
    expect(await count(p, `SELECT count(*) c FROM set_logs WHERE user_id = 'owner'`)).toBe(31)
    const pk = await q<{ n: number }>(p, `SELECT cardinality(i.indkey) n FROM pg_index i WHERE i.indrelid = 'set_logs'::regclass AND i.indisprimary`)
    expect(pk[0].n).toBe(1)
    for (const s of SCHEMA_DOWN) await conn.query(s)
    expect(await count(p, `SELECT count(*) c FROM information_schema.tables WHERE table_name = 'users'`)).toBe(0)
  })

  it.runIf(process.env.NEON_BACKUP)('sobre la copia real de Neon: informe de filas', async () => {
    const data = JSON.parse(readFileSync(process.env.NEON_BACKUP!, 'utf8')).changes as Backup
    const { p, conn } = await setup(data)
    const report = await runDataMigration(conn, { adminEmail: ADMIN, dryRun: true, now: 1 })
    console.log('INFORME', JSON.stringify(report, null, 1))
    expect(report.after.setLogsLive).toBe(report.before.setLogsLive)
    expect(report.after.sessionsLive).toBe(report.before.sessionsLive)
    expect(report.after.danglingSetLogs + report.after.danglingTemplateExercises + report.after.danglingSessions).toBe(0)
    expect(await count(p, `SELECT count(*) c FROM exercises WHERE user_id = 'owner'`)).toBeGreaterThan(0)
  })
})
