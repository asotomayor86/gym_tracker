import { useSyncExternalStore } from 'react'

/**
 * Capa de datos del peso corporal para la UI. HOY es una maqueta (memoria + localStorage de desarrollo) con la forma
 * propuesta a ARQUITECTO (BodyWeight, set/remove, movingAverage, weightTrend). Cuando exista src/lib/bodyWeight.ts y
 * la tabla `bodyWeights`, se sustituyen las implementaciones de este archivo sin tocar las pantallas.
 */
export interface BodyWeight { id: string; date: string; weightKg: number; note?: string }
export interface Point { date: string; weightKg: number }

export const WEIGHT_MIN_KG = 20
export const WEIGHT_MAX_KG = 400

/** Mientras no exista la tabla real, la sección solo se muestra en desarrollo. */
export const bodyWeightReady = () => import.meta.env.DEV

export const isoDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const dayIndex = (date: string) => Math.round(Date.parse(date + 'T00:00:00Z') / 86_400_000)
export const addDays = (date: string, n: number) => new Date((dayIndex(date) + n) * 86_400_000).toISOString().slice(0, 10)

/** Media móvil de los últimos `window` días (ventana de calendario) en cada fecha con medida. Pura. */
export function movingAverage(points: Point[], window = 7): { date: string; avg: number }[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((p, i) => {
    const di = dayIndex(p.date)
    let sum = 0, n = 0
    for (let j = i; j >= 0 && di - dayIndex(sorted[j].date) < window; j--) { sum += sorted[j].weightKg; n++ }
    return { date: p.date, avg: sum / n }
  })
}

/** Variación de la media móvil en los últimos `days` días y ritmo semanal. Null si hay menos de dos medidas en el periodo. Pura. */
export function weightTrend(points: Point[], days = 30): { deltaKg: number; perWeekKg: number } | null {
  const avg = movingAverage(points)
  if (avg.length < 2) return null
  const last = avg[avg.length - 1]
  const from = avg.find((a) => dayIndex(last.date) - dayIndex(a.date) <= days)
  if (!from || from.date === last.date) return null
  const span = Math.max(1, dayIndex(last.date) - dayIndex(from.date))
  const deltaKg = last.avg - from.avg
  return { deltaKg, perWeekKg: (deltaKg / span) * 7 }
}

/* ---------- maqueta de almacenamiento ---------- */
const KEY = 'gym-bw-mock'
let rows: BodyWeight[] = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as BodyWeight[] } catch { return [] }
})()
if (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('weight') === 'demo') {
  const today = isoDate()
  rows = Array.from({ length: 70 }, (_, i) => i).filter((i) => i % 5 !== 3).map((i) => {
    const d = addDays(today, -69 + i)
    return { id: 'bw-' + d, date: d, weightKg: Math.round((84.4 - i * 0.045 + Math.sin(i / 2.3) * 0.5 + Math.cos(i * 1.7) * 0.25) * 10) / 10 }
  })
}
const subs = new Set<() => void>()
const commit = (next: BodyWeight[]) => {
  rows = next.sort((a, b) => a.date.localeCompare(b.date))
  try { localStorage.setItem(KEY, JSON.stringify(rows)) } catch { /* ignorar */ }
  subs.forEach((l) => l())
}

export function setBodyWeight(date: string, weightKg: number, note?: string) {
  const row: BodyWeight = { id: 'bw-' + date, date, weightKg, ...(note ? { note } : {}) }
  commit([...rows.filter((r) => r.date !== date), row])
}
export function removeBodyWeight(date: string) { commit(rows.filter((r) => r.date !== date)) }

export function useBodyWeights(): BodyWeight[] {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => rows)
}
