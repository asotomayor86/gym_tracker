import { norm } from './seedPlan'
import type { Exercise, Session, SetLog, TemplateExercise, WorkoutTemplate } from './types'

export interface MergeRows {
  exercises: Exercise[]
  workoutTemplates: WorkoutTemplate[]
  templateExercises: TemplateExercise[]
  sessions: Session[]
  setLogs: SetLog[]
}

/** Filas que hay que guardar (con save(): sincronizan). Nunca hay borrado físico: los sobrantes llevan deletedAt. */
export type MergePlan = MergeRows

const alive = (r: { deletedAt: number | null }) => !r.deletedAt

/** Semilla sin editar: fila solo local (id seed-*, updatedAt 1) que gestiona planSeed; la fusión nunca la elige ni la borra. */
const isPlaceholder = (r: { id: string; updatedAt: number }) => r.id.startsWith('seed-') && r.updatedAt === 1

/** Canónico estable: id de semilla (seed-*) primero, luego el id menor. NO depende de referencias ni de qué dispositivo corre. */
const canonicalOf = <T extends { id: string }>(rows: T[]): T =>
  [...rows].sort((a, b) => Number(b.id.startsWith('seed-')) - Number(a.id.startsWith('seed-')) || a.id.localeCompare(b.id))[0]

const groupByName = <T extends { name: string; deletedAt: number | null }>(rows: T[]) => {
  const g = new Map<string, T[]>()
  for (const r of rows) g.set(norm(r.name), [...(g.get(norm(r.name)) ?? []), r])
  return g
}

/**
 * Fusiona ejercicios y rutinas duplicados por nombre normalizado, re-apuntando referencias.
 * Determinista e idempotente: misma entrada → mismo resultado en cualquier dispositivo; con datos ya fusionados no devuelve nada.
 * Por qué el canónico no es "el más referenciado": si dos dispositivos con referencias distintas eligieran canónicos
 * distintos, cada uno borraría el del otro y no quedaría ninguno vivo. Con una regla que solo depende del conjunto de
 * ids, el mínimo global nunca lo borra nadie. Las referencias se re-apuntan al canónico, así no se pierde ninguna serie.
 */
export function planMerge(input: MergeRows, now: number): MergePlan {
  const exerciseTo = new Map<string, string>() // id duplicado (vivo o borrado) -> canónico
  const removedExercises = new Set<string>()
  for (const group of groupByName(input.exercises).values()) {
    const live = group.filter((e) => alive(e) && !isPlaceholder(e))
    if (!live.length) continue // solo semilla local: nada que fusionar
    const canon = canonicalOf(live)
    for (const e of group) {
      if (e.id === canon.id) continue
      exerciseTo.set(e.id, canon.id) // las referencias a la semilla también pasan al canónico real
      if (alive(e) && !isPlaceholder(e)) removedExercises.add(e.id)
    }
  }

  const templateTo = new Map<string, string>()
  const templateGroups: { canon: WorkoutTemplate; losers: WorkoutTemplate[] }[] = []
  for (const group of groupByName(input.workoutTemplates).values()) {
    const live = group.filter((t) => alive(t) && !isPlaceholder(t))
    if (!live.length) continue
    const canon = canonicalOf(live)
    const losers = live.filter((t) => t.id !== canon.id).sort((a, b) => a.id.localeCompare(b.id))
    for (const t of group) if (t.id !== canon.id) templateTo.set(t.id, canon.id)
    // (una rutina semilla local sin editar tampoco se fusiona por sí sola: planSeed la retira si hay otra con su nombre)
    if (losers.length) templateGroups.push({ canon, losers })
  }

  // Filas de rutina con ejercicios ya re-apuntados.
  const tes = new Map(
    input.templateExercises.map((t) => [t.id, alive(t) && exerciseTo.has(t.exerciseId) ? { ...t, exerciseId: exerciseTo.get(t.exerciseId)! } : t]),
  )
  for (const { canon, losers } of templateGroups) {
    const rowsOf = (tid: string) =>
      [...tes.values()].filter((t) => t.templateId === tid && alive(t)).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    const target = rowsOf(canon.id)
    for (const loser of losers) {
      for (const row of rowsOf(loser.id)) {
        const twin = target.find((t) => t.exerciseId === row.exerciseId)
        if (twin) {
          // Mismo ejercicio en ambas: se queda la fila canónica, con los valores de la más reciente si difieren.
          const values = (t: TemplateExercise) => [t.targetSets, t.targetReps, t.targetWeightKg, t.restS].join()
          if (row.updatedAt > twin.updatedAt && values(row) !== values(twin)) {
            const { targetSets, targetReps, targetWeightKg, restS } = row
            const updated = { ...twin, targetSets, targetReps, targetWeightKg, restS }
            target[target.indexOf(twin)] = updated
            tes.set(twin.id, updated)
          }
          tes.set(row.id, { ...row, deletedAt: now })
        } else {
          const moved = { ...row, templateId: canon.id }
          target.push(moved)
          tes.set(row.id, moved)
        }
      }
    }
    target.forEach((t, i) => tes.set(t.id, { ...t, position: i })) // posiciones consecutivas, orden del canónico primero
  }

  const out: MergePlan = { exercises: [], workoutTemplates: [], templateExercises: [], sessions: [], setLogs: [] }
  for (const e of input.exercises) if (removedExercises.has(e.id)) out.exercises.push({ ...e, deletedAt: now })
  for (const { losers } of templateGroups) for (const t of losers) out.workoutTemplates.push({ ...t, deletedAt: now })
  for (const original of input.templateExercises) {
    const next = tes.get(original.id)!
    if (JSON.stringify(next) !== JSON.stringify(original)) out.templateExercises.push(next)
  }
  for (const s of input.sessions) {
    const to = alive(s) && s.templateId ? templateTo.get(s.templateId) : undefined
    if (to) out.sessions.push({ ...s, templateId: to })
  }
  for (const l of input.setLogs) {
    const to = alive(l) ? exerciseTo.get(l.exerciseId) : undefined
    if (to) out.setLogs.push({ ...l, exerciseId: to })
  }
  return out
}

export const mergeSize = (p: MergePlan) => Object.values(p).reduce((n, rows) => n + rows.length, 0)
