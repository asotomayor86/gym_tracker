import { describe, expect, it } from 'vitest'
import { planMerge, type MergeRows } from './mergePlan'
import { planSeed, type SeedRows } from './seedPlan'
import type { Exercise, Session, SetLog, TemplateExercise, WorkoutTemplate } from './types'

/** Simula ensureSeed sobre filas en memoria: fusión → siembra (insert/refresh/remove) sin tocar el resto. */
function ensureSeedPure(rows: MergeRows, seed: SeedRows, now: number): MergeRows {
  const sub = <T extends { id: string }>(list: T[], changed: T[]) => list.map((r) => changed.find((c) => c.id === r.id) ?? r)
  const m = planMerge(rows, now)
  const merged: MergeRows = {
    exercises: sub(rows.exercises, m.exercises), workoutTemplates: sub(rows.workoutTemplates, m.workoutTemplates),
    templateExercises: sub(rows.templateExercises, m.templateExercises), sessions: sub(rows.sessions, m.sessions),
    setLogs: sub(rows.setLogs, m.setLogs),
  }
  const p = planSeed(seed, merged)
  const put = <T extends { id: string }>(list: T[], remove: string[], insert: T[]) => [
    ...list.filter((r) => !remove.includes(r.id) && !insert.some((i) => i.id === r.id)), ...insert,
  ]
  return {
    ...merged,
    exercises: put(merged.exercises, p.remove.exercises, p.insert.exercises),
    workoutTemplates: put(merged.workoutTemplates, p.remove.workoutTemplates, p.insert.workoutTemplates),
    templateExercises: put(merged.templateExercises, p.remove.templateExercises, p.insert.templateExercises),
  }
}

const ex = (id: string, name: string, p: Partial<Exercise> = {}): Exercise =>
  ({ id, name, primaryMuscle: 'pecho', secondaryMuscles: [], equipment: '', notes: '', updatedAt: 1, deletedAt: null, ...p })
const tpl = (id: string, name: string, p: Partial<WorkoutTemplate> = {}): WorkoutTemplate => ({ id, name, updatedAt: 1, deletedAt: null, ...p })
const te = (id: string, templateId: string, exerciseId: string, position: number, p: Partial<TemplateExercise> = {}): TemplateExercise =>
  ({ id, templateId, exerciseId, position, targetSets: 3, targetReps: 12, targetWeightKg: 20, restS: 60, updatedAt: 1, deletedAt: null, ...p })
const log = (id: string, exerciseId: string): SetLog =>
  ({ id, sessionId: 's', exerciseId, setIndex: 0, exerciseOrder: 0, reps: 10, weightKg: 50, inputUnit: 'kg', inputWeight: 50, effort: 'hard_done', completedAt: 5, updatedAt: 100, deletedAt: null })
const session = (templateId: string | null): Session => ({ id: 's', templateId, startedAt: 1, endedAt: 2, notes: '', updatedAt: 100, deletedAt: null })

const SEED: SeedRows = {
  exercises: [ex('seed-ex-prensa', 'Prensa de piernas'), ex('seed-ex-curl', 'Curl de bíceps')],
  workoutTemplates: [tpl('seed-tpl-a', 'Día A')],
  templateExercises: [te('seed-te-a-0', 'seed-tpl-a', 'seed-ex-prensa', 0), te('seed-te-a-1', 'seed-tpl-a', 'seed-ex-curl', 1)],
}
const EMPTY: MergeRows = { exercises: [], workoutTemplates: [], templateExercises: [], sessions: [], setLogs: [] }

/** Toda referencia (series, filas de rutina, sesiones) debe apuntar a una fila existente y viva. */
function expectNoDangling(r: MergeRows) {
  const ex = new Set(r.exercises.filter((e) => !e.deletedAt).map((e) => e.id))
  const tp = new Set(r.workoutTemplates.filter((e) => !e.deletedAt).map((e) => e.id))
  for (const l of r.setLogs.filter((l) => !l.deletedAt)) expect(ex.has(l.exerciseId), `serie ${l.id} -> ${l.exerciseId}`).toBe(true)
  for (const t of r.templateExercises.filter((t) => !t.deletedAt)) {
    expect(ex.has(t.exerciseId), `fila ${t.id} -> ${t.exerciseId}`).toBe(true)
    expect(tp.has(t.templateId), `fila ${t.id} -> rutina ${t.templateId}`).toBe(true)
  }
  for (const s of r.sessions.filter((s) => !s.deletedAt && s.templateId)) expect(tp.has(s.templateId!), `sesión -> ${s.templateId}`).toBe(true)
}

