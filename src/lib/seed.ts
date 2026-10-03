import { alive, db, save } from '../db/db'
import type { MuscleGroup } from './types'

type Seed = [name: string, primary: MuscleGroup, secondary: MuscleGroup[], equipment: string]

// Solo máquinas guiadas / poleas. Orden pensado para fuerza + gasto calórico:
// primero los multiarticulares grandes (piernas, pecho), luego aislamiento.
const SEED: Seed[] = [
  // Piernas (mayor gasto calórico)
  ['Prensa de piernas', 'cuadriceps', ['gluteo'], 'Máquina'],
  ['Hack squat', 'cuadriceps', ['gluteo'], 'Máquina'],
  ['Sentadilla en multipower', 'cuadriceps', ['gluteo', 'core'], 'Multipower'],
  ['Extensión de cuádriceps', 'cuadriceps', [], 'Máquina'],
  ['Curl femoral tumbado', 'isquios', [], 'Máquina'],
  ['Curl femoral sentado', 'isquios', [], 'Máquina'],
  ['Abductores en máquina', 'gluteo', [], 'Máquina'],
  ['Aductores en máquina', 'cuadriceps', [], 'Máquina'],
  ['Patada de glúteo en máquina', 'gluteo', ['isquios'], 'Máquina'],
  ['Hip thrust en máquina', 'gluteo', ['isquios'], 'Máquina'],
  ['Elevación de gemelos sentado', 'gemelo', [], 'Máquina'],
  ['Elevación de gemelos en prensa', 'gemelo', [], 'Máquina'],

  // Pecho
  ['Press de pecho en máquina', 'pecho', ['triceps', 'hombro'], 'Máquina'],
  ['Press inclinado en máquina', 'pecho', ['hombro', 'triceps'], 'Máquina'],
  ['Press banca en multipower', 'pecho', ['triceps', 'hombro'], 'Multipower'],
  ['Peck deck (aperturas en máquina)', 'pecho', ['hombro'], 'Máquina'],
  ['Cruce de poleas', 'pecho', ['hombro'], 'Polea'],
  ['Fondos asistidos en máquina', 'pecho', ['triceps', 'hombro'], 'Máquina'],

  // Hombros
  ['Press de hombros en máquina', 'hombro', ['triceps'], 'Máquina'],
  ['Elevaciones laterales en máquina', 'hombro', [], 'Máquina'],
  ['Elevaciones laterales en polea', 'hombro', [], 'Polea'],
  ['Pájaros en peck deck (deltoides posterior)', 'hombro', ['espalda'], 'Máquina'],
  ['Face pull en polea', 'hombro', ['espalda'], 'Polea'],

  // Brazos
  ['Curl de bíceps en máquina', 'biceps', ['antebrazo'], 'Máquina'],
  ['Curl de bíceps en polea', 'biceps', ['antebrazo'], 'Polea'],
  ['Curl en banco Scott (máquina)', 'biceps', [], 'Máquina'],
  ['Extensión de tríceps en polea (cuerda)', 'triceps', [], 'Polea'],
  ['Extensión de tríceps en máquina', 'triceps', [], 'Máquina'],
  ['Press de tríceps en máquina (fondos)', 'triceps', ['pecho'], 'Máquina'],

  // Espalda (equilibrio del empuje)
  ['Jalón al pecho', 'espalda', ['biceps'], 'Polea'],
  ['Remo sentado en máquina', 'espalda', ['biceps'], 'Máquina'],
  ['Remo en polea baja', 'espalda', ['biceps'], 'Polea'],
  ['Dominadas asistidas en máquina', 'espalda', ['biceps'], 'Máquina'],

  // Core
  ['Crunch en máquina', 'core', [], 'Máquina'],
  ['Crunch en polea', 'core', [], 'Polea'],
]

/** Importa los ejercicios que aún no existan (por nombre). Devuelve cuántos añadió. */
export async function seedExercises(): Promise<number> {
  const existing = new Set(
    (await db.exercises.filter(alive).toArray()).map((e) => e.name.trim().toLowerCase()),
  )
  let added = 0
  for (const [name, primaryMuscle, secondaryMuscles, equipment] of SEED) {
    if (existing.has(name.toLowerCase())) continue
    await save('exercises', { name, primaryMuscle, secondaryMuscles, equipment, notes: '' })
    added++
  }
  return added
}

// [ejercicio, series, repeticiones, descanso en s]. Series de 12-15 reps y descansos cortos
// para mantener el pulso alto (objetivo: gasto calórico con fuerza).
type TemplateSeed = { name: string; items: [exercise: string, sets: number, reps: number, restS: number][] }

const TEMPLATES: TemplateSeed[] = [
  {
    name: 'Día A · Piernas + Hombros',
    items: [
      ['Prensa de piernas', 4, 12, 60],
      ['Hack squat', 3, 12, 60],
      ['Extensión de cuádriceps', 3, 15, 45],
      ['Curl femoral tumbado', 3, 12, 45],
      ['Hip thrust en máquina', 3, 12, 60],
      ['Elevación de gemelos sentado', 3, 15, 45],
      ['Press de hombros en máquina', 3, 12, 60],
      ['Elevaciones laterales en máquina', 3, 15, 45],
      ['Pájaros en peck deck (deltoides posterior)', 3, 15, 45],
    ],
  },
  {
    name: 'Día B · Pecho + Brazos',
    items: [
      ['Press de pecho en máquina', 4, 12, 60],
      ['Press inclinado en máquina', 3, 12, 60],
      ['Peck deck (aperturas en máquina)', 3, 15, 45],
      ['Cruce de poleas', 3, 15, 45],
      ['Curl de bíceps en máquina', 3, 12, 45],
      ['Curl de bíceps en polea', 3, 15, 45],
      ['Extensión de tríceps en polea (cuerda)', 3, 12, 45],
      ['Extensión de tríceps en máquina', 3, 15, 45],
      ['Crunch en máquina', 3, 15, 30],
    ],
  },
]

/** Crea las rutinas de ejemplo (importando antes los ejercicios que falten). */
export async function seedTemplates(): Promise<number> {
  await seedExercises()
  const byName = new Map((await db.exercises.filter(alive).toArray()).map((e) => [e.name, e.id]))
  const existing = new Set((await db.workoutTemplates.filter(alive).toArray()).map((t) => t.name))
  let added = 0
  for (const t of TEMPLATES) {
    if (existing.has(t.name)) continue
    const tpl = await save('workoutTemplates', { name: t.name })
    let position = 0
    for (const [ex, targetSets, targetReps, restS] of t.items) {
      const exerciseId = byName.get(ex)
      if (!exerciseId) continue
      await save('templateExercises', {
        templateId: tpl.id, exerciseId, position: position++, targetSets, targetReps, targetWeightKg: 20, restS,
      })
    }
    added++
  }
  return added
}
