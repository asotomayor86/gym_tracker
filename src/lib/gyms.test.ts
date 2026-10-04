import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { GymDB } from '../db/db'
import { availabilityFor, availabilityIndex, exerciseGymId, removeGym, saveGym, seedGyms, setAvailability, sortGyms } from './gyms'
import { AVAILABILITY, GYMS } from './gymData'
import type { ExerciseGym } from './types'

let n = 0
const device = () => new GymDB(`gyms-${n++}`, { indexedDB, IDBKeyRange })
const row = (exerciseId: string, gymId: string, available: boolean, deletedAt: number | null = null): ExerciseGym =>
  ({ id: exerciseGymId(exerciseId, gymId), exerciseId, gymId, available, updatedAt: 5, deletedAt })

describe('availabilityFor', () => {
  const rows = [row('a', 'g', true), row('b', 'g', false), row('c', 'g', true, 9)]
  it('sin gimnasio no filtra nada', () => {
    expect(availabilityFor(null, 'b', rows)).toBe('available')
    expect(availabilityFor(undefined, 'b', rows)).toBe('available')
  })
  it('disponible, no disponible y sin verificar (sin fila o fila borrada)', () => {
    expect(availabilityFor('g', 'a', rows)).toBe('available')
    expect(availabilityFor('g', 'b', rows)).toBe('unavailable')
    expect(availabilityFor('g', 'zzz', rows)).toBe('unverified')
    expect(availabilityFor('g', 'c', rows)).toBe('unverified')
    expect(availabilityFor('otro-gym', 'a', rows)).toBe('unverified')
  })
  it('availabilityIndex da lo mismo que availabilityFor', () => {
    const idx = availabilityIndex('g', rows)
    for (const e of ['a', 'b', 'c', 'zzz']) expect(idx(e)).toBe(availabilityFor('g', e, rows))
    expect(availabilityIndex(null, rows)('b')).toBe('available')
  })
})

describe('edición del catálogo', () => {
  it('saveGym valida el nombre y conserva notas/orden al editar; sortGyms ordena y oculta borrados', async () => {
    const d = device()
    await expect(saveGym({ name: '  ' }, d)).rejects.toThrow(RangeError)
    const a = await saveGym({ name: 'Forus', notes: 'centro' }, d)
    const b = await saveGym({ name: 'Basic-Fit' }, d)
    expect([a.sort, b.sort]).toEqual([0, 1])
    await saveGym({ id: a.id, name: 'Forus Sur' }, d)
    expect(await d.gyms.get(a.id)).toMatchObject({ name: 'Forus Sur', notes: 'centro', sort: 0 })
    expect(sortGyms(await d.gyms.toArray()).map((g) => g.name)).toEqual(['Forus Sur', 'Basic-Fit'])
  })

  it('setAvailability marca, cambia y quita (null = sin verificar, borrado lógico)', async () => {
    const d = device()
    await setAvailability('e1', 'g1', true, d)
    await setAvailability('e1', 'g1', false, d)
    expect(await d.exerciseGyms.count()).toBe(1)
    expect(availabilityFor('g1', 'e1', await d.exerciseGyms.toArray())).toBe('unavailable')
    await setAvailability('e1', 'g1', null, d)
    expect(availabilityFor('g1', 'e1', await d.exerciseGyms.toArray())).toBe('unverified')
    await setAvailability('nunca', 'g1', null, d) // quitar lo que no existe no falla ni crea nada
    expect(await d.exerciseGyms.count()).toBe(1)
    await setAvailability('e1', 'g1', true, d) // se puede volver a marcar
    expect(availabilityFor('g1', 'e1', await d.exerciseGyms.toArray())).toBe('available')
  })

  it('removeGym borra el gimnasio y sus marcas (lógico) y lo encola', async () => {
    const d = device()
    const g = await saveGym({ name: 'Forus' }, d)
    await setAvailability('e1', g.id, true, d)
    await setAvailability('e2', 'otro', true, d)
    await d.outbox.clear()
    await removeGym(g.id, d)
    expect(sortGyms(await d.gyms.toArray())).toEqual([])
    expect(availabilityFor(g.id, 'e1', await d.exerciseGyms.toArray())).toBe('unverified')
    expect(availabilityFor('otro', 'e2', await d.exerciseGyms.toArray())).toBe('available')
    expect(await d.outbox.count()).toBe(2)
  })
})

describe('seedGyms (primer arranque sin red)', () => {
  it('siembra gimnasios y disponibilidad sin encolar y es idempotente; no resucita lo borrado ni pisa lo real', async () => {
    const d = device()
    await seedGyms(d)
    expect(await d.gyms.count()).toBe(GYMS.length)
    const expected = Object.values(AVAILABILITY).reduce((acc, byGym) => acc + Object.keys(byGym).length, 0)
    expect(await d.exerciseGyms.count()).toBe(expected)
    expect(await d.outbox.count()).toBe(0)
    await seedGyms(d)
    expect(await d.exerciseGyms.count()).toBe(expected)

    const id = Object.keys(AVAILABILITY)[0]
    await setAvailability(id, 'gym-forus', null, d) // el admin quita la marca: queda una fila borrada
    await seedGyms(d)
    expect(availabilityFor('gym-forus', id, await d.exerciseGyms.toArray())).toBe('unverified')
  })
})
