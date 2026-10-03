import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { GymDB } from '../db/db'
import { addSetToSession, planExerciseOrderBackfill, reorderSessionExercises, reorderTemplateExercises, sessionExerciseIds } from './order'
import type { SetLog, TemplateExercise } from './types'

let n = 0
const device = () => new GymDB(`order-${n++}`, { indexedDB, IDBKeyRange })
const mkLog = (id: string, sessionId: string, exerciseId: string, p: Partial<SetLog> = {}): SetLog =>
  ({ id, sessionId, exerciseId, setIndex: 0, exerciseOrder: 0, reps: 10, weightKg: 20, inputUnit: 'kg', inputWeight: 20, effort: null, completedAt: null, updatedAt: 100, deletedAt: null, ...p })
const mkTe = (id: string, templateId: string, exerciseId: string, position: number): TemplateExercise =>
  ({ id, templateId, exerciseId, position, targetSets: 3, targetReps: 12, targetWeightKg: 20, restS: 60, updatedAt: 100, deletedAt: null })

describe('orden de ejercicios en la sesión', () => {
  it('los ejercicios añadidos a mano quedan en orden de alta, no alfabético', async () => {
    const d = device()
    for (const eid of ['zeta', 'alfa', 'zeta', 'medio']) await addSetToSession('s1', eid, 'kg', d)
    const logs = await d.setLogs.toArray()
    expect(sessionExerciseIds(logs)).toEqual(['zeta', 'alfa', 'medio'])
    expect(logs.filter((l) => l.exerciseId === 'zeta').map((l) => l.exerciseOrder)).toEqual([0, 0])
    expect(logs.find((l) => l.exerciseId === 'medio')!.exerciseOrder).toBe(2)
  })

  it('reorderSessionExercises reescribe 0..n-1, encola solo lo que cambia y es estable', async () => {
    const d = device()
    for (const eid of ['a', 'b', 'c']) await addSetToSession('s1', eid, 'kg', d)
    await d.outbox.clear()
    await reorderSessionExercises('s1', ['c', 'a', 'b'], d)
    const logs = await d.setLogs.toArray()
    expect(sessionExerciseIds(logs)).toEqual(['c', 'a', 'b'])
    expect(logs.map((l) => [l.exerciseId, l.exerciseOrder]).sort()).toEqual([['a', 1], ['b', 2], ['c', 0]])
    expect(await d.outbox.count()).toBe(3)
    await d.outbox.clear()
    await reorderSessionExercises('s1', ['c', 'a', 'b'], d)
    expect(await d.outbox.count()).toBe(0)
  })

  it('reorderTemplateExercises reescribe position consecutivas', async () => {
    const d = device()
    for (const r of [mkTe('t1', 'T', 'a', 0), mkTe('t2', 'T', 'b', 1), mkTe('t3', 'T', 'c', 5)]) await d.templateExercises.put(r)
    await reorderTemplateExercises('T', ['t3', 't1'], d)
    const rows = (await d.templateExercises.toArray()).sort((a, b) => a.position - b.position)
    expect(rows.map((r) => [r.id, r.position])).toEqual([['t3', 0], ['t1', 1], ['t2', 2]])
  })
})

describe('planExerciseOrderBackfill', () => {
  const rows = [mkTe('t1', 'T', 'prensa', 0), mkTe('t2', 'T', 'hack', 1), mkTe('t3', 'T', 'curl', 2)]

  it('ordena como la rutina y luego por primer registro', () => {
    const logs = [
      mkLog('1', 's', 'extra', { completedAt: 10 }), mkLog('2', 's', 'curl', { completedAt: 30 }),
      mkLog('3', 's', 'prensa', { completedAt: 40 }), mkLog('4', 's', 'extra2', { completedAt: 5 }),
    ]
    const out = planExerciseOrderBackfill(logs, new Map([['s', 'T']]), rows)
    const all = logs.map((l) => out.find((o) => o.id === l.id) ?? l)
    expect(sessionExerciseIds(all)).toEqual(['prensa', 'curl', 'extra2', 'extra'])
  })

  it('es idempotente y no toca sesiones con un solo ejercicio', () => {
    const logs = [mkLog('1', 's', 'a'), mkLog('2', 's', 'b'), mkLog('3', 'solo', 'a')]
    const first = planExerciseOrderBackfill(logs, new Map(), [])
    const applied = logs.map((l) => first.find((f) => f.id === l.id) ?? l)
    expect(planExerciseOrderBackfill(applied, new Map(), [])).toEqual([])
    expect(first.every((l) => l.sessionId === 's')).toBe(true)
  })
})