describe('refs a ids seed-* y dispositivo nuevo', () => {
  it('un dispositivo nuevo que hace pull ANTES de sembrar no pierde nada: las refs a seed-* se resuelven tras ensureSeed', () => {
    // Pull: series/filas/sesión apuntan a ids seed-* editados por el usuario en otro dispositivo (viven en Neon).
    const pulled: MergeRows = {
      ...EMPTY,
      exercises: [ex('seed-ex-prensa', 'Prensa de piernas', { updatedAt: 50, notes: 'editado' })],
      workoutTemplates: [tpl('seed-tpl-a', 'Día A', { updatedAt: 50 })],
      templateExercises: [te('seed-te-a-0', 'seed-tpl-a', 'seed-ex-prensa', 0, { updatedAt: 50, targetWeightKg: 80 })],
      sessions: [session('seed-tpl-a')],
      setLogs: [log('l1', 'seed-ex-prensa'), log('l2', 'seed-ex-curl')], // 'curl' es semilla sin editar: solo existirá tras sembrar
    }
    const before = JSON.stringify(pulled.setLogs)
    const after = ensureSeedPure(pulled, SEED, 60)
    expectNoDangling(after)
    expect(JSON.stringify(after.setLogs)).toBe(before) // ninguna referencia se reescribe ni se borra
    expect(after.exercises.find((e) => e.id === 'seed-ex-prensa')!.notes).toBe('editado') // lo editado gana a la semilla
    expect(after.exercises.map((e) => e.id).sort()).toEqual(['seed-ex-curl', 'seed-ex-prensa'])
    expect(after.templateExercises.find((t) => t.id === 'seed-te-a-0')!.targetWeightKg).toBe(80)
  })

  it('una fila de rutina que apunta a un ejercicio ajeno queda enlazada al ejercicio real, no a la semilla', () => {
    const rows: MergeRows = {
      ...EMPTY,
      exercises: [ex('uuid-1', 'Prensa de piernas', { updatedAt: 99 }), ex('seed-ex-prensa', 'prensa de piernas')],
      setLogs: [log('l1', 'seed-ex-prensa'), log('l2', 'uuid-1')],
    }
    const after = ensureSeedPure(rows, SEED, 60)
    expectNoDangling(after)
    expect(after.setLogs.map((l) => l.exerciseId).sort()).toEqual(['uuid-1', 'uuid-1'])
    expect(after.exercises.find((e) => e.id === 'uuid-1')!.deletedAt).toBeNull() // el real sigue vivo
    expect(after.exercises.some((e) => e.id === 'seed-ex-prensa')).toBe(false) // la semilla local sobrante se retira
  })

  it('la semilla local nunca se elige como canónica frente a una fila real con su nombre', () => {
    const rows: MergeRows = { ...EMPTY, exercises: [ex('seed-ex-prensa', 'Prensa de piernas'), ex('zzz', 'Prensa de piernas', { updatedAt: 9 })] }
    const m = planMerge(rows, 5)
    expect(m.exercises).toEqual([]) // no se borra ninguna fila: la semilla la retira planSeed en local
  })

  it('si el catálogo cambia (ejercicio retirado o renombrado) no quedan referencias colgantes', () => {
    const synced = ensureSeedPure({ ...EMPTY, setLogs: [log('l1', 'seed-ex-curl')] }, SEED, 1)
    const smaller: SeedRows = { ...SEED, exercises: [SEED.exercises[0]], templateExercises: [SEED.templateExercises[0]] }
    const afterRemoved = ensureSeedPure(synced, smaller, 2)
    expectNoDangling(afterRemoved)
    expect(afterRemoved.exercises.some((e) => e.id === 'seed-ex-curl')).toBe(true) // la fila local sigue ahí

    // Renombrado en el catálogo con el mismo id: la semilla sin editar se refresca y las series siguen apuntando bien.
    const renamed: SeedRows = { ...SEED, exercises: [ex('seed-ex-prensa', 'Prensa 45°'), SEED.exercises[1]] }
    const afterRename = ensureSeedPure(synced, renamed, 3)
    expectNoDangling(afterRename)
    expect(afterRename.exercises.find((e) => e.id === 'seed-ex-prensa')!.name).toBe('Prensa 45°')
  })

  it('la secuencia completa es idempotente y converge con otro orden de pull', () => {
    const rows: MergeRows = {
      ...EMPTY,
      exercises: [ex('b', 'Curl de bíceps', { updatedAt: 9 }), ex('a', 'Curl de bíceps', { updatedAt: 9 }), ex('seed-ex-prensa', 'Prensa de piernas')],
      setLogs: [log('l1', 'b'), log('l2', 'a')],
    }
    const once = ensureSeedPure(rows, SEED, 10)
    expectNoDangling(once)
    const again = ensureSeedPure(once, SEED, 20)
    expect(JSON.stringify(again)).toBe(JSON.stringify(once))
    const reversed = ensureSeedPure({ ...rows, exercises: [...rows.exercises].reverse() }, SEED, 10)
    const ids = (r: MergeRows) => r.exercises.map((e) => [e.id, !!e.deletedAt]).sort()
    expect(ids(reversed)).toEqual(ids(once))
  })
})
