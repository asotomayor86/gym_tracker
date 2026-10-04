import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { alive, GymDB, saveTo } from '../db/db'
import { createTemplateFromSession, defaultTemplateName, targetsFromLogs } from './templateFromSession'
import type { SetLog } from './types'

let n = 0
const device = () => new GymDB(`tfs-${n++}`, { indexedDB, IDBKeyRange })

const mkLog = (p: Partial<SetLog> & { exerciseId: string; setIndex: number }): SetLog => ({
  id: crypto.randomUUID(), sessionId: 's1', exerciseOrder: 0, reps: 10, weightKg: 20, inputUnit: 'kg', inputWeight: 20,
  effort: 'hard_done', completedAt: 1000 + p.setIndex, updatedAt: 1, deletedAt: null, ...p,
})

async function seed(d: GymDB, exercises: string[]) {
  for (const id of exercises) await d.exercises.put({ id, name: `Ej ${id}`, primaryMuscle: 'pecho', secondaryMuscles: [], equipment: '', notes: '', updatedAt: 5, deletedAt: null })
  await d.sessions.put({ id: 's1', templateId: null, startedAt: new Date(2026, 9, 4, 12).getTime(), endedAt: 2, notes: '', updatedAt: 1, deletedAt: null })
}

describe('targetsFromLogs', () => {
  it('series completadas, reps de la última y mayor peso (sin contar los fallos si hay otras)', () => {
    const t = targetsFromLogs([
      mkLog({ exerciseId: 'a', setIndex: 0, reps: 12, weightKg: 50 }),
      mkLog({ exerciseId: 'a', setIndex: 1, reps: 10, weightKg: 60 }),
      mkLog({ exerciseId: 'a', setIndex: 2, reps: 6, weightKg: 70, effort: 'failed' }),
      mkLog({ exerciseId: 'a', setIndex: 3, reps: 15, weightKg: 99, effort: null, completedAt: null }), // sin completar: no cuenta
    ])
    expect(t).toEqual({ sets: 3, reps: 6, weightKg: 60 })
  })

  it('si todas las completadas fallaron usa el mayor de ellas; sin completadas usa todas las series', () => {
    expect(targetsFromLogs([mkLog({ exerciseId: 'a', setIndex: 0, weightKg: 40, effort: 'failed' }), mkLog({ exerciseId: 'a', setIndex: 1, weightKg: 45, effort: 'failed' })]).weightKg).toBe(45)
    const none = targetsFromLogs([
      mkLog({ exerciseId: 'a', setIndex: 0, reps: 8, weightKg: 30, effort: null, completedAt: null }),
      mkLog({ exerciseId: 'a', setIndex: 1, reps: 9, weightKg: 35, effort: null, completedAt: null }),
    ])
    expect(none).toEqual({ sets: 2, reps: 9, weightKg: 35 })
  })
})

