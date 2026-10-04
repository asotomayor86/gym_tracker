import type { Unit } from './units'

export type Effort = 'easy_done' | 'hard_done' | 'failed_close' | 'failed'

export const EFFORT_LABELS: Record<Effort, string> = {
  easy_done: 'Fácil',
  hard_done: 'Costó',
  failed_close: 'Casi',
  failed: 'Fallo',
}

export const MUSCLE_GROUPS = [
  'pecho', 'espalda', 'hombro', 'biceps', 'triceps', 'antebrazo',
  'cuadriceps', 'aductores', 'isquios', 'gluteo', 'gemelo', 'core',
] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

/** Campos comunes para sincronización (LWW por fila, borrado lógico). */
export interface SyncFields {
  id: string
  updatedAt: number
  deletedAt: number | null
}

export interface Exercise extends SyncFields {
  name: string
  primaryMuscle: MuscleGroup
  secondaryMuscles: MuscleGroup[]
  equipment: string
  notes: string
}

export interface WorkoutTemplate extends SyncFields {
  name: string
}

export interface TemplateExercise extends SyncFields {
  templateId: string
  exerciseId: string
  position: number
  targetSets: number
  targetReps: number
  targetWeightKg: number
  restS: number
}

export interface Session extends SyncFields {
  templateId: string | null
  startedAt: number
  endedAt: number | null
  notes: string
}

export interface SetLog extends SyncFields {
  sessionId: string
  exerciseId: string
  setIndex: number
  /** Posición del ejercicio dentro de la sesión (0..n-1, por orden de alta o drag and drop). */
  exerciseOrder: number
  reps: number
  weightKg: number
  inputUnit: Unit
  inputWeight: number
  effort: Effort | null
  completedAt: number | null
}

export interface Biometric extends SyncFields {
  sessionId: string | null
  type: string
  value: number | null
  data: unknown
  recordedAt: number
  source: string
}

/** Peso corporal: un registro por día (id = `bw-${date}`), siempre en kg. */
export interface BodyWeight extends SyncFields {
  /** Día local, formato YYYY-MM-DD. */
  date: string
  weightKg: number
  note: string
}

/** Preferencias del usuario sincronizadas: una sola fila con id 'prefs'. */
export interface UserPrefsRow extends SyncFields {
  unit: Unit
  incrementKg: number
  gymId: string | null
}
