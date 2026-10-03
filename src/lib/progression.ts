import type { Effort } from './types'

export interface PastSet {
  reps: number
  weightKg: number
  effort: Effort | null
}

export interface Suggestion {
  weightKg: number
  reps: number
  reason: string
}

export interface ProgressionOptions {
  incrementKg?: number
  deloadFactor?: number
}

/**
 * Doble progresión a partir de las series de la última sesión de un ejercicio.
 * - Todas fáciles → sube peso.
 * - Alguna fallo → baja peso (deload).
 * - Alguna casi/costó → mantiene.
 */
export function suggestNext(
  last: PastSet[],
  { incrementKg = 2.5, deloadFactor = 0.925 }: ProgressionOptions = {},
): Suggestion | null {
  const rated = last.filter((s) => s.effort)
  if (rated.length === 0) return null

  const top = rated.reduce((a, b) => (b.weightKg >= a.weightKg ? b : a))
  const base = { weightKg: top.weightKg, reps: top.reps }
  const efforts = rated.map((s) => s.effort)

  if (efforts.includes('failed')) {
    return {
      weightKg: Math.round((top.weightKg * deloadFactor) / 0.5) * 0.5,
      reps: top.reps,
      reason: 'Fallaste una serie: bajamos un poco el peso',
    }
  }
  if (efforts.every((e) => e === 'easy_done')) {
    return { weightKg: top.weightKg + incrementKg, reps: top.reps, reason: 'Todo fácil: sube peso' }
  }
  if (efforts.includes('failed_close')) {
    return { ...base, reason: 'Casi lo logras: repite el mismo peso' }
  }
  return { ...base, reason: 'Costó pero saliste: mantén el peso' }
}
