/**
 * Migración a multiusuario (docs/diseno-usuarios-y-auth.md §5), en dos etapas independientes:
 *   1. `schema`: tablas nuevas (aditivo; la API vieja sigue funcionando).
 *   2. `data`: fusión de duplicados, re-clave de ejercicios, reasignación 'owner' → admin y claves compuestas,
 *      TODO en una única transacción. `dryRun` ejecuta lo mismo y hace ROLLBACK (el informe es exacto).
 * La lógica es independiente del driver (Conn): se prueba sobre PGlite y se ejecuta sobre Neon.
 */
import { planMerge, type MergeRows } from '../../src/lib/mergePlan'
import { buildSeedRows } from '../../src/lib/seed'
import { AVAILABILITY_ROWS_FOR_MIGRATION, GYM_SEEDS_FOR_MIGRATION } from './catalogSeed'
import { norm } from '../../src/lib/seedPlan'
import type { Exercise, Session, SetLog, TemplateExercise, WorkoutTemplate } from '../../src/lib/types'

export type Row = Record<string, unknown>
export type Q = (sql: string, params?: unknown[]) => Promise<Row[]>
export interface Conn {
  query: Q
  /** Ejecuta fn dentro de una transacción; si lanza, hace ROLLBACK. */
  transaction<T>(fn: (q: Q) => Promise<T>): Promise<T>
}

export const OLD_OWNER = 'owner'
export const USER_TABLES = ['exercises', 'workout_templates', 'template_exercises', 'sessions', 'set_logs', 'biometrics'] as const

const COMMON = `id text NOT NULL, user_id text NOT NULL, updated_at bigint NOT NULL, deleted_at bigint, synced_at bigint NOT NULL DEFAULT 0`
const CATALOG = `id text PRIMARY KEY, updated_at bigint NOT NULL, deleted_at bigint, synced_at bigint NOT NULL DEFAULT 0`

