// @vitest-environment node
/** Composición corporal: etapa de migración aditiva y sincronización (datos SINTÉTICOS). */
import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../../api/_lib/authService'
import { ensureAdmin } from '../../api/_lib/bootstrap'
import { type Conn, type Q, type Row, BODY_COMPOSITION_COLUMNS, runBodyComposition, runBodyCompositionDown } from '../../scripts/migration/multiuser'
import { callApi, makeTestDb, type TestDb } from './testServer'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const holder = vi.hoisted(() => ({ t: undefined as undefined | TestDb }))
vi.mock('../../api/_lib/db', async () => {
  const { makeTestDb } = await import('./testServer')
  holder.t = await makeTestDb()
  return { db: holder.t.db }
})

const PW = 'una-contraseña-larga-1'
const ADMIN = 'admin@example.com'
let token = ''
let ip = 0

const row = (date: string, p: object = {}) => ({ id: `bw-${date}`, date, weightKg: 80, note: '', updatedAt: 100, deletedAt: null, ...p })
const push = (rows: object[]) => callApi('POST', '/api/sync/push', { token, body: { changes: { bodyWeights: rows } } })
const pull = async () => (await callApi('GET', '/api/sync/pull?since=0', { token })).body.changes.bodyWeights as Record<string, unknown>[]

beforeAll(async () => {
  await import('../../api/_lib/db')
  await callApi('GET', '/api/auth/invite')
})
beforeEach(async () => {
  await holder.t!.pglite.exec('TRUNCATE users, auth_sessions, invitations, login_attempts, body_weights')
  await ensureAdmin(holder.t!.db as Db, { email: ADMIN, password: PW })
  token = (await callApi('POST', '/api/auth/login', { body: { email: ADMIN, password: PW }, ip: `70.0.0.${ip++ % 200}` })).body.accessToken
})

describe('sync de la composición corporal', () => {
  it('guarda y devuelve los 13 indicadores opcionales en la fila del día', async () => {
    const full = row('2026-10-04', { measuredAt: '14:26', source: 'fitdays', bmi: 24.5, bodyFatPct: 20, musclePct: 60, leanMassKg: 64, subcutaneousFatPct: 16, visceralFat: 8, bodyWaterPct: 55, skeletalMusclePct: 45, muscleMassKg: 60, boneMassKg: 3.2, proteinPct: 17, bmr: 1700, bodyAge: 35 })
    expect((await push([full])).body.applied).toBe(1)
    expect((await pull())[0]).toMatchObject({ id: 'bw-2026-10-04', weightKg: 80, measuredAt: '14:26', source: 'fitdays', bmi: 24.5, bmr: 1700, bodyAge: 35 })
  })

  it('un cliente antiguo (sin esas columnas) que edita el peso NO borra la composición', async () => {
    await push([row('2026-10-04', { bodyFatPct: 20, bmr: 1700, measuredAt: '14:26' })])
    await push([row('2026-10-04', { weightKg: 79, updatedAt: 200 })]) // el cliente viejo no envía los campos nuevos
    expect((await pull())[0]).toMatchObject({ weightKg: 79, bodyFatPct: 20, bmr: 1700, measuredAt: '14:26' })
  })

  it('null explícito quita un indicador (modo "sustituir") y una subida más antigua no pisa', async () => {
    await push([row('2026-10-04', { bodyFatPct: 20, bmr: 1700 })])
    await push([row('2026-10-04', { updatedAt: 200, bodyFatPct: 21, bmr: null })])
    expect((await pull())[0]).toMatchObject({ bodyFatPct: 21, bmr: null })
    await push([row('2026-10-04', { updatedAt: 150, bodyFatPct: 30 })])
    expect((await pull())[0].bodyFatPct).toBe(21)
  })

  it('las filas anteriores (sin composición) se leen con valores null y los datos son por usuario', async () => {
    await push([row('2026-10-01')])
    expect((await pull())[0]).toMatchObject({ bmi: null, bodyFatPct: null, measuredAt: null })
    const inv = (await callApi('POST', '/api/admin/invitations', { token, body: {} })).body
    const other = (await callApi('POST', '/api/auth/register', { body: { code: inv.code, email: 'u@example.com', password: PW }, ip: `71.0.0.${ip++ % 200}` })).body.accessToken
    expect((await callApi('GET', '/api/sync/pull?since=0', { token: other })).body.changes.bodyWeights).toEqual([])
  })
})

const connOf = (p: PGlite): Conn => {
  const wrap = (x: { query: PGlite['query'] }): Q => async (sql, params) => (await x.query(sql, params as never)).rows as Row[]
  return { query: wrap(p), transaction: (fn) => p.transaction(async (tx) => fn(wrap(tx))) }
}

describe('etapa body-composition (migración)', () => {
  /** body_weights como está hoy en producción: sin las columnas de composición. */
  async function oldTable() {
    const { pglite: p } = await makeTestDb()
    for (const [name] of BODY_COMPOSITION_COLUMNS) await p.exec(`ALTER TABLE body_weights DROP COLUMN ${name}`)
    await p.query(`INSERT INTO body_weights (id, user_id, updated_at, synced_at, date, weight_kg, note) VALUES ('bw-2026-10-01', 'u', 5, 5, '2026-10-01', 80.5, 'nota')`)
    return { p, conn: connOf(p) }
  }

  it('en seco informa sin tocar nada; al aplicar añade las 15 columnas y conserva las filas; es idempotente', async () => {
    const { p, conn } = await oldTable()
    const dry = await runBodyComposition(conn, { dryRun: true })
    expect(dry).toMatchObject({ addedColumns: BODY_COMPOSITION_COLUMNS.map(([n]) => n), alreadyPresent: 0, bodyWeightRows: 1 })
    expect((await p.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'body_weights' AND column_name = 'bmi'`)).rows).toEqual([])

    const done = await runBodyComposition(conn, { dryRun: false })
    expect(done.addedColumns).toHaveLength(15)
    const { rows } = await p.query<Record<string, unknown>>(`SELECT * FROM body_weights`)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ date: '2026-10-01', weight_kg: 80.5, note: 'nota', bmi: null, bmr: null, measured_at: null, source: null })

    const again = await runBodyComposition(conn, { dryRun: false })
    expect(again).toMatchObject({ addedColumns: [], alreadyPresent: 15, bodyWeightRows: 1 })
  })

  it('funciona con el comportamiento de node-postgres (bigint/count como texto) y con down', async () => {
    const { p, conn } = await oldTable()
    const text = (c: Conn): Conn => {
      const flat = (rows: Row[]): Row[] => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' || typeof v === 'bigint' ? String(v) : v])))
      const wrap = (q: Q): Q => async (sql, params) => flat(await q(sql, params))
      return { query: wrap(c.query), transaction: (fn) => c.transaction((q) => fn(wrap(q))) }
    }
    expect((await runBodyComposition(text(conn), { dryRun: false })).bodyWeightRows).toBe(1)
    await runBodyCompositionDown(conn)
    expect((await p.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'body_weights' AND column_name = 'bmi'`)).rows).toEqual([])
    expect((await p.query(`SELECT weight_kg FROM body_weights`)).rows).toEqual([{ weight_kg: 80.5 }]) // el peso se conserva
    expect((await runBodyComposition(conn, { dryRun: false })).addedColumns).toHaveLength(15) // se puede volver a aplicar
  })

  it('aborta sin la tabla body_weights', async () => {
    const { p, conn } = await oldTable()
    await p.exec('DROP TABLE body_weights')
    await expect(runBodyComposition(conn, { dryRun: false })).rejects.toThrow(/body_weights/)
  })
})
