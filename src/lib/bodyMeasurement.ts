/**
 * Composición corporal de una medición de báscula (Fitdays y similares). Todos los campos son opcionales:
 * una medición manual solo trae el peso. Se guardan en la misma fila de `bodyWeights` (una por día, id = `bw-YYYY-MM-DD`).
 */
export interface BodyMeasurement {
  weightKg?: number
  /** Índice de masa corporal. */
  bmi?: number
  bodyFatPct?: number
  /** "Frecuencia muscular" (muscle rate) en %. */
  musclePct?: number
  /** Masa libre de grasa (la báscula la llama "Pérdida de grasa"), kg. */
  leanMassKg?: number
  subcutaneousFatPct?: number
  /** Índice de grasa visceral (sin unidad). */
  visceralFat?: number
  bodyWaterPct?: number
  skeletalMusclePct?: number
  muscleMassKg?: number
  /** Masa ósea (la báscula la llama "Masa esquelética"), kg. */
  boneMassKg?: number
  proteinPct?: number
  /** Metabolismo basal, kcal. */
  bmr?: number
  /** Edad corporal, años. */
  bodyAge?: number
}

export type MeasurementKey = keyof BodyMeasurement
export type MeasurementSource = 'manual' | 'fitdays'

export interface MeasurementField {
  key: MeasurementKey
  /** Etiqueta en español para la interfaz. */
  label: string
  unit: string
  decimals: number
  /** Rango plausible: fuera de él el valor se considera erróneo. */
  min: number
  max: number
}

/** Los 14 indicadores, en el orden en que los muestra la báscula. */
export const MEASUREMENT_FIELDS: readonly MeasurementField[] = [
  { key: 'weightKg', label: 'Peso', unit: 'kg', decimals: 1, min: 20, max: 400 },
  { key: 'bmi', label: 'IMC', unit: '', decimals: 1, min: 8, max: 80 },
  { key: 'bodyFatPct', label: 'Grasa corporal', unit: '%', decimals: 1, min: 2, max: 75 },
  { key: 'musclePct', label: 'Frecuencia muscular', unit: '%', decimals: 1, min: 15, max: 98 },
  { key: 'leanMassKg', label: 'Masa libre de grasa', unit: 'kg', decimals: 1, min: 10, max: 250 },
  { key: 'subcutaneousFatPct', label: 'Grasa subcutánea', unit: '%', decimals: 1, min: 1, max: 65 },
  { key: 'visceralFat', label: 'Grasa visceral', unit: '', decimals: 1, min: 0.5, max: 60 },
  { key: 'bodyWaterPct', label: 'Agua corporal', unit: '%', decimals: 1, min: 20, max: 85 },
  { key: 'skeletalMusclePct', label: 'Músculo esquelético', unit: '%', decimals: 1, min: 10, max: 80 },
  { key: 'muscleMassKg', label: 'Masa muscular', unit: 'kg', decimals: 1, min: 10, max: 220 },
  { key: 'boneMassKg', label: 'Masa ósea', unit: 'kg', decimals: 1, min: 0.5, max: 10 },
  { key: 'proteinPct', label: 'Proteína', unit: '%', decimals: 1, min: 4, max: 35 },
  { key: 'bmr', label: 'Metabolismo basal (BMR)', unit: 'kcal', decimals: 0, min: 500, max: 5000 },
  { key: 'bodyAge', label: 'Edad corporal', unit: 'años', decimals: 0, min: 5, max: 110 },
] as const

export const MEASUREMENT_KEYS: readonly MeasurementKey[] = MEASUREMENT_FIELDS.map((f) => f.key)
export const fieldOf = (key: MeasurementKey) => MEASUREMENT_FIELDS.find((f) => f.key === key)!

export const inRange = (key: MeasurementKey, v: number) => {
  const f = fieldOf(key)
  return Number.isFinite(v) && v >= f.min && v <= f.max
}

/** Extrae los campos de composición (y solo ellos) de cualquier objeto, descartando undefined/null y no numéricos. */
export function pickMeasurement(src: Partial<Record<MeasurementKey, unknown>> | null | undefined): BodyMeasurement {
  const out: BodyMeasurement = {}
  if (!src) return out
  for (const key of MEASUREMENT_KEYS) {
    const v = src[key]
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v
  }
  return out
}

/** Valida los rangos; devuelve los campos fuera de rango (vacío = todo bien). */
export const outOfRange = (m: BodyMeasurement): MeasurementKey[] => MEASUREMENT_KEYS.filter((k) => m[k] !== undefined && !inRange(k, m[k]!))

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