/** Etapa 1: solo tablas nuevas (equivalentes a db/schema.ts; un test lo comprueba contra el esquema de Drizzle). */
export const SCHEMA_UP: string[] = [
  `CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, email text NOT NULL, password_hash text NOT NULL, display_name text NOT NULL DEFAULT '', role text NOT NULL DEFAULT 'user', disabled boolean NOT NULL DEFAULT false, must_change_password boolean NOT NULL DEFAULT false, token_version integer NOT NULL DEFAULT 0, created_at bigint NOT NULL, last_login_at bigint)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email)`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (id text PRIMARY KEY, user_id text NOT NULL, refresh_hash text NOT NULL, prev_hash text, prev_valid_until bigint, retired_hashes text[] NOT NULL DEFAULT '{}', device_label text NOT NULL DEFAULT '', created_at bigint NOT NULL, last_used_at bigint NOT NULL, expires_at bigint NOT NULL, revoked_at bigint)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_refresh_uq ON auth_sessions (refresh_hash)`,
  `CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS auth_sessions_prev_idx ON auth_sessions (prev_hash)`,
  `CREATE TABLE IF NOT EXISTS invitations (id text PRIMARY KEY, code_hash text NOT NULL, role text NOT NULL DEFAULT 'user', created_by text NOT NULL, created_at bigint NOT NULL, expires_at bigint NOT NULL, used_at bigint, used_by text, revoked_at bigint)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS invitations_code_uq ON invitations (code_hash)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (key text PRIMARY KEY, count integer NOT NULL DEFAULT 0, window_start bigint NOT NULL, locked_until bigint NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS body_weights (${COMMON}, date text NOT NULL, weight_kg real NOT NULL, note text NOT NULL DEFAULT '', CONSTRAINT body_weights_pk PRIMARY KEY (user_id, id))`,
  `CREATE INDEX IF NOT EXISTS body_weights_pull_idx ON body_weights (user_id, synced_at)`,
  `CREATE TABLE IF NOT EXISTS user_prefs (${COMMON}, unit text NOT NULL DEFAULT 'kg', increment_kg real NOT NULL DEFAULT 2.5, gym_id text, CONSTRAINT user_prefs_pk PRIMARY KEY (user_id, id))`,
  `CREATE INDEX IF NOT EXISTS user_prefs_pull_idx ON user_prefs (user_id, synced_at)`,
  `CREATE TABLE IF NOT EXISTS gyms (${CATALOG}, name text NOT NULL, notes text NOT NULL DEFAULT '', sort integer NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS gyms_pull_idx ON gyms (synced_at)`,
  `CREATE TABLE IF NOT EXISTS exercise_gyms (${CATALOG}, exercise_id text NOT NULL, gym_id text NOT NULL, available boolean NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS exercise_gyms_pull_idx ON exercise_gyms (synced_at)`,
  `CREATE INDEX IF NOT EXISTS exercise_gyms_gym_idx ON exercise_gyms (gym_id)`,
]

/** Deshace la etapa 1 (solo es seguro antes de la etapa 2 o con las tablas vacías). */
export const SCHEMA_DOWN: string[] = ['exercise_gyms', 'gyms', 'user_prefs', 'body_weights', 'login_attempts', 'invitations', 'auth_sessions', 'users'].map(
  (t) => `DROP TABLE IF EXISTS ${t}`,
)

// ───────────── Lectura/mapeo de filas (snake_case ⇄ tipos del cliente) ─────────────

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const sync = (r: Row) => ({ id: r.id as string, updatedAt: Number(r.updated_at), deletedAt: n(r.deleted_at) })

const readExercise = (r: Row): Exercise => ({
  ...sync(r), name: r.name as string, primaryMuscle: r.primary_muscle as Exercise['primaryMuscle'],
  secondaryMuscles: (r.secondary_muscles as Exercise['secondaryMuscles']) ?? [], equipment: r.equipment as string, notes: r.notes as string,
})
const readTemplate = (r: Row): WorkoutTemplate => ({ ...sync(r), name: r.name as string })
const readTe = (r: Row): TemplateExercise => ({
  ...sync(r), templateId: r.template_id as string, exerciseId: r.exercise_id as string, position: Number(r.position),
  targetSets: Number(r.target_sets), targetReps: Number(r.target_reps), targetWeightKg: Number(r.target_weight_kg), restS: Number(r.rest_s),
})
const readSession = (r: Row): Session => ({
  ...sync(r), templateId: (r.template_id as string | null) ?? null, startedAt: Number(r.started_at), endedAt: n(r.ended_at), notes: r.notes as string,
})
const readLog = (r: Row): SetLog => ({
  ...sync(r), sessionId: r.session_id as string, exerciseId: r.exercise_id as string, setIndex: Number(r.set_index),
  exerciseOrder: Number(r.exercise_order ?? 0), reps: Number(r.reps), weightKg: Number(r.weight_kg), inputUnit: r.input_unit as SetLog['inputUnit'],
  inputWeight: Number(r.input_weight), effort: (r.effort as SetLog['effort']) ?? null, completedAt: n(r.completed_at),
})

export interface Stmt { sql: string; params: unknown[]; label: string }
export interface Report {
  stage: 'data'
  alreadyMigrated: boolean
  adminId: string
  before: Counts
  after: Counts
  /** Sentencias ejecutadas por tabla. */
  touched: Record<string, number>
  /** Filas distintas modificadas por tabla (las marcadas con updated_at = ahora). */
  rowsTouched: Record<string, number>
  rekeyed: number
  unmatchedExercises: string[]
  statements: number
  warnings: string[]
}
export interface Counts {
  exercisesLive: number; templatesLive: number; templateExercisesLive: number; sessionsLive: number; setLogsLive: number
  danglingSetLogs: number; danglingTemplateExercises: number; danglingSessions: number
}

/** Plan puro: de las filas de 'owner' a las sentencias de datos (sin DDL). */
export function planDataStatements(rows: MergeRows, now: number) {
  const merge = planMerge(rows, now)
  const stmts: Stmt[] = []
  const bump = `updated_at = ${now}, synced_at = ${now}`

  for (const e of merge.exercises) stmts.push({ label: 'exercises', sql: `UPDATE exercises SET deleted_at = $1, ${bump} WHERE id = $2 AND user_id = '${OLD_OWNER}'`, params: [e.deletedAt, e.id] })
  for (const t of merge.workoutTemplates) stmts.push({ label: 'workout_templates', sql: `UPDATE workout_templates SET deleted_at = $1, ${bump} WHERE id = $2 AND user_id = '${OLD_OWNER}'`, params: [t.deletedAt, t.id] })
  for (const t of merge.templateExercises) {
    stmts.push({
      label: 'template_exercises',
      sql: `UPDATE template_exercises SET template_id = $1, exercise_id = $2, position = $3, target_sets = $4, target_reps = $5, target_weight_kg = $6, rest_s = $7, deleted_at = $8, ${bump} WHERE id = $9 AND user_id = '${OLD_OWNER}'`,
      params: [t.templateId, t.exerciseId, t.position, t.targetSets, t.targetReps, t.targetWeightKg, t.restS, t.deletedAt, t.id],
    })
  }
  for (const s of merge.sessions) stmts.push({ label: 'sessions', sql: `UPDATE sessions SET template_id = $1, ${bump} WHERE id = $2 AND user_id = '${OLD_OWNER}'`, params: [s.templateId, s.id] })
  for (const l of merge.setLogs) stmts.push({ label: 'set_logs', sql: `UPDATE set_logs SET exercise_id = $1, ${bump} WHERE id = $2 AND user_id = '${OLD_OWNER}'`, params: [l.exerciseId, l.id] })

  // Estado tras la fusión, para re-clavar los ejercicios vivos a los ids deterministas del catálogo (seed-ex-*).
  const sub = <T extends { id: string }>(list: T[], changed: T[]) => list.map((r) => changed.find((c) => c.id === r.id) ?? r)
  const exercises = sub(rows.exercises, merge.exercises)
  const seedByName = new Map(buildSeedRows().exercises.map((e) => [norm(e.name), e.id]))
  const taken = new Set(exercises.map((e) => e.id))
  const rekey: [string, string][] = []
  const unmatched: string[] = []
  for (const e of exercises.filter((e) => !e.deletedAt)) {
    const seedId = seedByName.get(norm(e.name))
    if (!seedId) unmatched.push(e.name)
    else if (seedId !== e.id && !taken.has(seedId)) {
      rekey.push([e.id, seedId])
      taken.add(seedId)
    }
  }
  for (const [oldId, seedId] of rekey) {
    // Todas las filas (también las borradas) cambian de referencia para no dejar ids huérfanos; el ejercicio, igual.
    stmts.push({ label: 'exercises', sql: `UPDATE exercises SET id = $1, ${bump} WHERE id = $2 AND user_id = '${OLD_OWNER}'`, params: [seedId, oldId] })
    stmts.push({ label: 'set_logs', sql: `UPDATE set_logs SET exercise_id = $1, ${bump} WHERE exercise_id = $2 AND user_id = '${OLD_OWNER}'`, params: [seedId, oldId] })
    stmts.push({ label: 'template_exercises', sql: `UPDATE template_exercises SET exercise_id = $1, ${bump} WHERE exercise_id = $2 AND user_id = '${OLD_OWNER}'`, params: [seedId, oldId] })
  }
  return { stmts, rekeyed: rekey.length, unmatched }
}

async function counts(q: Q, owner: string): Promise<Counts> {
  const one = async (sql: string) => Number(((await q(sql, [owner]))[0] as { c: unknown }).c)
  return {
    exercisesLive: await one(`SELECT count(*) c FROM exercises WHERE user_id = $1 AND deleted_at IS NULL`),
    templatesLive: await one(`SELECT count(*) c FROM workout_templates WHERE user_id = $1 AND deleted_at IS NULL`),
    templateExercisesLive: await one(`SELECT count(*) c FROM template_exercises WHERE user_id = $1 AND deleted_at IS NULL`),
    sessionsLive: await one(`SELECT count(*) c FROM sessions WHERE user_id = $1 AND deleted_at IS NULL`),
    setLogsLive: await one(`SELECT count(*) c FROM set_logs WHERE user_id = $1 AND deleted_at IS NULL`),
    danglingSetLogs: await one(`SELECT count(*) c FROM set_logs l WHERE l.user_id = $1 AND l.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.id = l.exercise_id AND e.user_id = l.user_id AND e.deleted_at IS NULL)`),
    danglingTemplateExercises: await one(`SELECT count(*) c FROM template_exercises t WHERE t.user_id = $1 AND t.deleted_at IS NULL AND (NOT EXISTS (SELECT 1 FROM exercises e WHERE e.id = t.exercise_id AND e.user_id = t.user_id AND e.deleted_at IS NULL) OR NOT EXISTS (SELECT 1 FROM workout_templates w WHERE w.id = t.template_id AND w.user_id = t.user_id AND w.deleted_at IS NULL))`),
    danglingSessions: await one(`SELECT count(*) c FROM sessions s WHERE s.user_id = $1 AND s.deleted_at IS NULL AND s.template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workout_templates w WHERE w.id = s.template_id AND w.user_id = s.user_id AND w.deleted_at IS NULL)`),
  }
}

/**
 * Normaliza un array de Postgres: node-postgres / @neondatabase/serverless NO parsean algunos tipos de array (p. ej. `name[]`, oid 1003)
 * y devuelven el texto '{a,b}'; PGlite sí los parsea. Acepta ambas formas.
 */
export function pgArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string') {
    const inner = v.trim().replace(/^\{/, '').replace(/\}$/, '')
    return inner === '' ? [] : inner.split(',').map((x) => x.replace(/^"(.*)"$/, '$1'))
  }
  return []
}

async function pkColumns(q: Q, table: string): Promise<{ name: string; cols: string[] } | null> {
  const rows = await q(
    `SELECT c.conname AS name, array_agg(a.attname::text ORDER BY k.ord) AS cols
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE c.contype = 'p' AND t.relname = $1 AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
      GROUP BY c.conname`,
    [table],
  )
  return rows[0] ? { name: String(rows[0].name), cols: pgArray(rows[0].cols) } : null
}

export interface DataOptions {
  adminEmail: string
  /** true = ejecuta todo y hace ROLLBACK (informe exacto sin tocar nada). */
  dryRun: boolean
  now?: number
}

/**
 * Etapa 2. Precondiciones: etapa 1 aplicada y cuenta admin creada (bootstrap). Idempotente: si las tablas ya tienen
 * clave compuesta no hace nada. Una única transacción; si cualquier invariante falla, ROLLBACK y error.
 */
export async function runDataMigration(conn: Conn, opts: DataOptions): Promise<Report> {
  const now = opts.now ?? Date.now()
  class DryRun extends Error {}
  let report!: Report
  try {
    await conn.transaction(async (q) => {
      const [admin] = await q(`SELECT id FROM users WHERE email = $1 AND role = 'admin'`, [opts.adminEmail.trim().toLowerCase()])
      if (!admin) throw new Error(`No existe la cuenta admin ${opts.adminEmail}: ejecuta antes el bootstrap del administrador.`)
      const adminId = admin.id as string

      const pk = await pkColumns(q, 'set_logs')
      const alreadyMigrated = !!pk && pk.cols.length === 2
      const empty: Counts = { exercisesLive: 0, templatesLive: 0, templateExercisesLive: 0, sessionsLive: 0, setLogsLive: 0, danglingSetLogs: 0, danglingTemplateExercises: 0, danglingSessions: 0 }
      if (alreadyMigrated) {
        const after = await counts(q, adminId)
        report = { stage: 'data', alreadyMigrated, adminId, before: after, after, touched: {}, rowsTouched: {}, rekeyed: 0, unmatchedExercises: [], statements: 0, warnings: ['Ya migrado: no se hace nada.'] }
        return
      }
      const before = await counts(q, OLD_OWNER)
      const others = await q(`SELECT DISTINCT user_id FROM set_logs WHERE user_id <> $1`, [OLD_OWNER])
      if (others.length) throw new Error(`Hay filas de usuarios distintos de '${OLD_OWNER}' (${others.map((o) => o.user_id).join(', ')}): migración abortada.`)

      const rows: MergeRows = {
        exercises: (await q(`SELECT * FROM exercises WHERE user_id = $1`, [OLD_OWNER])).map(readExercise),
        workoutTemplates: (await q(`SELECT * FROM workout_templates WHERE user_id = $1`, [OLD_OWNER])).map(readTemplate),
        templateExercises: (await q(`SELECT * FROM template_exercises WHERE user_id = $1`, [OLD_OWNER])).map(readTe),
        sessions: (await q(`SELECT * FROM sessions WHERE user_id = $1`, [OLD_OWNER])).map(readSession),
        setLogs: (await q(`SELECT * FROM set_logs WHERE user_id = $1`, [OLD_OWNER])).map(readLog),
      }
      const { stmts, rekeyed, unmatched } = planDataStatements(rows, now)
      const touched: Record<string, number> = {}
      for (const s of stmts) {
        await q(s.sql, s.params)
        touched[s.label] = (touched[s.label] ?? 0) + 1
      }

      // Reasignación de propietario y claves compuestas (DDL transaccional en Postgres).
      for (const t of USER_TABLES) {
        await q(`UPDATE ${t} SET user_id = $1 WHERE user_id = $2`, [adminId, OLD_OWNER])
        const old = await pkColumns(q, t)
        if (old) await q(`ALTER TABLE ${t} DROP CONSTRAINT "${old.name}"`)
        await q(`ALTER TABLE ${t} ADD CONSTRAINT ${t}_pk PRIMARY KEY (user_id, id)`)
        await q(`CREATE INDEX IF NOT EXISTS ${t}_pull_idx ON ${t} (user_id, synced_at)`)
      }

      const rowsTouched: Record<string, number> = {}
      for (const t of USER_TABLES) rowsTouched[t] = Number(((await q(`SELECT count(*) c FROM ${t} WHERE user_id = $1 AND synced_at = $2`, [adminId, now]))[0] as { c: unknown }).c)
      const after = await counts(q, adminId)
      const problems: string[] = []
      if (after.setLogsLive !== before.setLogsLive) problems.push(`series vivas ${before.setLogsLive} → ${after.setLogsLive}`)
      if (after.sessionsLive !== before.sessionsLive) problems.push(`sesiones vivas ${before.sessionsLive} → ${after.sessionsLive}`)
      if (after.danglingSetLogs || after.danglingTemplateExercises || after.danglingSessions) problems.push('referencias colgantes tras la migración')
      if (problems.length) throw new Error(`Invariantes rotos, ROLLBACK: ${problems.join('; ')}`)

      report = {
        stage: 'data', alreadyMigrated, adminId, before: before ?? empty, after, touched, rowsTouched, rekeyed, unmatchedExercises: unmatched,
        statements: stmts.length,
        warnings: unmatched.length ? [`${unmatched.length} ejercicios vivos sin equivalente en el catálogo semilla (se conservan con su id): ${unmatched.join(', ')}`] : [],
      }
      if (opts.dryRun) throw new DryRun()
    })
  } catch (e) {
    if (!(e instanceof DryRun)) throw e
  }
  return report
}

/** Deshace la reasignación y las claves (NO deshace la fusión de duplicados: eso se recupera con la rama/copia de Neon). */
export async function runDataDown(conn: Conn, adminEmail: string): Promise<void> {
  await conn.transaction(async (q) => {
    const [admin] = await q(`SELECT id FROM users WHERE email = $1`, [adminEmail.trim().toLowerCase()])
    if (!admin) throw new Error('Cuenta admin no encontrada')
    for (const t of USER_TABLES) {
      const dup = await q(`SELECT id FROM ${t} GROUP BY id HAVING count(*) > 1 LIMIT 1`)
      if (dup.length) throw new Error(`${t}: hay ids repetidos entre usuarios; no se puede volver a la clave simple`)
      await q(`UPDATE ${t} SET user_id = $1 WHERE user_id = $2`, [OLD_OWNER, admin.id])
      const pk = await pkColumns(q, t)
      if (pk) await q(`ALTER TABLE ${t} DROP CONSTRAINT "${pk.name}"`)
      await q(`ALTER TABLE ${t} ADD CONSTRAINT ${t}_pkey PRIMARY KEY (id)`)
      await q(`DROP INDEX IF EXISTS ${t}_pull_idx`)
    }
  })
}

// ───────────── Etapa 3: catálogo global (F3) ─────────────

export interface CatalogReport {
  stage: 'catalog'
  alreadyMigrated: boolean
  adminId: string
  legacyExercises: { admin: number; adminLive: number; others: number }
  catalogExercisesLive: number
  insertedSeedExercises: number
  insertedGyms: number
  insertedAvailability: number
  danglingSetLogs: number
  danglingTemplateExercises: number
}

const CATALOG_COLUMNS = `id text PRIMARY KEY, updated_at bigint NOT NULL, deleted_at bigint, synced_at bigint NOT NULL DEFAULT 0`

/**
 * Etapa 3. El catálogo pasa a ser global: los ejercicios del admin se copian a una tabla `exercises` sin user_id
 * (mismos ids, así que series y rutinas siguen apuntando bien) y la tabla por usuario se conserva como
 * `exercises_user_legacy` para poder revertir. Se cargan además los ejercicios nuevos del catálogo, los gimnasios y la
 * disponibilidad. Una transacción; `dryRun` hace ROLLBACK. Si hubiera ejercicios de usuarios no admin se aborta (no se pierde
 * nada: hay que decidir qué hacer con ellos).
 */
export async function runCatalogMigration(conn: Conn, opts: { adminEmail: string; dryRun: boolean; now?: number }): Promise<CatalogReport> {
  const now = opts.now ?? Date.now()
  class DryRun extends Error {}
  let report!: CatalogReport
  try {
    await conn.transaction(async (q) => {
      const [admin] = await q(`SELECT id FROM users WHERE email = $1 AND role = 'admin'`, [opts.adminEmail.trim().toLowerCase()])
      if (!admin) throw new Error(`No existe la cuenta admin ${opts.adminEmail}`)
      const adminId = admin.id as string
      const hasUserId =
        (await q(`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'exercises' AND column_name = 'user_id'`)).length > 0
      const none: CatalogReport = {
        stage: 'catalog', alreadyMigrated: !hasUserId, adminId, legacyExercises: { admin: 0, adminLive: 0, others: 0 }, catalogExercisesLive: 0,
        insertedSeedExercises: 0, insertedGyms: 0, insertedAvailability: 0, danglingSetLogs: 0, danglingTemplateExercises: 0,
      }
      const c = async (sql: string, params: unknown[] = []) => Number(((await q(sql, params))[0] as { c: unknown }).c)
      if (!hasUserId) {
        none.catalogExercisesLive = await c(`SELECT count(*) c FROM exercises WHERE deleted_at IS NULL`)
        report = none
        return
      }
      const pk = await pkColumns(q, 'set_logs')
      if (!pk || pk.cols.length !== 2) throw new Error('Aplica antes la etapa `data` (claves compuestas).')
      const legacy = {
        admin: await c(`SELECT count(*) c FROM exercises WHERE user_id = $1`, [adminId]),
        adminLive: await c(`SELECT count(*) c FROM exercises WHERE user_id = $1 AND deleted_at IS NULL`, [adminId]),
        others: await c(`SELECT count(*) c FROM exercises WHERE user_id <> $1`, [adminId]),
      }
      if (legacy.others > 0) throw new Error(`Hay ${legacy.others} ejercicios de usuarios que no son el admin: decide qué hacer con ellos antes de migrar.`)

      await q(`ALTER TABLE exercises RENAME TO exercises_user_legacy`)
      await q(`ALTER TABLE exercises_user_legacy RENAME CONSTRAINT exercises_pk TO exercises_user_legacy_pk`)
      await q(`ALTER INDEX exercises_pull_idx RENAME TO exercises_user_legacy_pull_idx`)
      await q(
        `CREATE TABLE exercises (${CATALOG_COLUMNS}, name text NOT NULL, primary_muscle text NOT NULL, secondary_muscles jsonb NOT NULL DEFAULT '[]', equipment text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '')`,
      )
      await q(`CREATE INDEX exercises_pull_idx ON exercises (synced_at)`)
      // Se copian los ejercicios vivos y los borrados que NO duplican el nombre de uno vivo (un borrado deliberado del admin
      // debe seguir constando para que no se vuelva a sembrar; los duplicados fusionados se quedan solo en la tabla antigua).
      // synced_at = ahora: los dispositivos bajan el catálogo en su próximo pull.
      const legacyRows = await q(`SELECT * FROM exercises_user_legacy WHERE user_id = $1`, [adminId])
      const liveNames = new Set(legacyRows.filter((r) => r.deleted_at === null || r.deleted_at === undefined).map((r) => norm(r.name as string)))
      for (const r of legacyRows) {
        const dead = r.deleted_at !== null && r.deleted_at !== undefined
        if (dead && liveNames.has(norm(r.name as string))) continue
        await q(
          `INSERT INTO exercises (id, updated_at, deleted_at, synced_at, name, primary_muscle, secondary_muscles, equipment, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [r.id, r.updated_at, r.deleted_at ?? null, now, r.name, r.primary_muscle, JSON.stringify(r.secondary_muscles ?? []), r.equipment, r.notes],
        )
      }

      // Ejercicios nuevos del catálogo semilla (añadidos tras la primera importación), sin duplicar por nombre.
      let insertedSeed = 0
      for (const e of buildSeedRows().exercises) {
        if (liveNames.has(norm(e.name))) continue
        if ((await q(`SELECT 1 FROM exercises WHERE id = $1`, [e.id])).length) continue
        await q(
          `INSERT INTO exercises (id, updated_at, deleted_at, synced_at, name, primary_muscle, secondary_muscles, equipment, notes) VALUES ($1, $2, NULL, $2, $3, $4, $5, $6, '')`,
          [e.id, now, e.name, e.primaryMuscle, JSON.stringify(e.secondaryMuscles), e.equipment],
        )
        liveNames.add(norm(e.name))
        insertedSeed++
      }

      let gyms = 0
      for (const g of GYM_SEEDS_FOR_MIGRATION) {
        const r = await q(
          `INSERT INTO gyms (id, updated_at, deleted_at, synced_at, name, notes, sort) VALUES ($1, $2, NULL, $2, $3, '', $4) ON CONFLICT (id) DO NOTHING RETURNING id`,
          [g.id, now, g.name, g.sort],
        )
        gyms += r.length
      }
      let av = 0
      for (const a of AVAILABILITY_ROWS_FOR_MIGRATION) {
        if (!(await q(`SELECT 1 FROM exercises WHERE id = $1`, [a.exerciseId])).length) continue // solo ejercicios que existen en el catálogo
        const r = await q(
          `INSERT INTO exercise_gyms (id, updated_at, deleted_at, synced_at, exercise_id, gym_id, available) VALUES ($1, $2, NULL, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING RETURNING id`,
          [`${a.exerciseId}:${a.gymId}`, now, a.exerciseId, a.gymId, a.available],
        )
        av += r.length
      }

      const dangling = await c(
        `SELECT count(*) c FROM set_logs l WHERE l.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.id = l.exercise_id AND e.deleted_at IS NULL)`,
      )
      const danglingTe = await c(
        `SELECT count(*) c FROM template_exercises t WHERE t.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.id = t.exercise_id AND e.deleted_at IS NULL)`,
      )
      const live = await c(`SELECT count(*) c FROM exercises WHERE deleted_at IS NULL`)
      if (live !== legacy.adminLive + insertedSeed) throw new Error(`Recuento de ejercicios incoherente (${live} ≠ ${legacy.adminLive} + ${insertedSeed}), ROLLBACK`)
      if (dangling || danglingTe) throw new Error(`Referencias colgantes tras migrar el catálogo (series ${dangling}, filas de rutina ${danglingTe}), ROLLBACK`)

      report = {
        ...none, alreadyMigrated: false, legacyExercises: legacy, catalogExercisesLive: live, insertedSeedExercises: insertedSeed,
        insertedGyms: gyms, insertedAvailability: av, danglingSetLogs: dangling, danglingTemplateExercises: danglingTe,
      }
      if (opts.dryRun) throw new DryRun()
    })
  } catch (e) {
    if (!(e instanceof DryRun)) throw e
  }
  return report
}

