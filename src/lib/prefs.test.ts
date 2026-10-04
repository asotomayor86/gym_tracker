import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { alive, db } from '../db/db'
import { addSetToSession } from './order'
import { bindPrefsToDb, getPrefs, normalizePrefs, setPrefs } from './prefs'
import { startSession } from './session'

describe('la app trabaja solo en kilogramos', () => {
  it('normalizePrefs fuerza kg y valida el resto (cualquier origen: localStorage, sync, clientes antiguos)', () => {
    expect(normalizePrefs({ unit: 'lb', incrementKg: 5, gymId: 'g1' })).toEqual({ unit: 'kg', incrementKg: 5, gymId: 'g1' })
    expect(normalizePrefs({ unit: 'lb' })).toEqual({ unit: 'kg', incrementKg: 2.5, gymId: null })
    expect(normalizePrefs({ incrementKg: -1, gymId: 3 })).toEqual({ unit: 'kg', incrementKg: 2.5, gymId: null })
    expect(normalizePrefs({ incrementKg: 'x', gymId: '' })).toEqual({ unit: 'kg', incrementKg: 2.5, gymId: null })
    for (const junk of [null, undefined, 5, 'lb', []]) expect(normalizePrefs(junk).unit).toBe('kg')
  })

  it('setPrefs no admite otra unidad pero sí cambia el resto', () => {
    setPrefs({ unit: 'lb', incrementKg: 1.25 } as never)
    expect(getPrefs()).toEqual({ unit: 'kg', incrementKg: 1.25, gymId: null })
    setPrefs({ incrementKg: 2.5 })
  })

  it('un user_prefs con "lb" que llega por sync (cliente antiguo) se ignora; el resto sí se aplica; y lo que se escribe lleva kg', async () => {
    bindPrefsToDb(db)
    await db.userPrefs.put({ id: 'prefs', unit: 'lb', incrementKg: 5, gymId: 'gym-forus', updatedAt: 10, deletedAt: null })
    await vi.waitFor(() => expect(getPrefs()).toEqual({ unit: 'kg', incrementKg: 5, gymId: 'gym-forus' }))
    setPrefs({ gymId: null })
    await vi.waitFor(async () => expect(await db.userPrefs.get('prefs')).toMatchObject({ unit: 'kg', incrementKg: 5, gymId: null }))
  })
})

describe('las series nuevas se guardan en kg sin conversiones', () => {
  beforeEach(async () => {
    await Promise.all([db.setLogs.clear(), db.sessions.clear(), db.templateExercises.clear(), db.workoutTemplates.clear(), db.outbox.clear()])
  })

  it('startSession: inputUnit kg e inputWeight = peso en kg redondeado a 0,5, aunque hubiera "lb" en las preferencias', async () => {
    setPrefs({ unit: 'lb' } as never)
    await db.workoutTemplates.put({ id: 't1', name: 'Rutina', updatedAt: 1, deletedAt: null })
    await db.templateExercises.bulkPut([
      { id: 'a', templateId: 't1', exerciseId: 'e1', position: 0, targetSets: 2, targetReps: 10, targetWeightKg: 52.3, restS: 60, updatedAt: 1, deletedAt: null },
      { id: 'b', templateId: 't1', exerciseId: 'e2', position: 1, targetSets: 1, targetReps: 12, targetWeightKg: 20, restS: 60, updatedAt: 1, deletedAt: null },
    ])
    const sid = await startSession('t1')
    const logs = (await db.setLogs.where('sessionId').equals(sid).toArray()).sort((x, y) => x.exerciseOrder - y.exerciseOrder || x.setIndex - y.setIndex)
    expect(logs.map((l) => [l.exerciseId, l.weightKg, l.inputUnit, l.inputWeight])).toEqual([
      ['e1', 52.3, 'kg', 52.5], ['e1', 52.3, 'kg', 52.5], ['e2', 20, 'kg', 20],
    ])
  })

  it('addSetToSession: kg siempre (el parámetro de unidad se ignora)', async () => {
    const log = await addSetToSession('s1', 'e1', 'lb')
    expect(log).toMatchObject({ inputUnit: 'kg', weightKg: 20, inputWeight: 20 })
    const next = await addSetToSession('s1', 'e1', 'lb')
    expect(next).toMatchObject({ inputUnit: 'kg', setIndex: 1 })
    expect((await db.setLogs.filter(alive).toArray()).every((l) => l.inputUnit === 'kg' && l.inputWeight === l.weightKg)).toBe(true)
  })
})
