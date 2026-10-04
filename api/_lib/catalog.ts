import { getTableColumns, gt, isNull, lt } from 'drizzle-orm'
import { catalogTables, exercises } from '../../db/schema.js'
import type { AuthContext, Db } from './authService.js'
import { HttpError } from './authService.js'

const MUSCLES = new Set(['pecho', 'espalda', 'hombro', 'biceps', 'triceps', 'antebrazo', 'cuadriceps', 'aductores', 'isquios', 'gluteo', 'gemelo', 'core'])
type Rows = Record<string, Record<string, unknown>[]>
export interface CatalogPushResult { applied: number; rejected: Record<string, number> }

/** Nombre normalizado (minúsculas, sin tildes ni espacios sobrantes), igual que el cliente. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max
const baseOk = (r: Record<string, unknown>) =>
  typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 200 && typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) &&
  (r.deletedAt === null || r.deletedAt === undefined || typeof r.deletedAt === 'number')

/**
 * Escribe el catálogo global. SOLO el admin: para cualquier otro usuario devuelve 403 (el cliente ya no encola cambios
 * de catálogo si no es admin, así que esto solo salta con clientes manipulados).
 */
export async function pushCatalog(db: Db, ctx: AuthContext, incoming: Rows, now: number): Promise<CatalogPushResult> {
  const total = Object.values(incoming).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0)
  if (total === 0) return { applied: 0, rejected: {} }
  if (ctx.role !== 'admin') throw new HttpError(403, 'forbidden')
  const result: CatalogPushResult = { applied: 0, rejected: {} }
  const reject = (table: string) => void (result.rejected[table] = (result.rejected[table] ?? 0) + 1)

  const liveNames = new Map<string, string>() // nombre normalizado -> id de un ejercicio vivo del catálogo
  for (const e of await db.select({ id: exercises.id, name: exercises.name }).from(exercises).where(isNull(exercises.deletedAt))) liveNames.set(norm(e.name), e.id)
  const knownIds = new Set((await db.select({ id: exercises.id }).from(exercises)).map((e) => e.id))

  for (const [name, table] of Object.entries(catalogTables)) {
    const allowed = Object.keys(getTableColumns(table))
    for (const r of incoming[name] ?? []) {
      let ok = baseOk(r)
      if (ok && name === 'exercises') {
        ok = str(r.name, 120) && !!(r.name as string).trim() && typeof r.primaryMuscle === 'string' && MUSCLES.has(r.primaryMuscle) &&
          (r.secondaryMuscles === undefined || (Array.isArray(r.secondaryMuscles) && r.secondaryMuscles.every((m) => typeof m === 'string' && MUSCLES.has(m))))
        if (ok && !r.deletedAt) {
          const owner = liveNames.get(norm(r.name as string))
          if (owner && owner !== r.id) ok = false // duplicado por nombre: no se crean ejercicios repetidos
          else liveNames.set(norm(r.name as string), r.id as string)
        }
        // Un borrado de algo que el catálogo no conoce no aporta nada (p. ej. duplicados antiguos de un dispositivo): se ignora.
        if (ok && r.deletedAt && !knownIds.has(r.id as string)) continue
      } else if (ok && name === 'gyms') ok = str(r.name, 80) && !!(r.name as string).trim()
      else if (ok && name === 'exerciseGyms') {
        ok = str(r.exerciseId, 200) && str(r.gymId, 200) && typeof r.available === 'boolean' && r.id === `${r.exerciseId}:${r.gymId}`
      }
      if (!ok) {
        reject(name)
        continue
      }
      const row: Record<string, unknown> = {}
      for (const key of allowed) if (key in r) row[key] = r[key]
      row.syncedAt = now
      const { id: _id, ...set } = row
      await db
        .insert(table)
        .values(row as never)
        .onConflictDoUpdate({ target: table.id, set: set as never, setWhere: lt(table.updatedAt, r.updatedAt as number) })
      result.applied++
    }
  }
  return result
}

export async function pullCatalog(db: Db, since: number) {
  const out: Record<string, unknown[]> = {}
  for (const [name, table] of Object.entries(catalogTables)) {
    const rows = await db.select().from(table).where(gt(table.syncedAt, since)).limit(5000)
    out[name] = rows.map(({ syncedAt: _s, ...rest }) => rest)
  }
  return out
}