/** Revierte la etapa 3: recupera la tabla por usuario (los cambios hechos al catálogo después se pierden). */
export async function runCatalogDown(conn: Conn): Promise<void> {
  await conn.transaction(async (q) => {
    if (!(await q(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'exercises_user_legacy'`)).length) {
      throw new Error('No existe exercises_user_legacy: nada que revertir')
    }
    await q(`DROP TABLE exercises`)
    await q(`ALTER TABLE exercises_user_legacy RENAME TO exercises`)
    await q(`ALTER TABLE exercises RENAME CONSTRAINT exercises_user_legacy_pk TO exercises_pk`)
    await q(`ALTER INDEX exercises_user_legacy_pull_idx RENAME TO exercises_pull_idx`)
  })
}

// ───────────── Etapa 4: refresco del catálogo (nombres en inglés y ejercicios nuevos del semilla) ─────────────

export interface SeedExerciseInput { id: string; name: string; nameEn?: string; primaryMuscle: string; secondaryMuscles: string[]; equipment: string }
export interface AvailabilityInput { exerciseId: string; gymId: string; available: boolean }
export interface GymInput { id: string; name: string; sort: number }

export interface RefreshOptions {
  dryRun: boolean
  now?: number
  /** Por defecto, el catálogo semilla actual (src/lib/seed.ts + gymData.ts); se inyecta en los tests. */
  seedExercises?: SeedExerciseInput[]
  availability?: AvailabilityInput[]
  gyms?: GymInput[]
}

export interface RefreshReport {
  stage: 'catalog-refresh'
  addedColumn: boolean
  /** Ejercicios del catálogo a los que se les pone nameEn (estaba vacío y el semilla lo trae). */
  nameEnFilled: number
  /** Ya tenían nameEn (p. ej. editado por el admin): se respetan. */
  nameEnRespected: number
  /** Ejercicios vivos del catálogo que no están en el semilla (creados por el admin): no se tocan. */
  notInSeed: number
  insertedExercises: string[]
  insertedGyms: number
  insertedAvailability: number
  catalogExercisesLive: number
}

/**
 * Etapa 4 (aditiva, idempotente; `dryRun` hace ROLLBACK). Requiere la etapa `catalog` aplicada.
 *  1. Añade la columna `exercises.name_en` (NOT NULL DEFAULT '') si no existe.
 *  2. Rellena `name_en` desde el semilla SOLO donde está vacío (no pisa lo que haya editado el admin) por id seed-*;
 *     no toca `name` ni ningún otro campo.
 *  3. Inserta los ejercicios nuevos del semilla que no existan (por id ni por nombre normalizado entre los vivos).
 *  4. Inserta los gimnasios y las filas de disponibilidad que falten (ON CONFLICT DO NOTHING: las marcas existentes,
 *     editadas o no, no se tocan).
 * Las filas modificadas o nuevas llevan updated_at/synced_at = ahora para que los dispositivos las bajen.
 */
export async function runCatalogRefresh(conn: Conn, opts: RefreshOptions): Promise<RefreshReport> {
  const now = opts.now ?? Date.now()
  const seed = opts.seedExercises ?? buildSeedRows().exercises
  const availability = opts.availability ?? AVAILABILITY_ROWS_FOR_MIGRATION
  const gyms = opts.gyms ?? GYM_SEEDS_FOR_MIGRATION
  class DryRun extends Error {}
  let report!: RefreshReport
  try {
    await conn.transaction(async (q) => {
      const hasUserId = (await q(`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'exercises' AND column_name = 'user_id'`)).length > 0
      const exists = (await q(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'exercises'`)).length > 0
      if (!exists || hasUserId) throw new Error('Aplica antes la etapa `catalog` (el catálogo global todavía no existe).')
      const hasCol = (await q(`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'exercises' AND column_name = 'name_en'`)).length > 0
      if (!hasCol) await q(`ALTER TABLE exercises ADD COLUMN name_en text NOT NULL DEFAULT ''`)

      const rows = await q(`SELECT id, name, name_en, deleted_at FROM exercises`)
      const byId = new Map(rows.map((r) => [r.id as string, r]))
      const liveNames = new Set(rows.filter((r) => r.deleted_at === null || r.deleted_at === undefined).map((r) => norm(r.name as string)))
      const seedIds = new Set(seed.map((e) => e.id))
      const report0: RefreshReport = {
        stage: 'catalog-refresh', addedColumn: !hasCol, nameEnFilled: 0, nameEnRespected: 0, notInSeed: 0, insertedExercises: [],
        insertedGyms: 0, insertedAvailability: 0, catalogExercisesLive: 0,
      }

      for (const e of seed) {
        const cur = byId.get(e.id)
        if (!cur) continue
        const en = (e.nameEn ?? '').trim()
        if (cur.name_en && String(cur.name_en).trim() !== '') report0.nameEnRespected++
        else if (en) {
          await q(`UPDATE exercises SET name_en = $1, updated_at = $2, synced_at = $2 WHERE id = $3`, [en, now, e.id])
          report0.nameEnFilled++
        }
      }
      report0.notInSeed = rows.filter((r) => (r.deleted_at === null || r.deleted_at === undefined) && !seedIds.has(r.id as string)).length

      for (const e of seed) {
        if (byId.has(e.id) || liveNames.has(norm(e.name))) continue
        await q(
          `INSERT INTO exercises (id, updated_at, deleted_at, synced_at, name, name_en, primary_muscle, secondary_muscles, equipment, notes) VALUES ($1, $2, NULL, $2, $3, $4, $5, $6, $7, '')`,
          [e.id, now, e.name, (e.nameEn ?? '').trim(), e.primaryMuscle, JSON.stringify(e.secondaryMuscles), e.equipment],
        )
        liveNames.add(norm(e.name))
        report0.insertedExercises.push(e.id)
      }

      for (const g of gyms) {
        const r = await q(
          `INSERT INTO gyms (id, updated_at, deleted_at, synced_at, name, notes, sort) VALUES ($1, $2, NULL, $2, $3, '', $4) ON CONFLICT (id) DO NOTHING RETURNING id`,
          [g.id, now, g.name, g.sort],
        )
        report0.insertedGyms += r.length
      }
      for (const a of availability) {
        if (!(await q(`SELECT 1 FROM exercises WHERE id = $1`, [a.exerciseId])).length) continue // solo ejercicios que existen en el catálogo
        const r = await q(
          `INSERT INTO exercise_gyms (id, updated_at, deleted_at, synced_at, exercise_id, gym_id, available) VALUES ($1, $2, NULL, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING RETURNING id`,
          [`${a.exerciseId}:${a.gymId}`, now, a.exerciseId, a.gymId, a.available],
        )
        report0.insertedAvailability += r.length
      }
      report0.catalogExercisesLive = Number(((await q(`SELECT count(*) c FROM exercises WHERE deleted_at IS NULL`))[0] as { c: unknown }).c)
      report = report0
      if (opts.dryRun) throw new DryRun()
    })
  } catch (e) {
    if (!(e instanceof DryRun)) throw e
  }
  return report
}

