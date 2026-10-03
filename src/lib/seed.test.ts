import { describe, expect, it } from 'vitest'
import { findGuide } from './exerciseGuides'
import { MUSCLE_ID_GROUP } from './guideTypes'
import { buildSeedRows, slugify } from './seed'

describe('buildSeedRows', () => {
  const rows = buildSeedRows()

  it('es pura y determinista', () => {
    expect(buildSeedRows()).toEqual(rows)
  })

  it('IDs únicos, con prefijo y estables', () => {
    for (const list of [rows.exercises, rows.workoutTemplates, rows.templateExercises]) {
      const ids = list.map((r) => r.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
    expect(rows.exercises.every((e) => /^seed-ex-[a-z0-9-]+$/.test(e.id))).toBe(true)
    expect(rows.workoutTemplates.every((r) => /^seed-tpl-[a-z0-9-]+$/.test(r.id))).toBe(true)
    expect(rows.templateExercises.every((r) => /^seed-te-[a-z0-9-]+-\d+$/.test(r.id))).toBe(true)
    // IDs de referencia: no deben cambiar nunca entre versiones
    expect(rows.exercises.find((e) => e.name === 'Prensa de piernas')?.id).toBe('seed-ex-prensa-de-piernas')
    expect(rows.exercises.find((e) => e.name === 'Pájaros en peck deck (deltoides posterior)')?.id).toBe(
      'seed-ex-pajaros-en-peck-deck-deltoides-posterior',
    )
    expect(rows.workoutTemplates.map((r) => r.id)).toEqual([
      'seed-tpl-dia-a-piernas-hombros',
      'seed-tpl-dia-b-pecho-brazos',
    ])
    expect(rows.templateExercises[0].id).toBe('seed-te-dia-a-piernas-hombros-0')
  })

  it('filas completas: updatedAt 1, sin borrar y con todos los campos', () => {
    for (const r of [...rows.exercises, ...rows.workoutTemplates, ...rows.templateExercises]) {
      expect(r.updatedAt).toBe(1)
      expect(r.deletedAt).toBeNull()
    }
    for (const e of rows.exercises) {
      expect(e.name.length).toBeGreaterThan(0)
      expect(typeof e.primaryMuscle).toBe('string')
      expect(Array.isArray(e.secondaryMuscles)).toBe(true)
      expect(e.notes).toBe('')
    }
    for (const te of rows.templateExercises) {
      expect(te.targetSets).toBeGreaterThan(0)
      expect(te.targetReps).toBeGreaterThan(0)
      expect(te.restS).toBeGreaterThan(0)
      expect(te.targetWeightKg).toBe(20)
    }
  })

  it('cada ejercicio de rutina existe y las posiciones son 0..n-1 por rutina', () => {
    const exIds = new Set(rows.exercises.map((e) => e.id))
    const tplIds = new Set(rows.workoutTemplates.map((r) => r.id))
    for (const te of rows.templateExercises) {
      expect(exIds.has(te.exerciseId), te.id).toBe(true)
      expect(tplIds.has(te.templateId), te.id).toBe(true)
    }
    for (const tpl of rows.workoutTemplates) {
      const pos = rows.templateExercises.filter((te) => te.templateId === tpl.id).map((te) => te.position)
      expect(pos).toEqual(pos.map((_, i) => i))
    }
  })

  it('cada ejercicio de seed tiene ficha', () => {
    for (const e of rows.exercises) expect(findGuide(e.name), e.name).toBeDefined()
  })
})

describe('slugify', () => {
  it('quita tildes y signos', () => {
    expect(slugify('Día A · Piernas + Hombros')).toBe('dia-a-piernas-hombros')
    expect(slugify('Peck deck (aperturas en máquina)')).toBe('peck-deck-aperturas-en-maquina')
  })
})

describe('aductores', () => {
  it('Aductores en máquina es del grupo aductores y conserva su ID', () => {
    const e = buildSeedRows().exercises.find((x) => x.name === 'Aductores en máquina')
    expect(e?.id).toBe('seed-ex-aductores-en-maquina')
    expect(e?.primaryMuscle).toBe('aductores')
    expect(findGuide('Aductores en máquina')?.primary).toEqual(['aductores'])
    expect(MUSCLE_ID_GROUP.add).toBe('aductores')
  })
})
