import { alive, db, saveTo, type GymDB } from '../db/db'
import { sessionExerciseIds } from './order'
import { isDone } from './stats'
import type { SetLog, TemplateExercise } from './types'

export const DEFAULT_REST_S = 90
const MAX_NAME = 80

const pad = (n: number) => String(n).padStart(2, '0')
/** Nombre por defecto: 'Rutina del dd/mm/aaaa' (fecha local de la sesión). */
export const defaultTemplateName = (startedAt: number) => {
  const d = new Date(startedAt)
  return `Rutina del ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/**
 * Ejercicios de la sesión en orden: exerciseOrder si la sesión lo tiene (valores distintos); si no (series antiguas),
 * el orden de la rutina de origen y luego el del primer registro. Función pura.
 */
export function orderedSessionExercises(logs: SetLog[], sourceRows: TemplateExercise[]): string[] {
  if (new Set(logs.map((l) => l.exerciseOrder ?? 0)).size > 1) return sessionExerciseIds(logs)
  const pos = new Map<string, number>()
  for (const r of [...sourceRows].filter(alive).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))) if (!pos.has(r.exerciseId)) pos.set(r.exerciseId, pos.size)
  const first = (id: string) => Math.min(...logs.filter((l) => l.exerciseId === id).map((l) => l.completedAt ?? l.updatedAt))
  return [...new Set(logs.map((l) => l.exerciseId))].sort((a, b) => (pos.get(a) ?? 1e9) - (pos.get(b) ?? 1e9) || first(a) - first(b) || a.localeCompare(b))
}

/**
 * Objetivos de un ejercicio a partir de sus series en la sesión. Pura.
 *  - sets = series COMPLETADAS (mínimo 1); si no hay ninguna, todas las series;
 *  - reps = las de la última serie completada (por índice de serie); sin completadas, las de la última serie;
 *  - peso = el mayor entre las completadas que no fueron 'failed' (si todas fallaron, el mayor de ellas); sin completadas, el mayor de todas.
 */
export function targetsFromLogs(logs: SetLog[]): { sets: number; reps: number; weightKg: number } {
  const bySet = (a: SetLog, b: SetLog) => a.setIndex - b.setIndex || (a.completedAt ?? 0) - (b.completedAt ?? 0)
  const done = logs.filter(isDone).sort(bySet)
  const pool = done.length ? done : [...logs].sort(bySet)
  const solid = done.filter((l) => l.effort !== 'failed')
  const weights = (solid.length ? solid : pool).map((l) => l.weightKg)
  return { sets: Math.max(1, pool.length), reps: pool[pool.length - 1].reps, weightKg: Math.max(...weights) }
}

/**
 * Crea una rutina PRIVADA del usuario a partir de una sesión: un ejercicio por cada uno de la sesión, en su orden,
 * con series/repeticiones/peso objetivo sacados de lo que se hizo y el descanso de la rutina de origen (o 90 s).
 * Salta los ejercicios que ya no existen en el catálogo. Cada llamada crea una rutina nueva (ids nuevos).
 * Devuelve el id de la rutina para ir a editarla; lanza RangeError (sin crear nada) si no queda ningún ejercicio válido.
 */
export async function createTemplateFromSession(sessionId: string, name: string, d: GymDB = db): Promise<string> {
  const session = await d.sessions.get(sessionId)
  if (!session || session.deletedAt) throw new RangeError('La sesión no existe')
  const logs = await d.setLogs.where('sessionId').equals(sessionId).filter(alive).toArray()
  const source = session.templateId ? await d.templateExercises.where('templateId').equals(session.templateId).filter(alive).toArray() : []

  const items: { exerciseId: string; sets: number; reps: number; weightKg: number; restS: number }[] = []
  for (const exerciseId of orderedSessionExercises(logs, source)) {
    const exercise = await d.exercises.get(exerciseId)
    if (!exercise || exercise.deletedAt) continue // borrado del catálogo: no se copia
    const t = targetsFromLogs(logs.filter((l) => l.exerciseId === exerciseId))
    items.push({ exerciseId, ...t, restS: source.find((r) => r.exerciseId === exerciseId)?.restS ?? DEFAULT_REST_S })
  }
  if (!items.length) throw new RangeError('La sesión no tiene ejercicios que copiar')

  const template = await saveTo(d, 'workoutTemplates', { name: name.trim().slice(0, MAX_NAME) || defaultTemplateName(session.startedAt) })
  for (const [position, it] of items.entries()) {
    await saveTo(d, 'templateExercises', {
      templateId: template.id, exerciseId: it.exerciseId, position, targetSets: it.sets, targetReps: it.reps, targetWeightKg: it.weightKg, restS: it.restS,
    })
  }
  return template.id
}
