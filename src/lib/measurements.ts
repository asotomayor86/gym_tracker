import { useLiveQuery } from 'dexie-react-hooks'
import { alive, db } from '../db/db'
import { MEASUREMENT_KEYS, type MeasurementKey } from './bodyMeasurement'
import { bodyWeightId } from './bodyWeight'
import type { BodyWeight } from './types'

/** Mediciones vivas por fecha ascendente, en vivo (se actualiza al guardar o al llegar por sync). */
export const useMeasurements = (): BodyWeight[] =>
  useLiveQuery(async () => (await db.bodyWeights.filter(alive).toArray()).sort((a, b) => a.date.localeCompare(b.date)), [], [])

/** La medición de un día (o undefined). Para avisar de «ya existe una medición ese día» antes de sustituir. */
export const useMeasurement = (date: string): BodyWeight | undefined =>
  useLiveQuery(async () => {
    const row = await db.bodyWeights.get(bodyWeightId(date))
    return row && !row.deletedAt ? row : undefined
  }, [date])

/** Serie de un indicador para las gráficas: solo los días que lo tienen (null/undefined = sin dato). Pura. */
export function measurementSeries(rows: BodyWeight[], key: MeasurementKey): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = []
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const v = (r as unknown as Record<string, unknown>)[key]
    if (typeof v === 'number' && Number.isFinite(v)) out.push({ date: r.date, value: v })
  }
  return out
}

/** Indicadores con al menos un dato en las mediciones (para ofrecer solo las gráficas que tienen contenido). */
export const availableMetrics = (rows: BodyWeight[]): MeasurementKey[] => MEASUREMENT_KEYS.filter((k) => measurementSeries(rows, k).length > 0)