/** Revierte la etapa 4: elimina la columna name_en (los ejercicios y marcas insertados se quedan: son datos válidos). */
export async function runCatalogRefreshDown(conn: Conn): Promise<void> {
  await conn.transaction(async (q) => {
    await q(`ALTER TABLE exercises DROP COLUMN IF EXISTS name_en`)
  })
}

// ───────────── Etapa 5: composición corporal en body_weights (aditiva) ─────────────

/** Columnas nuevas de body_weights (todas nullables). */
export const BODY_COMPOSITION_COLUMNS: readonly [name: string, type: string][] = [
  ['measured_at', 'text'], ['source', 'text'], ['bmi', 'real'], ['body_fat_pct', 'real'], ['muscle_pct', 'real'],
  ['lean_mass_kg', 'real'], ['subcutaneous_fat_pct', 'real'], ['visceral_fat', 'real'], ['body_water_pct', 'real'],
  ['skeletal_muscle_pct', 'real'], ['muscle_mass_kg', 'real'], ['bone_mass_kg', 'real'], ['protein_pct', 'real'],
  ['bmr', 'real'], ['body_age', 'real'],
]

export interface BodyCompositionReport {
  stage: 'body-composition'
  /** Columnas que se añadirían/añadidas (las que no existían). */
  addedColumns: string[]
  alreadyPresent: number
  /** Filas de body_weights (no se modifican: las columnas nuevas quedan en NULL). */
  bodyWeightRows: number
}

