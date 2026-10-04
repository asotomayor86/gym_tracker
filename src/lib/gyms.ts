import { useLiveQuery } from 'dexie-react-hooks'
import { alive, db, removeFrom, saveTo, type GymDB } from '../db/db'
import { availabilityRows, GYMS } from './gymData'
import type { Exercise, ExerciseGym, Gym } from './types'

export type Availability = 'available' | 'unavailable' | 'unverified'

export const exerciseGymId = (exerciseId: string, gymId: string) => `${exerciseId}:${gymId}`

/**
 * Disponibilidad de un ejercicio en un gimnasio. Pura.
 *  - sin gimnasio elegido → 'available' (no se filtra nada);
 *  - fila viva con available=true/false → 'available' / 'unavailable';
 *  - sin fila (o fila borrada) → 'unverified' (no se oculta, pero se avisa).
 */
export function availabilityFor(gymId: string | null | undefined, exerciseId: string, rows: ExerciseGym[]): Availability {
  if (!gymId) return 'available'
  const row = rows.find((r) => r.id === exerciseGymId(exerciseId, gymId))
  if (!row || row.deletedAt) return 'unverified'
  return row.available ? 'available' : 'unavailable'
}

/** Igual que availabilityFor pero precalculando un índice (para listas largas). */
export function availabilityIndex(gymId: string | null | undefined, rows: ExerciseGym[]): (exerciseId: string) => Availability {
  if (!gymId) return () => 'available'
  const byId = new Map(rows.filter(alive).map((r) => [r.id, r.available]))
  return (exerciseId) => {
    const v = byId.get(exerciseGymId(exerciseId, gymId))
    return v === undefined ? 'unverified' : v ? 'available' : 'unavailable'
  }
}

/** Gimnasios vivos por orden (sort y nombre). */
export const sortGyms = (gyms: Gym[]) => gyms.filter(alive).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))

export const useGyms = (): Gym[] => useLiveQuery(async () => sortGyms(await db.gyms.toArray()), [], [])
export const useExerciseGyms = (): ExerciseGym[] => useLiveQuery(() => db.exerciseGyms.filter(alive).toArray(), [], [])

// ───────────── Edición del catálogo (solo admin: el servidor lo impone y el cliente descarta lo demás) ─────────────

export async function saveGym(gym: { id?: string; name: string; notes?: string; sort?: number }, d: GymDB = db): Promise<Gym> {
  const name = gym.name.trim()
  if (!name) throw new RangeError('El gimnasio necesita un nombre')
  const prev = gym.id ? await d.gyms.get(gym.id) : undefined
  return saveTo(d, 'gyms', {
    id: gym.id, name, notes: gym.notes ?? prev?.notes ?? '',
    sort: gym.sort ?? prev?.sort ?? (await d.gyms.filter(alive).count()),
  })
}

/** Borra el gimnasio y sus marcas de disponibilidad (borrado lógico; las preferencias que lo usen dejan de filtrar). */
export async function removeGym(id: string, d: GymDB = db) {
  for (const r of await d.exerciseGyms.where('gymId').equals(id).filter(alive).toArray()) await removeFrom(d, 'exerciseGyms', r.id)
  await removeFrom(d, 'gyms', id)
}

/** Marca un ejercicio como disponible / no disponible en un gimnasio; `null` quita la marca (vuelve a "sin verificar"). */
export async function setAvailability(exerciseId: string, gymId: string, available: boolean | null, d: GymDB = db) {
  const id = exerciseGymId(exerciseId, gymId)
  if (available === null) {
    if (await d.exerciseGyms.get(id)) await removeFrom(d, 'exerciseGyms', id)
    return
  }
  await saveTo(d, 'exerciseGyms', { id, exerciseId, gymId, available })
}

/** Alta/edición de un ejercicio del catálogo. */
export function saveExercise(ex: Omit<Exercise, 'id' | 'updatedAt' | 'deletedAt'> & Partial<Pick<Exercise, 'id'>>, d: GymDB = db) {
  return saveTo(d, 'exercises', ex)
}

// ───────────── Semilla local (primer arranque sin red) ─────────────

/**
 * Gimnasios y disponibilidad empaquetados como filas "semilla" (updatedAt 1): sirven para trabajar sin red en un
 * dispositivo nuevo. El catálogo del servidor (updatedAt real) las sustituye; si el admin borra una marca, la fila
 * borrada existe y no se vuelve a sembrar.
 */
export async function seedGyms(d: GymDB = db) {
  const have = new Set((await d.gyms.toArray()).map((g) => g.id))
  await d.gyms.bulkPut(GYMS.filter((g) => !have.has(g.id)).map((g, i) => ({ id: g.id, name: g.name, notes: '', sort: i, updatedAt: 1, deletedAt: null })))
  const haveAv = new Set((await d.exerciseGyms.toArray()).map((r) => r.id))
  await d.exerciseGyms.bulkPut(
    availabilityRows()
      .filter((r) => !haveAv.has(exerciseGymId(r.exerciseId, r.gymId)))
      .map((r) => ({ id: exerciseGymId(r.exerciseId, r.gymId), exerciseId: r.exerciseId, gymId: r.gymId, available: r.available, updatedAt: 1, deletedAt: null })),
  )
}