describe('createTemplateFromSession', () => {
  it('copia los ejercicios en el orden de la sesión con objetivos sacados de lo hecho, y encola todo', async () => {
    const d = device()
    await seed(d, ['a', 'b', 'c'])
    for (const l of [
      mkLog({ exerciseId: 'b', setIndex: 0, exerciseOrder: 0, weightKg: 30 }), mkLog({ exerciseId: 'b', setIndex: 1, exerciseOrder: 0, weightKg: 32.5, reps: 8 }),
      mkLog({ exerciseId: 'a', setIndex: 0, exerciseOrder: 1, weightKg: 80 }),
      mkLog({ exerciseId: 'c', setIndex: 0, exerciseOrder: 2, weightKg: 15 }), mkLog({ exerciseId: 'c', setIndex: 1, exerciseOrder: 2, weightKg: 15, effort: null, completedAt: null }),
    ]) await d.setLogs.put(l)
    await d.outbox.clear()

    const id = await createTemplateFromSession('s1', '  Mi día  ', d)
    expect(await d.workoutTemplates.get(id)).toMatchObject({ name: 'Mi día', deletedAt: null })
    const rows = (await d.templateExercises.where('templateId').equals(id).toArray()).sort((x, y) => x.position - y.position)
    expect(rows.map((r) => [r.exerciseId, r.position, r.targetSets, r.targetReps, r.targetWeightKg, r.restS])).toEqual([
      ['b', 0, 2, 8, 32.5, 90], ['a', 1, 1, 10, 80, 90], ['c', 2, 1, 10, 15, 90],
    ])
    expect(await d.outbox.count()).toBe(1 + 3) // la rutina y sus 3 filas se sincronizan
  })

  it('usa el descanso de la rutina de origen y, sin exerciseOrder, el orden de esa rutina y luego el primer registro', async () => {
    const d = device()
    await seed(d, ['a', 'b', 'c'])
    await d.sessions.put({ id: 's1', templateId: 'src', startedAt: 1, endedAt: 2, notes: '', updatedAt: 1, deletedAt: null })
    await d.templateExercises.bulkPut([
      { id: 't1', templateId: 'src', exerciseId: 'c', position: 0, targetSets: 3, targetReps: 12, targetWeightKg: 20, restS: 45, updatedAt: 1, deletedAt: null },
      { id: 't2', templateId: 'src', exerciseId: 'a', position: 1, targetSets: 3, targetReps: 12, targetWeightKg: 20, restS: 120, updatedAt: 1, deletedAt: null },
    ])
    // Series antiguas: todas con exerciseOrder 0; 'b' no está en la rutina de origen.
    for (const l of [mkLog({ exerciseId: 'a', setIndex: 0, completedAt: 300 }), mkLog({ exerciseId: 'b', setIndex: 0, completedAt: 100 }), mkLog({ exerciseId: 'c', setIndex: 0, completedAt: 200 })]) await d.setLogs.put(l)
    const id = await createTemplateFromSession('s1', '', d)
    const rows = (await d.templateExercises.where('templateId').equals(id).toArray()).sort((x, y) => x.position - y.position)
    expect(rows.map((r) => [r.exerciseId, r.restS])).toEqual([['c', 45], ['a', 120], ['b', 90]])
    expect((await d.workoutTemplates.get(id))!.name).toBe(defaultTemplateName(1)) // nombre vacío → 'Rutina del …'
  })

  it('sesión sin series completadas: usa todas las series', async () => {
    const d = device()
    await seed(d, ['a'])
    for (const i of [0, 1, 2]) await d.setLogs.put(mkLog({ exerciseId: 'a', setIndex: i, effort: null, completedAt: null, weightKg: 25 + i, reps: 12 }))
    const id = await createTemplateFromSession('s1', 'Plan', d)
    expect(await d.templateExercises.where('templateId').equals(id).first()).toMatchObject({ targetSets: 3, targetReps: 12, targetWeightKg: 27 })
  })

  it('salta ejercicios borrados o inexistentes del catálogo y no crea nada si no queda ninguno', async () => {
    const d = device()
    await seed(d, ['a', 'b'])
    await saveTo(d, 'exercises', { ...(await d.exercises.get('b'))!, deletedAt: Date.now() })
    for (const l of [mkLog({ exerciseId: 'a', setIndex: 0, exerciseOrder: 0 }), mkLog({ exerciseId: 'b', setIndex: 0, exerciseOrder: 1 }), mkLog({ exerciseId: 'fantasma', setIndex: 0, exerciseOrder: 2 })]) await d.setLogs.put(l)
    const id = await createTemplateFromSession('s1', 'X', d)
    expect((await d.templateExercises.where('templateId').equals(id).toArray()).map((r) => r.exerciseId)).toEqual(['a'])

    const e = device()
    await seed(e, [])
    await e.setLogs.put(mkLog({ exerciseId: 'nada', setIndex: 0 }))
    await expect(createTemplateFromSession('s1', 'Y', e)).rejects.toThrow(RangeError)
    expect(await e.workoutTemplates.count()).toBe(0)
    await expect(createTemplateFromSession('no-existe', 'Z', e)).rejects.toThrow(RangeError)
  })

  it('cada llamada crea una rutina nueva y la sesión original no se toca; ignora series borradas', async () => {
    const d = device()
    await seed(d, ['a'])
    await d.setLogs.bulkPut([mkLog({ exerciseId: 'a', setIndex: 0 }), mkLog({ exerciseId: 'a', setIndex: 1, deletedAt: 9 })])
    const [t1, t2] = [await createTemplateFromSession('s1', 'A', d), await createTemplateFromSession('s1', 'A', d)]
    expect(t1).not.toBe(t2)
    expect((await d.templateExercises.where('templateId').equals(t1).first())!.targetSets).toBe(1) // la serie borrada no cuenta
    expect(await d.workoutTemplates.filter(alive).count()).toBe(2)
    expect((await d.setLogs.toArray()).length).toBe(2)
  })

  it('recorta el nombre a 80 caracteres', async () => {
    const d = device()
    await seed(d, ['a'])
    await d.setLogs.put(mkLog({ exerciseId: 'a', setIndex: 0 }))
    const id = await createTemplateFromSession('s1', 'x'.repeat(200), d)
    expect((await d.workoutTemplates.get(id))!.name).toHaveLength(80)
  })
})
