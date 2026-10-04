import { describe, expect, it } from 'vitest'
import { norm, planSeed, type SeedRows } from './seedPlan'
import type { Exercise, TemplateExercise, WorkoutTemplate } from './types'

const ex = (id: string, name: string, p: Partial<Exercise> = {}): Exercise =>
  ({ id, name, primaryMuscle: 'pecho', secondaryMuscles: [], equipment: '', notes: '', updatedAt: 1, deletedAt: null, ...p })
const tpl = (id: string, name: string, p: Partial<WorkoutTemplate> = {}): WorkoutTemplate =>
  ({ id, name, updatedAt: 1, deletedAt: null, ...p })
const te = (id: string, templateId: string, exerciseId: string, p: Partial<TemplateExercise> = {}): TemplateExercise =>
  ({ id, templateId, exerciseId, position: 0, targetSets: 3, targetReps: 12, targetWeightKg: 20, restS: 60, updatedAt: 1, deletedAt: null, ...p })

const SEED: SeedRows = {
  exercises: [ex('seed-ex-prensa', 'Prensa de piernas'), ex('seed-ex-curl', 'Curl de bíceps')],
  workoutTemplates: [tpl('seed-tpl-a', 'Día A')],
  templateExercises: [te('seed-te-a-0', 'seed-tpl-a', 'seed-ex-prensa'), te('seed-te-a-1', 'seed-tpl-a', 'seed-ex-curl')],
}
const EMPTY: SeedRows = { exercises: [], workoutTemplates: [], templateExercises: [] }
const apply = (db: SeedRows, plan: ReturnType<typeof planSeed>): SeedRows => ({
  exercises: [...db.exercises.filter((r) => !plan.remove.exercises.includes(r.id)), ...plan.insert.exercises],
  workoutTemplates: [...db.workoutTemplates.filter((r) => !plan.remove.workoutTemplates.includes(r.id)), ...plan.insert.workoutTemplates],
  templateExercises: [...db.templateExercises.filter((r) => !plan.remove.templateExercises.includes(r.id)), ...plan.insert.templateExercises],
})

describe('planSeed', () => {
  it('siembra todo en una base vacía con ids deterministas', () => {
    const { insert } = planSeed(SEED, EMPTY)
    expect(insert).toEqual(SEED)
  })

  it('es idempotente', () => {
    const once = apply(EMPTY, planSeed(SEED, EMPTY))
    const again = planSeed(SEED, once)
    expect(again.insert).toEqual(EMPTY)
    expect(again.remove).toEqual({ exercises: [], workoutTemplates: [], templateExercises: [] })
  })

  it('no resucita ejercicios, rutinas ni series de rutina borrados', () => {
    const db: SeedRows = {
      exercises: [ex('seed-ex-prensa', 'Prensa de piernas', { updatedAt: 5, deletedAt: 5 }), ex('seed-ex-curl', 'Curl de bíceps')],
      workoutTemplates: [tpl('seed-tpl-a', 'Día A')],
      templateExercises: [te('seed-te-a-0', 'seed-tpl-a', 'seed-ex-prensa', { updatedAt: 5, deletedAt: 5 })],
    }
    const { insert } = planSeed(SEED, db)
    expect(insert.exercises).toEqual([])
    expect(insert.templateExercises.map((t) => t.id)).toEqual(['seed-te-a-1'])

    const tplGone = planSeed(SEED, { ...EMPTY, workoutTemplates: [tpl('seed-tpl-a', 'Día A', { updatedAt: 9, deletedAt: 9 })] })
    expect(tplGone.insert.workoutTemplates).toEqual([])
    expect(tplGone.insert.templateExercises).toEqual([])
  })

  it('no duplica datos importados antes con ids aleatorios (nombre sin tildes/mayúsculas)', () => {
    const old: SeedRows = {
      exercises: [ex('uuid-1', 'prensa DE piernas', { updatedAt: 99 }), ex('uuid-2', 'Curl de biceps', { updatedAt: 99 })],
      workoutTemplates: [tpl('uuid-t', 'dia a', { updatedAt: 99 })],
      templateExercises: [te('uuid-te', 'uuid-t', 'uuid-1', { updatedAt: 99 })],
    }
    const plan = planSeed(SEED, old)
    expect(plan.insert).toEqual(EMPTY)
    expect(plan.remove).toEqual({ exercises: [], workoutTemplates: [], templateExercises: [] })
  })

  it('una semilla editada por el usuario (updatedAt real) se respeta', () => {
    const db: SeedRows = { ...EMPTY, exercises: [ex('seed-ex-prensa', 'Prensa mía', { updatedAt: 7 })] }
    const plan = planSeed(SEED, db)
    expect(plan.insert.exercises.map((e) => e.id)).toEqual(['seed-ex-curl'])
  })

  it('enlaza las series de rutina al ejercicio ya existente con otro id', () => {
    const db: SeedRows = { ...EMPTY, exercises: [ex('uuid-1', 'Prensa de piernas', { updatedAt: 99 })] }
    const { insert } = planSeed(SEED, db)
    expect(insert.templateExercises.find((t) => t.id === 'seed-te-a-0')!.exerciseId).toBe('uuid-1')
  })

  it('tras el sync retira semillas locales duplicadas por filas remotas con el mismo nombre', () => {
    const local = apply(EMPTY, planSeed(SEED, EMPTY))
    const pulled: SeedRows = {
      exercises: [...local.exercises, ex('uuid-1', 'Prensa de piernas', { updatedAt: 99 })],
      workoutTemplates: [...local.workoutTemplates, tpl('uuid-t', 'Día A', { updatedAt: 99 })],
      templateExercises: [...local.templateExercises, te('uuid-te', 'uuid-t', 'uuid-1', { updatedAt: 99 })],
    }
    const final = apply(pulled, planSeed(SEED, pulled))
    expect(final.exercises.map((e) => e.id).sort()).toEqual(['seed-ex-curl', 'uuid-1'])
    expect(final.workoutTemplates.map((t) => t.id)).toEqual(['uuid-t'])
    expect(final.templateExercises.map((t) => t.id)).toEqual(['uuid-te'])
    expect(planSeed(SEED, final).insert).toEqual(EMPTY)
  })
})