/**
 * Etapa 5 (aditiva e idempotente; `dryRun` hace ROLLBACK). Añade a `body_weights` las columnas de composición corporal
 * con ADD COLUMN IF NOT EXISTS. No toca ninguna fila: las existentes quedan con NULL y los clientes antiguos, que no
 * envían estas columnas, no las pisan (el servidor solo escribe las columnas presentes en cada subida).
 */
export async function runBodyComposition(conn: Conn, opts: { dryRun: boolean }): Promise<BodyCompositionReport> {
  class DryRun extends Error {}
  let report!: BodyCompositionReport
  try {
    await conn.transaction(async (q) => {
      if (!(await q(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'body_weights'`)).length) {
        throw new Error('No existe la tabla body_weights: aplica antes la etapa `schema`.')
      }
      const have = new Set((await q(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'body_weights'`)).map((r) => r.column_name as string))
      const added: string[] = []
      for (const [name, type] of BODY_COMPOSITION_COLUMNS) {
        if (have.has(name)) continue
        await q(`ALTER TABLE body_weights ADD COLUMN IF NOT EXISTS ${name} ${type}`)
        added.push(name)
      }
      report = {
        stage: 'body-composition', addedColumns: added, alreadyPresent: BODY_COMPOSITION_COLUMNS.length - added.length,
        bodyWeightRows: Number(((await q(`SELECT count(*) c FROM body_weights`))[0] as { c: unknown }).c),
      }
      if (opts.dryRun) throw new DryRun()
    })
  } catch (e) {
    if (!(e instanceof DryRun)) throw e
  }
  return report
}

/** Revierte la etapa 5: elimina las columnas (se pierde la composición corporal importada; el peso y la nota se conservan). */
export async function runBodyCompositionDown(conn: Conn): Promise<void> {
  await conn.transaction(async (q) => {
    for (const [name] of BODY_COMPOSITION_COLUMNS) await q(`ALTER TABLE body_weights DROP COLUMN IF EXISTS ${name}`)
  })
}
