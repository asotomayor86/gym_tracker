// @vitest-environment node
/** Etapa 4 de la migración: nombres en inglés + ejercicios, gimnasios y disponibilidad nuevos del catálogo semilla. */
import type { PGlite } from '@electric-sql/pglite'
import { describe, expect, it, vi } from 'vitest'
import { type Conn, type Q, type Row, runCatalogRefresh, runCatalogRefreshDown } from '../../scripts/migration/multiuser'
import { makeTestDb } from './testServer'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const connOf = (p: PGlite): Conn => {
  const wrap = (x: { query: PGlite['query'] }): Q => async (sql, params) => (await x.query(sql, params as never)).rows as Row[]
  return { query: wrap(p), transaction: (fn) => p.transaction(async (tx) => fn(wrap(tx))) }
}
/** Imita node-postgres/Neon: arrays y bigint llegan como texto. */
const textConn = (c: Conn): Conn => {
  const flat = (rows: Row[]): Row[] => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Array.isArray(v) && v.every((x) => typeof x === 'string') ? `{${v.join(',')}}` : typeof v === 'number' || typeof v === 'bigint' ? String(v) : v])))
  const wrap = (q: Q): Q => async (sql, params) => flat(await q(sql, params))
  return { query: wrap(c.query), transaction: (fn) => c.transaction((q) => fn(wrap(q))) }
}

const SEED = [
  { id: 'seed-ex-prensa', name: 'Prensa de piernas', nameEn: 'Leg Press', primaryMuscle: 'cuadriceps', secondaryMuscles: ['gluteo'], equipment: 'Máquina' },
  { id: 'seed-ex-curl', name: 'Curl de bíceps', nameEn: 'Biceps Curl', primaryMuscle: 'biceps', secondaryMuscles: [], equipment: 'Máquina' },
  { id: 'seed-ex-remo', name: 'Remo alto en máquina', nameEn: 'High Row', primaryMuscle: 'espalda', secondaryMuscles: ['biceps'], equipment: 'Máquina' }, // nuevo
]
const GYMS = [{ id: 'gym-forus', name: 'Forus', sort: 0 }]
const AV = [
  { exerciseId: 'seed-ex-prensa', gymId: 'gym-forus', available: true },
  { exerciseId: 'seed-ex-curl', gymId: 'gym-forus', available: false },
  { exerciseId: 'seed-ex-remo', gymId: 'gym-forus', available: true },
  { exerciseId: 'no-existe', gymId: 'gym-forus', available: true }, // sin ejercicio en el catálogo: se omite
]

/** Catálogo tal como está en producción tras la etapa 3: sin la columna name_en. */
async function setup() {
  const { pglite: p } = await makeTestDb()
  await p.exec('ALTER TABLE exercises DROP COLUMN name_en')
  const ins = (id: string, name: string, deleted: number | null = null) =>
    p.query(`INSERT INTO exercises (id, updated_at, deleted_at, synced_at, name, primary_muscle, secondary_muscles, equipment, notes) VALUES ($1, 100, $2, 100, $3, 'pecho', '[]', 'Máquina', '')`, [id, deleted, name])
  await ins('seed-ex-prensa', 'Prensa de piernas')
  await ins('seed-ex-curl', 'Curl de bíceps')
  await ins('creado-por-admin', 'Ejercicio propio')
  await ins('borrado', 'Ejercicio borrado', 50)
  await p.query(`INSERT INTO gyms (id, updated_at, synced_at, name, notes, sort) VALUES ('gym-forus', 100, 100, 'Forus', '', 0)`)
  await p.query(`INSERT INTO exercise_gyms (id, updated_at, synced_at, exercise_id, gym_id, available) VALUES ('seed-ex-prensa:gym-forus', 100, 100, 'seed-ex-prensa', 'gym-forus', false)`) // el admin la dejó en "no"
  return { p, conn: connOf(p) }
}
const opts = { seedExercises: SEED, availability: AV, gyms: GYMS }
const one = async <T = Row>(p: PGlite, sql: string) => (await p.query<T>(sql)).rows

