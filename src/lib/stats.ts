import type { Exercise, MuscleGroup, SetLog } from './types'
import { MUSCLE_GROUPS } from './types'

const DAY = 86_400_000

export const isDone = (l: SetLog) => l.completedAt != null && l.effort != null

export interface MuscleStat {
  muscle: MuscleGroup
  sets7: number
  sets30: number
  volume30: number
  lastTrained: number | null
  daysSince: number | null
}

/** Series por grupo muscular: primario cuenta 1, secundario 0.5. */
export function muscleStats(logs: SetLog[], exercises: Exercise[], now = Date.now()): MuscleStat[] {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const stats = new Map<MuscleGroup, MuscleStat>(
    MUSCLE_GROUPS.map((m) => [m, { muscle: m, sets7: 0, sets30: 0, volume30: 0, lastTrained: null, daysSince: null }]),
  )

  for (const log of logs) {
    const ex = byId.get(log.exerciseId)
    if (!ex || !isDone(log)) continue
    const at = log.completedAt!
    const age = now - at
    const targets: [MuscleGroup, number][] = [
      [ex.primaryMuscle, 1],
      ...ex.secondaryMuscles.map((m): [MuscleGroup, number] => [m, 0.5]),
    ]
    for (const [muscle, weight] of targets) {
      const s = stats.get(muscle)
      if (!s) continue
      if (age <= 7 * DAY) s.sets7 += weight
      if (age <= 30 * DAY) {
        s.sets30 += weight
        s.volume30 += weight * log.reps * log.weightKg
      }
      if (s.lastTrained == null || at > s.lastTrained) s.lastTrained = at
    }
  }
  for (const s of stats.values()) {
    if (s.lastTrained != null) s.daysSince = Math.floor((now - s.lastTrained) / DAY)
  }
  return [...stats.values()]
}

/** Series de la última sesión (por fecha) en la que se hizo el ejercicio. */
export function lastSessionSets(logs: SetLog[], exerciseId: string, excludeSessionId?: string): SetLog[] {
  const done = logs.filter((l) => l.exerciseId === exerciseId && isDone(l) && l.sessionId !== excludeSessionId)
  if (done.length === 0) return []
  const latest = done.reduce((a, b) => (b.completedAt! > a.completedAt! ? b : a))
  return done.filter((l) => l.sessionId === latest.sessionId).sort((a, b) => a.setIndex - b.setIndex)
}

export interface HistoryPoint {
  sessionId: string
  at: number
  topWeightKg: number
  e1rm: number
}

/** Mejor peso y 1RM estimado (Epley) por sesión, ordenado por fecha. */
export function exerciseHistory(logs: SetLog[], exerciseId: string): HistoryPoint[] {
  const bySession = new Map<string, HistoryPoint>()
  for (const l of logs) {
    if (l.exerciseId !== exerciseId || !isDone(l) || l.effort === 'failed') continue
    const e1rm = l.weightKg * (1 + l.reps / 30)
    const p = bySession.get(l.sessionId) ?? { sessionId: l.sessionId, at: l.completedAt!, topWeightKg: 0, e1rm: 0 }
    p.topWeightKg = Math.max(p.topWeightKg, l.weightKg)
    p.e1rm = Math.max(p.e1rm, e1rm)
    p.at = Math.max(p.at, l.completedAt!)
    bySession.set(l.sessionId, p)
  }
  return [...bySession.values()].sort((a, b) => a.at - b.at)
}
