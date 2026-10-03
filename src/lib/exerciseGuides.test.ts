import { describe, expect, it } from 'vitest'
import { GUIDES, findGuide } from './exerciseGuides'
import { SEED } from './seed'
import { MUSCLE_GROUPS } from './types'

describe('exerciseGuides', () => {
  it('hay una ficha por cada ejercicio del seed, y viceversa', () => {
    const seedNames = SEED.map(([n]) => n).sort()
    expect(GUIDES.map((x) => x.key).sort()).toEqual(seedNames)
  })

  it('findGuide ignora mayúsculas y tildes', () => {
    expect(findGuide('PRENSA DE PIERNAS')?.key).toBe('Prensa de piernas')
    expect(findGuide('curl de biceps en maquina')?.key).toBe('Curl de bíceps en máquina')
    expect(findGuide('no existe')).toBeUndefined()
  })

  it('cada ficha es coherente', () => {
    for (const x of GUIDES) {
      expect(x.primary.length, x.key).toBeGreaterThan(0)
      for (const m of [...x.primary, ...x.secondary]) expect(MUSCLE_GROUPS, x.key).toContain(m)
      expect(x.setup.length, x.key).toBeGreaterThan(0)
      expect(x.execution.length, x.key).toBeGreaterThan(0)
      expect(x.mistakes.length, x.key).toBeGreaterThan(0)
      expect(x.tips.length, x.key).toBeGreaterThan(0)
      for (const p of [x.diagram.from, x.diagram.to]) for (const v of p) expect(v >= 0 && v <= 1, x.key).toBe(true)
      expect(x.diagram.backAngle >= 0 && x.diagram.backAngle <= 90, x.key).toBe(true)
    }
  })

  it('el grupo principal de la ficha coincide con el del seed', () => {
    for (const [name, primary] of SEED) expect(findGuide(name)?.primary, name).toContain(primary)
  })
})
