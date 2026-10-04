import { alive, db, removeFrom, saveTo, type GymDB } from '../db/db'
import { MEASUREMENT_KEYS, TIME_RE, fieldOf, outOfRange, pickMeasurement, type BodyMeasurement, type MeasurementKey, type MeasurementSource } from './bodyMeasurement'
import type { BodyWeight } from './types'

export const MIN_WEIGHT_KG = 20
export const MAX_WEIGHT_KG = 400

export interface WeightPoint { date: string; weightKg: number }
export interface AvgPoint { date: string; avg: number }

const DAY_MS = 86_400_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Día en milisegundos UTC (evita desfases de horario de verano al restar fechas YYYY-MM-DD). */
const dayMs = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))

export const bodyWeightId = (date: string) => `bw-${date}`

/** Hoy en formato YYYY-MM-DD en la zona horaria local. */
export const todayLocal = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

function assertDate(date: string) {
  if (!DATE_RE.test(date) || Number.isNaN(dayMs(date)) || new Date(dayMs(date)).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Fecha no válida: ${date}`)
  }
}

/**
 * Guarda el peso de un día (un registro por día; mismo id → un segundo guardado lo edita y gana el último en sync).
 * Si `note` es undefined se conserva la nota existente. Recupera el día si estaba borrado. Rango válido: 20–400 kg.
 */
export async function setBodyWeight(date: string, weightKg: number, note?: string, d: GymDB = db): Promise<BodyWeight> {
  assertDate(date)
  if (!Number.isFinite(weightKg) || weightKg < MIN_WEIGHT_KG || weightKg > MAX_WEIGHT_KG) {
    throw new RangeError(`El peso debe estar entre ${MIN_WEIGHT_KG} y ${MAX_WEIGHT_KG} kg`)
  }
  const id = bodyWeightId(date)
  const prev = await d.bodyWeights.get(id)
  const live = prev && !prev.deletedAt ? prev : undefined
  // Un peso manual NO debe borrar la composición corporal que ya hubiera ese día (importada de la báscula).
  const { id: _i, updatedAt: _u, deletedAt: _d, ...kept } = live ?? ({} as Partial<BodyWeight>)
  return saveTo(d, 'bodyWeights', {
    ...kept, id, date, weightKg: Math.round(weightKg * 100) / 100, note: note ?? live?.note ?? '', source: live?.source ?? 'manual',
  } as never)
}

export interface SaveMeasurementOptions {
  /** Hora de la medición (HH:mm). Si se omite se conserva la existente. */
  time?: string | null
  source?: MeasurementSource
  note?: string
  /**
   * 'merge' (por defecto): los campos que llegan pisan a los existentes y el resto se conserva (p. ej. un peso manual
   * y una importación sin peso se complementan). 'replace': la composición del día pasa a ser SOLO la que llega
   * (los indicadores que no vienen se quitan), pero el peso y la nota se conservan si no se aportan.
   */
  mode?: 'merge' | 'replace'
}

/** Medición del día (viva) o undefined: la interfaz lo usa para preguntar «ya existe una medición, ¿sustituir?». */
export async function getMeasurement(date: string, d: GymDB = db): Promise<BodyWeight | undefined> {
  assertDate(date)
  const row = await d.bodyWeights.get(bodyWeightId(date))
  return row && !row.deletedAt ? row : undefined
}

/**
 * Guarda una medición completa (peso + composición) de un día: UNA por día (id `bw-YYYY-MM-DD`), con upsert.
 * Valida rangos plausibles (RangeError con la lista de campos) y exige peso (el de la medición o el ya guardado).
 */
export async function saveMeasurement(date: string, values: BodyMeasurement, opts: SaveMeasurementOptions = {}, d: GymDB = db): Promise<BodyWeight> {
  assertDate(date)
  if (opts.time !== undefined && opts.time !== null && !TIME_RE.test(opts.time)) throw new RangeError(`Hora no válida: ${opts.time}`)
  const clean = pickMeasurement(values)
  const bad = outOfRange(clean)
  if (bad.length) throw new RangeError(`Valores fuera de rango: ${bad.map((k) => fieldOf(k).label).join(', ')}`)

  const id = bodyWeightId(date)
  const prevRow = await d.bodyWeights.get(id)
  const prev = prevRow && !prevRow.deletedAt ? prevRow : undefined
  const weightKg = clean.weightKg ?? prev?.weightKg
  if (weightKg === undefined) throw new RangeError('Falta el peso de la medición')

  const prevComp = pickMeasurement(prev as Partial<Record<MeasurementKey, unknown>> | undefined)
  delete prevComp.weightKg
  const { weightKg: _w, ...cleanComp } = clean
  const comp: Partial<Record<MeasurementKey, number | null>> = (opts.mode ?? 'merge') === 'replace' ? { ...cleanComp } : { ...prevComp, ...cleanComp }
  if (opts.mode === 'replace') for (const k of MEASUREMENT_KEYS) if (k !== 'weightKg' && prevComp[k] !== undefined && comp[k] === undefined) comp[k] = null // el servidor solo escribe las columnas presentes: se envía null explícito

  return saveTo(d, 'bodyWeights', {
    id, date, weightKg: Math.round(weightKg * 100) / 100, note: opts.note ?? prev?.note ?? '',
    measuredAt: opts.time === null ? undefined : (opts.time ?? prev?.measuredAt),
    source: opts.source ?? prev?.source ?? 'manual',
    ...comp,
  } as never)
}

/** Borrado lógico del registro del día (se propaga por sync). */
export async function removeBodyWeight(date: string, d: GymDB = db) {
  assertDate(date)
  await removeFrom(d, 'bodyWeights', bodyWeightId(date))
}

/** Registros vivos ordenados por fecha ascendente. */
export const liveBodyWeights = async (d: GymDB = db): Promise<BodyWeight[]> =>
  (await d.bodyWeights.filter(alive).toArray()).sort((a, b) => a.date.localeCompare(b.date))

const byDate = <T extends { date: string }>(points: T[]) => [...points].sort((a, b) => a.date.localeCompare(b.date))

/**
 * Media móvil de los últimos `window` DÍAS NATURALES hasta cada fecha (incluida), usando solo los días con registro.
 * Un día sin registro no cuenta como cero: simplemente no aporta. Devuelve un punto por cada día registrado.
 */
export function movingAverage(points: WeightPoint[], window = 7): AvgPoint[] {
  const sorted = byDate(points)
  const out: AvgPoint[] = []
  for (let i = 0; i < sorted.length; i++) {
    const end = dayMs(sorted[i].date)
    let sum = 0
    let n = 0
    for (let j = i; j >= 0 && end - dayMs(sorted[j].date) < window * DAY_MS; j--) {
      sum += sorted[j].weightKg
      n++
    }
    out.push({ date: sorted[i].date, avg: Math.round((sum / n) * 100) / 100 })
  }
  return out
}

/**
 * Tendencia en los últimos `days` días hasta el último registro, por regresión lineal (menos sensible al ruido diario
 * que restar primero y último). `deltaKg` = cambio estimado a lo largo del tramo observado; `perWeekKg` = pendiente semanal.
 * null si hay menos de 2 registros o todos caen el mismo día.
 */
export function weightTrend(points: WeightPoint[], days = 30): { deltaKg: number; perWeekKg: number } | null {
  const sorted = byDate(points)
  if (sorted.length < 2) return null
  const last = dayMs(sorted[sorted.length - 1].date)
  const inRange = sorted.filter((p) => last - dayMs(p.date) <= days * DAY_MS)
  if (inRange.length < 2) return null
  const xs = inRange.map((p) => (dayMs(p.date) - dayMs(inRange[0].date)) / DAY_MS)
  const span = xs[xs.length - 1]
  if (span === 0) return null
  const ys = inRange.map((p) => p.weightKg)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0)
  const round = (v: number) => Math.round(v * 100) / 100
  return { deltaKg: round(slope * span), perWeekKg: round(slope * 7) }
}

/** Mínimo, máximo, primero y último registro (por fecha). */
export function bodyWeightRange(rows: WeightPoint[]) {
  if (!rows.length) return null
  const sorted = byDate(rows)
  const weights = sorted.map((r) => r.weightKg)
  return {
    min: Math.min(...weights), max: Math.max(...weights),
    first: sorted[0], last: sorted[sorted.length - 1],
    minDate: sorted[weights.indexOf(Math.min(...weights))].date, maxDate: sorted[weights.indexOf(Math.max(...weights))].date,
  }
}
