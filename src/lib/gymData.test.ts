import { describe, expect, it } from 'vitest'
import { availabilityOf, availabilityRows, AVAILABILITY, GYMS } from './gymData'
import { buildSeedRows } from './seed'

describe('gymData', () => {
  const exerciseIds = new Set(buildSeedRows().exercises.map((e) => e.id))
  const gymIds = new Set(GYMS.map((g) => g.id))

  it('hay un gimnasio, Forus, con id estable', () => {
    expect(GYMS).toEqual([{ id: 'gym-forus', name: 'Forus' }])
    expect(gymIds.size).toBe(GYMS.length)
  })

  it('todas las filas apuntan a ejercicios de la semilla y a gimnasios existentes', () => {
    for (const [exerciseId, byGym] of Object.entries(AVAILABILITY)) {
      expect(exerciseIds.has(exerciseId), exerciseId).toBe(true)
      for (const [gymId, v] of Object.entries(byGym)) {
        expect(gymIds.has(gymId), `${exerciseId}:${gymId}`).toBe(true)
        expect(typeof v).toBe('boolean')
      }
    }
  })

  it('solo hay filas verificadas: 23 sí y 16 no, y ningún ejercicio del catálogo queda sin verificar', () => {
    const rows = availabilityRows()
    expect(rows.filter((r) => r.available).length).toBe(23)
    expect(rows.filter((r) => !r.available).length).toBe(16)
    expect(new Set(rows.map((r) => `${r.exerciseId}:${r.gymId}`)).size).toBe(rows.length)
    expect(availabilityOf('seed-ex-abductores-en-maquina', 'gym-forus')).toBe(true)
    expect(availabilityOf('seed-ex-aductores-en-maquina', 'gym-forus')).toBe(true)
    expect(availabilityOf('seed-ex-elevacion-de-gemelos-en-prensa', 'gym-forus')).toBe(true)
    // los sin verificar son exactamente los ejercicios del catálogo sin fila
    const sinFila = [...exerciseIds].filter((id) => !AVAILABILITY[id]).sort()
    expect(sinFila).toEqual([])
  })

  it('casos de referencia', () => {
    expect(availabilityOf('seed-ex-prensa-de-piernas', 'gym-forus')).toBe(true)
    expect(availabilityOf('seed-ex-hack-squat', 'gym-forus')).toBe(false)
    expect(availabilityOf('seed-ex-extension-lumbar-en-maquina', 'gym-forus')).toBe(true)
    expect(availabilityOf('seed-ex-prensa-de-piernas', 'gym-otro')).toBeUndefined()
  })
})
