import type { SeedRows } from './seedPlan'
import type { Exercise, MuscleGroup, TemplateExercise, WorkoutTemplate } from './types'

export type { SeedRows }

type Seed = [name: string, primary: MuscleGroup, secondary: MuscleGroup[], equipment: string]

// Solo máquinas guiadas / poleas. Orden pensado para fuerza + gasto calórico:
// primero los multiarticulares grandes (piernas, pecho), luego aislamiento.
export const SEED: Seed[] = [
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

/**
 * Slugs antiguos de ejercicios o rutinas de seed renombrados: los IDs deben ser estables entre versiones,
 * así que si cambias un nombre, añade aquí `nombre nuevo → slug antiguo`.
 */
const SLUG_OVERRIDES: Record<string, string> = {}

/** Slug estable a partir del nombre: sin tildes, minúsculas, solo [a-z0-9] separados por guiones. */
export function slugify(name: string): string {
  return (
    SLUG_OVERRIDES[name] ??
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  )
}

export const seedExerciseId = (name: string) => `seed-ex-${slugify(name)}`
export const seedTemplateId = (name: string) => `seed-tpl-${slugify(name)}`
export const seedTemplateExerciseId = (templateName: string, position: number) =>
  `seed-te-${slugify(templateName)}-${position}`

/**
 * Filas completas del catálogo de ejemplo, con IDs deterministas y `updatedAt = 1` (cualquier edición del
 * usuario, con updatedAt = Date.now(), gana por LWW). Función pura: no toca la base de datos.
 */
export function buildSeedRows(): SeedRows {
  const exercises: Exercise[] = SEED.map(([name, primaryMuscle, secondaryMuscles, equipment]) => ({
    id: seedExerciseId(name),
    updatedAt: 1,
    deletedAt: null,
    name,
    primaryMuscle,
    secondaryMuscles: [...secondaryMuscles],
    equipment,
    notes: '',
  }))

  const workoutTemplates: WorkoutTemplate[] = []
  const templateExercises: TemplateExercise[] = []
  for (const t of TEMPLATES) {
    const templateId = seedTemplateId(t.name)
    workoutTemplates.push({ id: templateId, updatedAt: 1, deletedAt: null, name: t.name })
    t.items.forEach(([exercise, targetSets, targetReps, restS], position) => {
      templateExercises.push({
        id: seedTemplateExerciseId(t.name, position),
        updatedAt: 1,
        deletedAt: null,
        templateId,
        exerciseId: seedExerciseId(exercise),
        position,
        targetSets,
        targetReps,
        targetWeightKg: 20,
        restS,
      })
    })
  }
  return { exercises, workoutTemplates, templateExercises }
}
