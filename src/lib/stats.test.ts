import { describe, expect, it } from 'vitest'
import { exerciseHistory, lastSessionSets, muscleStats } from './stats'
import type { Exercise, SetLog } from './types'

const DAY = 86_400_000
const now = 100 * DAY

const ex = (id: string, primaryMuscle: any, secondaryMuscles: any[] = []) =>
  ({ id, primaryMuscle, secondaryMuscles }) as Exercise

const log = (p: Partial<SetLog>) =>
  ({ sessionId: 's1', exerciseId: 'press', setIndex: 0, reps: 10, weightKg: 50, effort: 'hard_done', completedAt: now - DAY, ...p }) as SetLog

describe('muscleStats', () => {
  const exercises = [ex('press', 'pecho', ['triceps'])]
  it('cuenta primario 1 y secundario 0.5', () => {
    const s = muscleStats([log({}), log({ setIndex: 1 })], exercises, now)
    expect(s.find((m) => m.muscle === 'pecho')!.sets7).toBe(2)
    expect(s.find((m) => m.muscle === 'triceps')!.sets7).toBe(1)
  })
  it('calcula días desde el último trabajo y nulo si nunca', () => {
    const s = muscleStats([log({ completedAt: now - 10 * DAY })], exercises, now)
    const chest = s.find((m) => m.muscle === 'pecho')!
    expect(chest.daysSince).toBe(10)
    expect(chest.sets7).toBe(0)
    expect(chest.sets30).toBe(1)
    expect(s.find((m) => m.muscle === 'espalda')!.daysSince).toBeNull()
  })
  it('ignora series sin completar', () => {
    const s = muscleStats([log({ effort: null, completedAt: null })], exercises, now)
    expect(s.find((m) => m.muscle === 'pecho')!.sets30).toBe(0)
  })
})

describe('lastSessionSets', () => {
  it('devuelve la sesión más reciente y excluye la actual', () => {
    const logs = [log({ sessionId: 'a', completedAt: 1 }), log({ sessionId: 'b', completedAt: 2 }), log({ sessionId: 'c', completedAt: 3 })]
    expect(lastSessionSets(logs, 'press')[0].sessionId).toBe('c')
    expect(lastSessionSets(logs, 'press', 'c')[0].sessionId).toBe('b')
  })
})

describe('exerciseHistory', () => {
  it('una entrada por sesión con el mejor peso', () => {
    const h = exerciseHistory([log({ weightKg: 40 }), log({ weightKg: 60 }), log({ sessionId: 's2', completedAt: now })], 'press')
    expect(h).toHaveLength(2)
    expect(h[0].topWeightKg).toBe(60)
  })
})
