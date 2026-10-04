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
  ['Aductores en máquina', 'aductores', [], 'Máquina'],
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
  // Máquinas del gimnasio Forus no contempladas al principio
  ['Extensión lumbar en máquina', 'espalda', ['gluteo', 'isquios'], 'Máquina'],
  ['Remo alto en máquina', 'espalda', ['hombro', 'biceps'], 'Máquina'],
  ['Abducción de cadera de pie en máquina', 'gluteo', [], 'Máquina'],
  ['Jalón en máquina con palancas', 'espalda', ['biceps'], 'Máquina'],
  // Las otras funciones del Multi Hip (Technogym): flexión, extensión y aducción de cadera de pie
  ['Flexión de cadera de pie en máquina', 'cuadriceps', ['core'], 'Máquina'],
  ['Extensión de cadera de pie en máquina', 'gluteo', ['isquios'], 'Máquina'],
  ['Aducción de cadera de pie en máquina', 'aductores', [], 'Máquina'],
]

/**
 * Nombre en inglés (nameEn) por nombre español. Estándar de gimnasio; cuando la máquina es Technogym, el nombre
 * de la máquina va entre paréntesis para que la búsqueda por «upper back» o «vertical traction» los encuentre.
 * Title Case, <= 120 caracteres y único entre ejercicios.
 */
export const EN_NAMES: Record<string, string> = {
  'Prensa de piernas': 'Leg Press',
  'Hack squat': 'Hack Squat',
  'Sentadilla en multipower': 'Smith Machine Squat',
  'Extensión de cuádriceps': 'Leg Extension',
  'Curl femoral tumbado': 'Lying Leg Curl',
  'Curl femoral sentado': 'Seated Leg Curl',
  'Abductores en máquina': 'Seated Hip Abduction (Abductor Machine)',
  'Aductores en máquina': 'Seated Hip Adduction (Adductor Machine)',
  'Patada de glúteo en máquina': 'Glute Kickback Machine (Glute)',
  'Hip thrust en máquina': 'Machine Hip Thrust',
  'Elevación de gemelos sentado': 'Seated Calf Raise',
  'Elevación de gemelos en prensa': 'Leg Press Calf Raise',
  'Press de pecho en máquina': 'Chest Press Machine',
  'Press inclinado en máquina': 'Incline Chest Press Machine (Chest Incline)',
  'Press banca en multipower': 'Smith Machine Bench Press',
  'Peck deck (aperturas en máquina)': 'Pec Deck (Machine Fly / Pectoral)',
  'Cruce de poleas': 'Cable Crossover',
  'Fondos asistidos en máquina': 'Assisted Dip Machine',
  'Press de hombros en máquina': 'Machine Shoulder Press',
  'Elevaciones laterales en máquina': 'Machine Lateral Raise (Delts Machine)',
  'Elevaciones laterales en polea': 'Cable Lateral Raise',
  'Pájaros en peck deck (deltoides posterior)': 'Reverse Pec Deck (Reverse Fly)',
  'Face pull en polea': 'Cable Face Pull',
  'Curl de bíceps en máquina': 'Machine Biceps Curl (Arm Curl)',
  'Curl de bíceps en polea': 'Cable Biceps Curl',
  'Curl en banco Scott (máquina)': 'Preacher Curl Machine',
  'Extensión de tríceps en polea (cuerda)': 'Cable Triceps Pushdown (Rope)',
  'Extensión de tríceps en máquina': 'Machine Triceps Extension',
  'Press de tríceps en máquina (fondos)': 'Seated Dip Machine',
  'Jalón al pecho': 'Lat Pulldown',
  'Remo sentado en máquina': 'Chest-Supported Machine Row (Low Row)',
  'Remo en polea baja': 'Seated Cable Row (Pulley)',
  'Dominadas asistidas en máquina': 'Assisted Pull-Up Machine',
  'Crunch en máquina': 'Ab Crunch Machine',
  'Crunch en polea': 'Cable Crunch',
  'Extensión lumbar en máquina': 'Lower Back Extension Machine (Lower Back)',
  'Remo alto en máquina': 'High Row Machine (Upper Back)',
  'Abducción de cadera de pie en máquina': 'Standing Hip Abduction (Multi Hip)',
  'Jalón en máquina con palancas': 'Lever Lat Pulldown (Vertical Traction / Pulldown)',
  'Flexión de cadera de pie en máquina': 'Standing Hip Flexion (Multi Hip)',
  'Extensión de cadera de pie en máquina': 'Standing Hip Extension (Multi Hip)',
  'Aducción de cadera de pie en máquina': 'Standing Hip Adduction (Multi Hip)',
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
    nameEn: EN_NAMES[name] ?? '',
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
