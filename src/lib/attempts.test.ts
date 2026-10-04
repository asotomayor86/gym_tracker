import { describe, expect, it } from 'vitest'
import { exerciseAttempts } from './attempts'
import type { Effort, Session, SetLog } from './types'

let id = 0
const log = (sessionId: string, setIndex: number, weightKg: number, reps: number, effort: Effort | null, p: Partial<SetLog> = {}): SetLog => ({
  id: `l${id++}`, sessionId, exerciseId: 'press', setIndex, exerciseOrder: 0, reps, weightKg, inputUnit: 'kg', inputWeight: weightKg,
  effort, completedAt: effort ? Number(sessionId.replace(/\D/g, '')) * 1000 + setIndex : null, updatedAt: 1, deletedAt: null, ...p,
})
const session = (sid: string, p: Partial<Session> = {}): Session => ({ id: sid, templateId: null, startedAt: 1, endedAt: 2, notes: '', updatedAt: 1, deletedAt: null, ...p })

describe('exerciseAttempts', () => {
  it('sin historial: last null, historial vacío y sin sugerencia', () => {
    expect(exerciseAttempts([], [], 'press')).toEqual({ last: null, history: [], suggestion: null })
    // series sin completar o de otro ejercicio no cuentan
    const only = [log('s1', 0, 50, 10, null), log('s1', 1, 50, 10, 'hard_done', { exerciseId: 'otro' })]
    expect(exerciseAttempts(only, [session('s1')], 'press').last).toBeNull()
  })

  it('último intento = el del último día; historial del más reciente al más antiguo con resumen', () => {
    const logs = [
      log('s1', 0, 40, 12, 'hard_done'), log('s1', 1, 40, 10, 'failed_close'),
      log('s3', 0, 50, 10, 'easy_done'), log('s3', 1, 50, 10, 'easy_done'), log('s3', 2, 52.5, 8, 'hard_done'),
      log('s2', 0, 45, 10, 'hard_done'),
    ]
    const r = exerciseAttempts(logs, ['s1', 's2', 's3'].map((s) => session(s)), 'press')
    expect(r.last).toMatchObject({ sessionId: 's3', topWeightKg: 52.5, bestReps: 8, totalSets: 3 })
    expect(r.last!.sets.map((s) => [s.setIndex, s.weightKg, s.reps, s.effort])).toEqual([[0, 50, 10, 'easy_done'], [1, 50, 10, 'easy_done'], [2, 52.5, 8, 'hard_done']])
    expect(r.last!.effortSummary).toEqual({ easy_done: 2, hard_done: 1, failed_close: 0, failed: 0 })
    expect(r.history.map((h) => [h.sessionId, h.topWeightKg, h.bestReps, h.totalSets])).toEqual([['s3', 52.5, 8, 3], ['s2', 45, 10, 1], ['s1', 40, 12, 2]])
    expect(r.history[2].effortSummary).toEqual({ easy_done: 0, hard_done: 1, failed_close: 1, failed: 0 })
    expect((r.history[0] as unknown as { sets?: unknown }).sets).toBeUndefined() // el historial va resumido
  })

  it('respeta limit y excluye la sesión actual (para no mostrarse a sí misma)', () => {
    const logs = ['s1', 's2', 's3', 's4'].map((s) => log(s, 0, 40, 10, 'hard_done'))
    const sessions = ['s1', 's2', 's3', 's4'].map((s) => session(s))
    expect(exerciseAttempts(logs, sessions, 'press', { limit: 2 }).history.map((h) => h.sessionId)).toEqual(['s4', 's3'])
    const r = exerciseAttempts(logs, sessions, 'press', { excludeSessionId: 's4' })
    expect(r.last!.sessionId).toBe('s3')
    expect(r.history.map((h) => h.sessionId)).toEqual(['s3', 's2', 's1'])
    expect(exerciseAttempts(logs.slice(3), sessions, 'press', { excludeSessionId: 's4' }).last).toBeNull() // solo existe la actual
    expect(exerciseAttempts(logs, sessions, 'press', { limit: 0 }).history).toEqual([])
  })

  it('ignora series borradas y sesiones borradas', () => {
    const logs = [log('s1', 0, 40, 10, 'hard_done'), log('s2', 0, 90, 10, 'easy_done', { deletedAt: 5 }), log('s3', 0, 80, 10, 'easy_done')]
    const r = exerciseAttempts(logs, [session('s1'), session('s2'), session('s3', { deletedAt: 9 })], 'press')
    expect(r.last).toMatchObject({ sessionId: 's1', topWeightKg: 40 })
    expect(r.history).toHaveLength(1)
  })

  it('acción SUBIR cuando todo fue fácil (usa el incremento de preferencias)', () => {
    const logs = [log('s1', 0, 50, 10, 'easy_done'), log('s1', 1, 50, 10, 'easy_done')]
    const r = exerciseAttempts(logs, [session('s1')], 'press', { incrementKg: 5 })
    expect(r.suggestion).toMatchObject({ action: 'subir', weightKg: 55, reps: 10 })
    expect(exerciseAttempts(logs, [session('s1')], 'press').suggestion!.weightKg).toBe(52.5) // incremento por defecto
  })

  it('acción BAJAR si alguna serie fue fallo', () => {
    const logs = [log('s1', 0, 60, 10, 'hard_done'), log('s1', 1, 60, 6, 'failed')]
    const r = exerciseAttempts(logs, [session('s1')], 'press')
    expect(r.suggestion).toMatchObject({ action: 'bajar', weightKg: 55.5 })
    expect(r.suggestion!.reason).toMatch(/Fallaste/)
  })

  it('acción MANTENER si costó pero salió, y REPETIR si se quedó cerca', () => {
    const hard = exerciseAttempts([log('s1', 0, 60, 10, 'hard_done'), log('s1', 1, 60, 10, 'easy_done')], [session('s1')], 'press')
    expect(hard.suggestion).toMatchObject({ action: 'mantener', weightKg: 60 })
    const close = exerciseAttempts([log('s1', 0, 60, 10, 'failed_close'), log('s1', 1, 60, 9, 'hard_done')], [session('s1')], 'press')
    expect(close.suggestion).toMatchObject({ action: 'repetir', weightKg: 60 })
  })

  it('tolerancia de ±0,25 kg: una diferencia pequeña cuenta como mantener', () => {
    // incremento 0,25 kg: todo fácil → +0,25 = dentro de la tolerancia
    const r = exerciseAttempts([log('s1', 0, 20, 10, 'easy_done')], [session('s1')], 'press', { incrementKg: 0.25 })
    expect(r.suggestion).toMatchObject({ weightKg: 20.25, action: 'mantener' })
    expect(exerciseAttempts([log('s1', 0, 20, 10, 'easy_done')], [session('s1')], 'press', { incrementKg: 0.5 }).suggestion!.action).toBe('subir')
  })

  it('esfuerzos mixtos: el resumen cuenta cada tipo y la sugerencia se basa solo en el último intento', () => {
    const logs = [
      log('s1', 0, 50, 10, 'failed'), // intento antiguo con fallo: no condiciona la sugerencia actual
      log('s2', 0, 50, 10, 'easy_done'), log('s2', 1, 50, 10, 'hard_done'), log('s2', 2, 50, 8, 'failed_close'), log('s2', 3, 50, 6, 'failed'),
    ]
    const r = exerciseAttempts(logs, [session('s1'), session('s2')], 'press')
    expect(r.last!.effortSummary).toEqual({ easy_done: 1, hard_done: 1, failed_close: 1, failed: 1 })
    expect(r.suggestion!.action).toBe('bajar')
    const onlyOld = exerciseAttempts(logs, [session('s1'), session('s2')], 'press', { excludeSessionId: 's2' })
    expect(onlyOld.last!.sessionId).toBe('s1')
    expect(onlyOld.suggestion!.action).toBe('bajar')
  })

  it('mejor serie: mayor peso y, a igualdad, más repeticiones', () => {
    const logs = [log('s1', 0, 60, 8, 'hard_done'), log('s1', 1, 60, 10, 'hard_done'), log('s1', 2, 55, 15, 'easy_done')]
    expect(exerciseAttempts(logs, [session('s1')], 'press').last).toMatchObject({ topWeightKg: 60, bestReps: 10 })
  })

  it('no muta los datos de entrada', () => {
    const logs = [log('s1', 1, 50, 10, 'hard_done'), log('s1', 0, 50, 10, 'hard_done')]
    const copy = JSON.stringify(logs)
    exerciseAttempts(logs, [session('s1')], 'press')
    expect(JSON.stringify(logs)).toBe(copy)
  })
})
