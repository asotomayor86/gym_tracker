import { useMemo } from 'react'
import { MEASUREMENT_KEYS } from '../../lib/bodyMeasurement'
import { measurementSeries, useMeasurements } from '../../lib/measurements'
import { ImportError, type ImportReview, type OcrProgress } from '../../lib/importers/types'
import type { MetricKey } from './metrics'

export { saveMeasurement, getMeasurement } from '../../lib/bodyWeight'
export { useMeasurements, availableMetrics } from '../../lib/measurements'
export { ImportError }
export type { ImportReview, OcrProgress }

/** Serie de una métrica en unidad canónica (kg para las de masa). */
export function useMetricSeries(key: MetricKey): { date: string; value: number }[] {
  const rows = useMeasurements()
  return useMemo(() => measurementSeries(rows, key), [rows, key])
}

/**
 * PROVISIONAL: simula importImage (src/lib/importImage.ts, ARQUITECTO, fase 2/3) con un ImportReview sintético para poder
 * maquetar. Cuando exista, esta función se sustituye por `export { importImage } from '../../lib/importImage'`.
 */
export async function importImage(file: Blob, onProgress?: (p: OcrProgress) => void): Promise<ImportReview> {
  // En producción no hay lectura simulada: nunca se deben guardar datos inventados como si fueran de la báscula.
  if (!import.meta.env.DEV) throw new ImportError('engine-failed', 'La lectura de imágenes aún no está disponible en esta versión.')
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  for (let i = 1; i <= 5; i++) { onProgress?.({ stage: 'engine', fraction: i / 5 }); await wait(150) }
  for (let i = 1; i <= 8; i++) { onProgress?.({ stage: 'reading', fraction: i / 8 }); await wait(200) }
  if (file.size < 50) throw new ImportError('unreadable', 'No se pudo leer la imagen.')
  const sample = { weightKg: 84.2, bmi: 27.1, bodyFatPct: 22.4, musclePct: 72.1, leanMassKg: 64.9, subcutaneousFatPct: 18.5, visceralFat: 9,
    bodyWaterPct: 55.1, skeletalMusclePct: 49.5, muscleMassKg: 62.1, proteinPct: 17.2, bmr: 1790, bodyAge: 38 }
  const fields = {} as ImportReview['fields']
  for (const k of MEASUREMENT_KEYS) fields[k] = k in sample ? { status: 'detected', value: sample[k as keyof typeof sample], raw: String(sample[k as keyof typeof sample]) } : { status: 'missing' }
  fields.visceralFat = { status: 'doubtful', value: 9, raw: '9', reason: 'El motor dudó entre 9 y 11.4' }
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    importerId: 'fitdays', date: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`, time: `${p(now.getHours())}:${p(now.getMinutes())}`,
    fields, warnings: [], values: { ...sample }, doubtful: ['visceralFat'], missing: ['boneMassKg'], confidence: 0.82,
  }
}

/** Imagen recibida por «Compartir» (Share Target); la guarda el service worker (fase 5). */
export async function takeSharedImage(): Promise<File | null> { return null }
