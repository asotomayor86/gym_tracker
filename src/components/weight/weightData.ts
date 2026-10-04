import { useLiveQuery } from 'dexie-react-hooks'
import { liveBodyWeights } from '../../lib/bodyWeight'
import type { BodyWeight } from '../../lib/types'

/** Datos del peso corporal para la UI: tabla real (Dexie) y funciones puras de src/lib/bodyWeight.ts. */
export { MAX_WEIGHT_KG as WEIGHT_MAX_KG, MIN_WEIGHT_KG as WEIGHT_MIN_KG, movingAverage, removeBodyWeight, setBodyWeight, todayLocal as isoDate, weightTrend } from '../../lib/bodyWeight'
export type { BodyWeight }
export interface Point { date: string; weightKg: number }

export const dayIndex = (date: string) => Math.round(Date.parse(date + 'T00:00:00Z') / 86_400_000)
export const addDays = (date: string, n: number) => new Date((dayIndex(date) + n) * 86_400_000).toISOString().slice(0, 10)

/** Registros vivos por fecha ascendente (reactivo). Vacío mientras carga. */
export function useBodyWeights(): BodyWeight[] {
  return useLiveQuery(liveBodyWeights, [], []) ?? []
}
