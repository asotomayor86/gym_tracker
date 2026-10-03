import type { MuscleGroup } from './types'

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  pecho: 'Pecho',
  espalda: 'Espalda',
  hombro: 'Hombro',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  antebrazo: 'Antebrazo',
  cuadriceps: 'Cuádriceps',
  isquios: 'Isquios',
  gluteo: 'Glúteo',
  gemelo: 'Gemelo',
  core: 'Core',
}

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