describe('planSeed · migraciones y refresco', () => {
  it('migra "Aductores en máquina" de cuadriceps a aductores si el usuario no lo cambió', () => {
    const db: SeedRows = { ...EMPTY, exercises: [ex('uuid-a', 'Aductores en máquina', { primaryMuscle: 'cuadriceps', updatedAt: 50 })] }
    const { migrate } = planSeed(SEED, db)
    expect(migrate).toHaveLength(1)
    expect(migrate[0]).toMatchObject({ id: 'uuid-a', primaryMuscle: 'aductores' })
  })

  it('respeta si el usuario lo puso en otro grupo, si está borrado o si ya migró', () => {
    for (const p of [{ primaryMuscle: 'gluteo' as const }, { deletedAt: 9 }, { primaryMuscle: 'aductores' as const }]) {
      const db: SeedRows = { ...EMPTY, exercises: [ex('uuid-a', 'Aductores en máquina', { updatedAt: 50, ...p })] }
      expect(planSeed(SEED, db).migrate).toEqual([])
    }
  })

  it('no migra por su cuenta el placeholder: lo refresca desde el catálogo (sin sync)', () => {
    const old: SeedRows = { ...EMPTY, exercises: [ex('seed-ex-prensa', 'Prensa de piernas', { primaryMuscle: 'cuadriceps' })] }
    const seed: SeedRows = { ...SEED, exercises: [ex('seed-ex-prensa', 'Prensa de piernas', { primaryMuscle: 'aductores' })] }
    const plan = planSeed(seed, old)
    expect(plan.migrate).toEqual([])
    expect(plan.insert.exercises).toEqual([seed.exercises[0]])
  })

  it('nameEn llega a las semillas sin editar y se conserva en las editadas por el admin', () => {
    const seed: SeedRows = { ...SEED, exercises: [ex('seed-ex-prensa', 'Prensa de piernas', { nameEn: 'Leg Press' }), ex('seed-ex-curl', 'Curl de bíceps', { nameEn: 'Biceps Curl' })] }
    const old: SeedRows = {
      ...EMPTY,
      exercises: [ex('seed-ex-prensa', 'Prensa de piernas'), ex('seed-ex-curl', 'Curl de bíceps', { updatedAt: 9, nameEn: 'Mi curl' })],
    }
    const plan = planSeed(seed, old)
    expect(plan.insert.exercises.map((e) => [e.id, e.nameEn])).toEqual([['seed-ex-prensa', 'Leg Press']]) // la sin editar se refresca
    expect(plan.migrate).toEqual([]) // la editada no se toca
  })

  it('no refresca semillas ya editadas por el usuario', () => {
    const old: SeedRows = { ...EMPTY, exercises: [ex('seed-ex-prensa', 'Prensa de piernas', { updatedAt: 7, notes: 'mía' })] }
    expect(planSeed(SEED, old).insert.exercises.map((e) => e.id)).toEqual(['seed-ex-curl'])
  })
})

describe('norm', () => {
  it('ignora mayúsculas, tildes y espacios', () => {
    expect(norm('  Curl  de BÍCEPS ')).toBe('curl de biceps')
  })
})