describe('etapa catalog-refresh', () => {
  it('en seco informa exactamente y no toca nada (ni siquiera la columna); al aplicar rellena nameEn e inserta lo nuevo', async () => {
    const { p, conn } = await setup()
    const dry = await runCatalogRefresh(conn, { ...opts, dryRun: true, now: 500 })
    expect(await one(p, `SELECT 1 FROM information_schema.columns WHERE table_name = 'exercises' AND column_name = 'name_en'`)).toEqual([])
    expect(await one(p, `SELECT id FROM exercises WHERE id = 'seed-ex-remo'`)).toEqual([])
    expect(dry).toMatchObject({
      addedColumn: true, nameEnFilled: 2, nameEnRespected: 0, notInSeed: 1, insertedExercises: ['seed-ex-remo'], insertedGyms: 0, insertedAvailability: 2, catalogExercisesLive: 4,
    })

    const done = await runCatalogRefresh(conn, { ...opts, dryRun: false, now: 500 })
    expect(done).toEqual(dry)
    expect(await one(p, `SELECT id, name_en FROM exercises ORDER BY id`)).toEqual([
      { id: 'borrado', name_en: '' }, { id: 'creado-por-admin', name_en: '' }, { id: 'seed-ex-curl', name_en: 'Biceps Curl' },
      { id: 'seed-ex-prensa', name_en: 'Leg Press' }, { id: 'seed-ex-remo', name_en: 'High Row' },
    ])
    // Lo modificado y lo nuevo lleva updated_at/synced_at de ahora (los dispositivos lo bajan); lo demás no cambia.
    expect(await one(p, `SELECT id FROM exercises WHERE synced_at = 500 ORDER BY id`)).toEqual([{ id: 'seed-ex-curl' }, { id: 'seed-ex-prensa' }, { id: 'seed-ex-remo' }])
    expect(await one(p, `SELECT name FROM exercises WHERE id = 'seed-ex-prensa'`)).toEqual([{ name: 'Prensa de piernas' }]) // el nombre español no se toca
  })

  it('no pisa lo que el admin editó (nameEn, nombre, disponibilidad) y es idempotente', async () => {
    const { p, conn } = await setup()
    await runCatalogRefresh(conn, { ...opts, dryRun: false, now: 500 })
    await p.query(`UPDATE exercises SET name_en = 'My Leg Press', name = 'Prensa 45°', updated_at = 600, synced_at = 600 WHERE id = 'seed-ex-prensa'`)
    await p.query(`UPDATE exercise_gyms SET available = true, updated_at = 600, synced_at = 600 WHERE id = 'seed-ex-prensa:gym-forus'`)
    await p.query(`UPDATE exercises SET name_en = '', updated_at = 600, synced_at = 600 WHERE id = 'seed-ex-curl'`) // el admin lo vació a propósito... se vuelve a rellenar: vacío = sin editar
    const again = await runCatalogRefresh(conn, { ...opts, dryRun: false, now: 900 })
    expect(again).toMatchObject({ addedColumn: false, nameEnFilled: 1, nameEnRespected: 2, insertedExercises: [], insertedGyms: 0, insertedAvailability: 0 })
    expect(await one(p, `SELECT name, name_en FROM exercises WHERE id = 'seed-ex-prensa'`)).toEqual([{ name: 'Prensa 45°', name_en: 'My Leg Press' }])
    expect(await one(p, `SELECT available FROM exercise_gyms WHERE id = 'seed-ex-prensa:gym-forus'`)).toEqual([{ available: true }]) // la marca del admin no se revierte
    // Una tercera pasada ya no cambia nada.
    const third = await runCatalogRefresh(conn, { ...opts, dryRun: false, now: 1200 })
    expect(third).toMatchObject({ nameEnFilled: 0, insertedExercises: [], insertedAvailability: 0 })
    expect(await one(p, `SELECT count(*)::int c FROM exercises WHERE synced_at = 1200`)).toEqual([{ c: 0 }])
  })

  it('no inserta un ejercicio del semilla si ya existe vivo con el mismo nombre (otro id) ni resucita borrados por id', async () => {
    const { p, conn } = await setup()
    await p.query(`INSERT INTO exercises (id, updated_at, synced_at, name, primary_muscle) VALUES ('otro-id', 100, 100, 'remo ALTO en máquina', 'espalda')`)
    const r = await runCatalogRefresh(conn, { ...opts, dryRun: false, now: 500 })
    expect(r.insertedExercises).toEqual([])
    expect(await one(p, `SELECT id FROM exercises WHERE id = 'seed-ex-remo'`)).toEqual([])
  })

  it('funciona con el comportamiento de node-postgres (arrays y bigint como texto) y con down', async () => {
    const { p, conn } = await setup()
    const r = await runCatalogRefresh(textConn(conn), { ...opts, dryRun: false, now: 500 })
    expect(r).toMatchObject({ nameEnFilled: 2, catalogExercisesLive: 4 })
    await runCatalogRefreshDown(conn)
    expect(await one(p, `SELECT 1 FROM information_schema.columns WHERE table_name = 'exercises' AND column_name = 'name_en'`)).toEqual([])
    expect(await one(p, `SELECT id FROM exercises WHERE id = 'seed-ex-remo'`)).toEqual([{ id: 'seed-ex-remo' }]) // lo insertado se queda
    const again = await runCatalogRefresh(conn, { ...opts, dryRun: false, now: 800 }) // se puede volver a aplicar
    expect(again.addedColumn).toBe(true)
  })

  it('aborta si el catálogo global todavía no existe (exercises con user_id)', async () => {
    const { p, conn } = await setup()
    await p.exec('ALTER TABLE exercises ADD COLUMN user_id text')
    await expect(runCatalogRefresh(conn, { ...opts, dryRun: false })).rejects.toThrow(/catalog/)
  })
})
