import { useMemo } from 'react'
import { measurementSeries, useMeasurements } from '../../lib/measurements'
import type { MetricKey } from './metrics'

export { saveMeasurement, getMeasurement } from '../../lib/bodyWeight'
export { useMeasurements, availableMetrics } from '../../lib/measurements'
export { importImage, ImportError } from '../../lib/importImage'
export type { ImportReview, OcrProgress } from '../../lib/importImage'

/** Serie de una métrica en unidad canónica (kg para las de masa). */
export function useMetricSeries(key: MetricKey): { date: string; value: number }[] {
  const rows = useMeasurements()
  return useMemo(() => measurementSeries(rows, key), [rows, key])
}

/** Imagen recibida por «Compartir» (Share Target); la guarda el service worker (fase 5). */
export async function takeSharedImage(): Promise<File | null> { return null }
