import type { Exercise, TemplateExercise, WorkoutTemplate } from './types'

export interface SeedRows {
  exercises: Exercise[]
  workoutTemplates: WorkoutTemplate[]
  templateExercises: TemplateExercise[]
}

export interface SeedPlan {
  insert: SeedRows
  /** Ids de filas semilla locales (sin editar) que se descartan por duplicar datos que ya existen. */
  remove: Record<keyof SeedRows, string[]>
}

export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Fila semilla sin tocar por el usuario: id determinista y updatedAt fijo (nunca se encola ni se sube). */
const isPlaceholder = (r: { id: string; updatedAt: number }) => r.id.startsWith('seed-') && r.updatedAt === 1

/**
 * Calcula qué hay que insertar/retirar para que las semillas existan sin duplicados.
 * `existing` incluye TAMBIÉN las filas borradas (deletedAt): una semilla borrada por el usuario no resucita.
 * Una semilla se omite si ya hay una fila con su id o con su nombre normalizado (datos importados antes con ids aleatorios).
 */
export function planSeed(seed: SeedRows, existing: SeedRows): SeedPlan {
  const remove: SeedPlan['remove'] = { exercises: [], workoutTemplates: [], templateExercises: [] }

  // 1) Retira placeholders que duplican por nombre una fila distinta (p. ej. llegada por sync tras sembrar).
  const dedupe = <T extends { id: string; name: string; updatedAt: number }>(rows: T[], out: string[]) => {
    const byName = new Map<string, T[]>()
    for (const r of rows) byName.set(norm(r.name), [...(byName.get(norm(r.name)) ?? []), r])
    for (const group of byName.values()) {
      if (group.length < 2) continue
      const keep = group.find((r) => !isPlaceholder(r)) ?? group[0]
      for (const r of group) if (r !== keep && isPlaceholder(r)) out.push(r.id)
    }
  }
  dedupe(existing.exercises, remove.exercises)
  dedupe(existing.workoutTemplates, remove.workoutTemplates)

  const exercises = existing.exercises.filter((r) => !remove.exercises.includes(r.id))
  const templates = existing.workoutTemplates.filter((r) => !remove.workoutTemplates.includes(r.id))
  const tes = existing.templateExercises.filter((r) => {
    const ex = exercises.some((e) => e.id === r.exerciseId)
    const tpl = templates.some((t) => t.id === r.templateId)
    const dangling = isPlaceholder(r) && (!ex || !tpl)
    if (dangling) remove.templateExercises.push(r.id)
    return !dangling
  })

  // 2) Inserta las semillas que faltan.
  const insert: SeedRows = { exercises: [], workoutTemplates: [], templateExercises: [] }
  const exById = new Map(exercises.map((e) => [e.id, e]))
  const exByName = new Map(exercises.map((e) => [norm(e.name), e]))
  const exEffective = new Map<string, Exercise>() // id semilla -> fila real que lo representa
  for (const s of seed.exercises) {
    const found = exById.get(s.id) ?? exByName.get(norm(s.name))
    if (found) exEffective.set(s.id, found)
    else {
      insert.exercises.push(s)
      exEffective.set(s.id, s)
    }
  }

  const tplById = new Map(templates.map((t) => [t.id, t]))
  const tplNames = new Set(templates.map((t) => norm(t.name)))
  const tplEffective = new Map<string, WorkoutTemplate>() // solo plantillas con id semilla
  for (const s of seed.workoutTemplates) {
    const found = tplById.get(s.id)
    if (found) tplEffective.set(s.id, found)
    else if (!tplNames.has(norm(s.name))) {
      insert.workoutTemplates.push(s)
      tplEffective.set(s.id, s)
    }
  }

  // Un ejercicio de rutina semilla se añade si su rutina semilla está viva y su ejercicio no está borrado.
  const teIds = new Set(tes.map((t) => t.id))
  for (const s of seed.templateExercises) {
    if (teIds.has(s.id)) continue
    const tpl = tplEffective.get(s.templateId)
    const ex = exEffective.get(s.exerciseId)
    if (!tpl || tpl.deletedAt || !ex || ex.deletedAt) continue
    insert.templateExercises.push({ ...s, exerciseId: ex.id })
  }

  return { insert, remove }
}
