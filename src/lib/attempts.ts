import { suggestNext, type Suggestion } from './progression'
import { isDone, lastSessionSets } from './stats'
import type { Effort, Session, SetLog } from './types'

export type EffortSummary = Record<Effort, number>
export type SuggestionAction = 'subir' | 'mantener' | 'bajar' | 'repetir'

export interface AttemptSet {
  setIndex: number
  reps: number
  weightKg: number
  effort: Effort
}

export interface Attempt {
  sessionId: string
  /** Fecha del intento: la última serie completada de ese ejercicio en la sesión (o el inicio de la sesión). */
  date: number
  sets: AttemptSet[]
  totalSets: number
  /** Mayor peso del intento. */
  topWeightKg: number
  /** Repeticiones de la mejor serie (la de mayor peso; a igualdad, la de más repeticiones). */
  bestReps: number
  effortSummary: EffortSummary
}

export interface AttemptSummary {
  sessionId: string
  date: number
  topWeightKg: number
  bestReps: number
  totalSets: number
  effortSummary: EffortSummary
}

export interface AttemptSuggestion extends Suggestion {
  action: SuggestionAction
}

export interface ExerciseAttempts {
  /** Último intento (el del último día en que se hizo), o null si no hay historial. */
  last: Attempt | null
  /** Últimos intentos resumidos, del más reciente al más antiguo (incluye el último). */
  history: AttemptSummary[]
  /** Qué hacer ahora, según suggestNext sobre el último intento. null sin historial. */
  suggestion: AttemptSuggestion | null
}

export interface AttemptsOptions {
  /** Sesión en curso: no se muestra a sí misma. */
  excludeSessionId?: string
  /** Nº de intentos del historial (por defecto 5). */
  limit?: number
  /** Incremento de peso al subir (prefs.incrementKg; por defecto 2,5 kg). */
  incrementKg?: number
}

/** Diferencia de peso (kg) por debajo de la cual se considera que "se mantiene". */
export const WEIGHT_TOLERANCE_KG = 0.25

const emptySummary = (): EffortSummary => ({ easy_done: 0, hard_done: 0, failed_close: 0, failed: 0 })

/**
 * Último intento (y los anteriores) de un ejercicio por el propio usuario, para decidir si repetir peso, bajar o subir.
 * Pura. Solo cuentan series completadas y valoradas (isDone), no borradas, de sesiones no borradas y distintas de la actual.
 * La sugerencia reutiliza suggestNext sobre las series del último intento (lastSessionSets).
 */
export function exerciseAttempts(logs: SetLog[], sessions: Session[], exerciseId: string, opts: AttemptsOptions = {}): ExerciseAttempts {
  const { excludeSessionId, limit = 5, incrementKg } = opts
  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const usable = logs.filter((l) => {
    if (l.deletedAt || l.exerciseId !== exerciseId || !isDone(l) || l.sessionId === excludeSessionId) return false
    const s = sessionById.get(l.sessionId)
    return !s?.deletedAt // si la sesión no está en la lista, se confía en la serie
  })

  const bySession = new Map<string, SetLog[]>()
  for (const l of usable) bySession.set(l.sessionId, [...(bySession.get(l.sessionId) ?? []), l])

  const attempts: Attempt[] = [...bySession.entries()].map(([sessionId, list]) => {
    const sets = list
      .sort((a, b) => a.setIndex - b.setIndex)
      .map((l) => ({ setIndex: l.setIndex, reps: l.reps, weightKg: l.weightKg, effort: l.effort as Effort }))
    const best = sets.reduce((a, b) => (b.weightKg > a.weightKg || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a))
    const effortSummary = emptySummary()
    for (const s of sets) effortSummary[s.effort]++
    return {
      sessionId,
      date: Math.max(...list.map((l) => l.completedAt!)) || sessionById.get(sessionId)?.startedAt || 0,
      sets, totalSets: sets.length, topWeightKg: best.weightKg, bestReps: best.reps, effortSummary,
    }
  })
  attempts.sort((a, b) => b.date - a.date)
  if (!attempts.length) return { last: null, history: [], suggestion: null }

  const last = attempts[0]
  const suggested = suggestNext(lastSessionSets(usable, exerciseId), { incrementKg })
  let suggestion: AttemptSuggestion | null = null
  if (suggested) {
    const delta = suggested.weightKg - last.topWeightKg
    const action: SuggestionAction =
      delta > WEIGHT_TOLERANCE_KG ? 'subir' : delta < -WEIGHT_TOLERANCE_KG ? 'bajar' : last.effortSummary.failed_close > 0 ? 'repetir' : 'mantener'
    suggestion = { ...suggested, action }
  }
  return {
    last,
    history: attempts.slice(0, Math.max(0, limit)).map(({ sets: _s, ...summary }) => summary),
    suggestion,
  }
}
