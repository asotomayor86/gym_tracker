import { alive, db, saveTo, type GymDB } from '../db/db'
import type { Unit } from './units'
import { fromKg, roundTo } from './units'
import type { SetLog, TemplateExercise } from './types'

/** Ejercicios de una sesión en su orden (exerciseOrder; desempate por primer registro). Función pura. */
export function sessionExerciseIds(logs: SetLog[]): string[] {
  const first = new Map<string, SetLog>()
  for (const l of [...logs].sort((a, b) => a.setIndex - b.setIndex || a.id.localeCompare(b.id))) {
    const cur = first.get(l.exerciseId)
    if (!cur || (l.exerciseOrder ?? 0) < (cur.exerciseOrder ?? 0)) first.set(l.exerciseId, l)
  }
  return [...first.values()]
    .sort((a, b) => (a.exerciseOrder ?? 0) - (b.exerciseOrder ?? 0) || (a.completedAt ?? a.updatedAt) - (b.completedAt ?? b.updatedAt) || a.id.localeCompare(b.id))
    .map((l) => l.exerciseId)
}

/** Siguiente orden para un ejercicio nuevo en la sesión (max + 1; 0 si está vacía). */
export const nextExerciseOrder = (logs: SetLog[]) => (logs.length ? Math.max(...logs.map((l) => l.exerciseOrder ?? 0)) + 1 : 0)

/**
 * Reescribe exerciseOrder 0..n-1 según `exerciseIdsInOrder` (los ejercicios no citados van detrás, en su orden actual).
 * Solo guarda (save → sincroniza) las series que cambian.
 */
export async function reorderSessionExercises(sessionId: string, exerciseIdsInOrder: string[], d: GymDB = db) {
  const logs = await d.setLogs.where('sessionId').equals(sessionId).filter(alive).toArray()
  const rest = sessionExerciseIds(logs).filter((id) => !exerciseIdsInOrder.includes(id))
  const index = new Map([...exerciseIdsInOrder, ...rest].map((id, i) => [id, i]))
  for (const l of logs) {
    const exerciseOrder = index.get(l.exerciseId)
    if (exerciseOrder !== undefined && exerciseOrder !== l.exerciseOrder) await saveTo(d, 'setLogs', { ...l, exerciseOrder })
  }
}

/** Reescribe position 0..n-1 de las filas de la rutina según `templateExerciseIdsInOrder` (las no citadas, detrás). */
export async function reorderTemplateExercises(templateId: string, templateExerciseIdsInOrder: string[], d: GymDB = db) {
  const rows = await d.templateExercises.where('templateId').equals(templateId).filter(alive).toArray()
  const rest = rows
    .filter((r) => !templateExerciseIdsInOrder.includes(r.id))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((r) => r.id)
  const index = new Map([...templateExerciseIdsInOrder, ...rest].map((id, i) => [id, i]))
  for (const r of rows) {
    const position = index.get(r.id)
    if (position !== undefined && position !== r.position) await saveTo(d, 'templateExercises', { ...r, position } as TemplateExercise)
  }
}

/** Añade una serie a un ejercicio de la sesión; si el ejercicio es nuevo en ella, queda el último (orden de alta). */
export async function addSetToSession(sessionId: string, exerciseId: string, unit: Unit, d: GymDB = db) {
  const logs = await d.setLogs.where('sessionId').equals(sessionId).filter(alive).toArray()
  const mine = logs.filter((l) => l.exerciseId === exerciseId).sort((a, b) => a.setIndex - b.setIndex)
  const last = mine[mine.length - 1]
  const weightKg = last?.weightKg ?? 20
  return saveTo(d, 'setLogs', {
    sessionId, exerciseId, setIndex: (last?.setIndex ?? -1) + 1,
    exerciseOrder: mine[0]?.exerciseOrder ?? nextExerciseOrder(logs),
    reps: last?.reps ?? 10, weightKg, inputUnit: unit, inputWeight: roundTo(fromKg(weightKg, unit), 0.5),
    effort: null, completedAt: null,
  })
}

/**
 * Migración de series antiguas sin orden (todas con exerciseOrder igual): primero el orden de la rutina de la sesión,
 * luego por primer registro. Determinista (mismo resultado en cualquier dispositivo). Devuelve las series a guardar.
 */
export function planExerciseOrderBackfill(
  logs: SetLog[], sessionTemplate: Map<string, string | null>, templateRows: TemplateExercise[],
): SetLog[] {
  const bySession = new Map<string, SetLog[]>()
  for (const l of logs.filter(alive)) bySession.set(l.sessionId, [...(bySession.get(l.sessionId) ?? []), l])
  const out: SetLog[] = []
  for (const [sessionId, list] of bySession) {
    const ids = new Set(list.map((l) => l.exerciseId))
    if (ids.size < 2 || new Set(list.map((l) => l.exerciseOrder ?? 0)).size > 1) continue // nada que migrar o ya ordenada
    const tpl = sessionTemplate.get(sessionId)
    const pos = new Map<string, number>()
    for (const r of templateRows.filter((r) => r.templateId === tpl && alive(r)).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))) {
      if (!pos.has(r.exerciseId)) pos.set(r.exerciseId, pos.size)
    }
    const firstAt = (id: string) => Math.min(...list.filter((l) => l.exerciseId === id).map((l) => l.completedAt ?? l.updatedAt))
    const ordered = [...ids].sort((a, b) =>
      (pos.get(a) ?? 1e9) - (pos.get(b) ?? 1e9) || firstAt(a) - firstAt(b) || a.localeCompare(b))
    for (const l of list) out.push({ ...l, exerciseOrder: ordered.indexOf(l.exerciseId) })
  }
  return out.filter((l) => l.exerciseOrder !== logs.find((x) => x.id === l.id)!.exerciseOrder)
}
