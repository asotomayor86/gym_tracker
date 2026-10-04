import { alive, db, removeFrom, saveTo, type GymDB } from '../db/db'
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
  return saveTo(d, 'bodyWeights', {
    id, date, weightKg: Math.round(weightKg * 100) / 100, note: note ?? (prev && !prev.deletedAt ? prev.note : ''),
  })
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
