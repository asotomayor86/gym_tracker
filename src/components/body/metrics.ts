import { MEASUREMENT_FIELDS, type MeasurementKey } from '../../lib/bodyMeasurement'
import type { Unit } from '../../lib/units'
import { fromKg } from '../../lib/units'

/** Indicadores de la báscula. Las claves, etiquetas, unidades y rangos son los de src/lib/bodyMeasurement.ts. */
export type MetricKey = MeasurementKey

export interface MetricDef {
  key: MetricKey
  label: string
  /** Etiqueta corta para chips y tarjetas. */
  short: string
  /** 'kg' se muestra en kg o lb según la preferencia. */
  unit: string
  decimals: number
  /** Los principales se destacan en el resumen. */
  main: boolean
  /** Rango mínimo del eje Y, para que el ruido no parezca tendencia. */
  minSpan: number
  min: number
  max: number
}

const SHORT: Partial<Record<MetricKey, string>> = {
  musclePct: 'Frec. muscular', leanMassKg: 'Libre de grasa', subcutaneousFatPct: 'G. subcutánea', visceralFat: 'G. visceral',
  bodyWaterPct: 'Agua', skeletalMusclePct: 'M. esquelético', bodyFatPct: 'Grasa', bmr: 'BMR', bodyAge: 'Edad corporal',
}
const MAIN: MetricKey[] = ['weightKg', 'bodyFatPct', 'muscleMassKg', 'visceralFat']
const MIN_SPAN: Partial<Record<MetricKey, number>> = {
  weightKg: 1.5, bmi: 0.6, boneMassKg: 0.3, proteinPct: 1, visceralFat: 1, bmr: 40, bodyAge: 2,
}

export const METRICS: MetricDef[] = MEASUREMENT_FIELDS.map((f) => ({
  key: f.key, label: f.label, short: SHORT[f.key] ?? f.label, unit: f.unit, decimals: f.decimals,
  main: MAIN.includes(f.key), minSpan: MIN_SPAN[f.key] ?? 1.5, min: f.min, max: f.max,
}))
export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<MetricKey, MetricDef>

/** Unidad mostrada: los kg siguen la preferencia kg/lb. */
export const displayUnit = (m: MetricDef, unit: Unit) => (m.unit === 'kg' ? unit : m.unit)
/** Valor canónico → valor mostrado. */
export const toDisplay = (m: MetricDef, v: number, unit: Unit) => (m.unit === 'kg' ? fromKg(v, unit) : v)
