import { describe, expect, it } from 'vitest'
import { mergeSize, planMerge, type MergeRows } from './mergePlan'
import type { Exercise, Session, SetLog, TemplateExercise, WorkoutTemplate } from './types'

const NAMES = Array.from({ length: 35 }, (_, i) => `Ejercicio ${i}`)
const ex = (id: string, name: string, p: Partial<Exercise> = {}): Exercise =>
  ({ id, name, primaryMuscle: 'pecho', secondaryMuscles: [], equipment: '', notes: '', updatedAt: 100, deletedAt: null, ...p })
const tpl = (id: string, name: string, p: Partial<WorkoutTemplate> = {}): WorkoutTemplate => ({ id, name, updatedAt: 100, deletedAt: null, ...p })
const te = (id: string, templateId: string, exerciseId: string, position: number, p: Partial<TemplateExercise> = {}): TemplateExercise =>
  ({ id, templateId, exerciseId, position, targetSets: 3, targetReps: 12, targetWeightKg: 20, restS: 60, updatedAt: 100, deletedAt: null, ...p })
const log = (id: string, sessionId: string, exerciseId: string, p: Partial<SetLog> = {}): SetLog =>
  ({ id, sessionId, exerciseId, setIndex: 0, exerciseOrder: 0, reps: 10, weightKg: 50, inputUnit: 'kg', inputWeight: 50, effort: 'hard_done', completedAt: 5, updatedAt: 100, deletedAt: null, ...p })
const session = (id: string, templateId: string | null, p: Partial<Session> = {}): Session =>
  ({ id, templateId, startedAt: 1, endedAt: 2, notes: '', updatedAt: 100, deletedAt: null, ...p })

/** Réplica de la forma de la copia de Neon: cada ejercicio importado dos veces con ids aleatorios, rutinas x2 y la sesión del usuario. */
function fixture(): MergeRows {
  const exercises = NAMES.flatMap((n, i) => [ex(`b-${i}`, n), ex(`a-${i}`, n)]) // a- < b-: canónico = a-
  const mk = (p: string, t: string, ex: string) => NAMES.slice(0, 9).map((_, i) => te(`${p}-${i}`, t, `${ex}-${i}`, i))
  return {
    exercises,
    workoutTemplates: [tpl('tpl-b', 'Día A'), tpl('tpl-a', 'día a'), tpl('tpl-user', 'Nueva rutina'), tpl('tpl-del', 'FORUS I', { deletedAt: 9 })],
    templateExercises: [
      ...mk('x', 'tpl-b', 'b'),
      ...mk('y', 'tpl-a', 'a'),
      te('u-0', 'tpl-user', 'b-3', 0, { targetWeightKg: 30 }),
      te('u-1', 'tpl-user', 'a-20', 1, { targetWeightKg: 60 }),
    ],
    sessions: [session('s-live', 'tpl-user', { endedAt: null }), session('s-old', 'tpl-del', { deletedAt: 9 }), session('s-dup', 'tpl-b')],
    setLogs: [
      log('l1', 's-live', 'b-3'), log('l2', 's-live', 'a-3', { setIndex: 1 }), log('l3', 's-live', 'b-20'),
      log('dead', 's-old', 'b-1', { deletedAt: 9 }),
    ],
  }
}

const apply = (rows: MergeRows, now: number): MergeRows => {
  const plan = planMerge(rows, now)
  const sub = <T extends { id: string }>(list: T[], changed: T[]) => list.map((r) => changed.find((c) => c.id === r.id) ?? r)
  return {
    exercises: sub(rows.exercises, plan.exercises),
    workoutTemplates: sub(rows.workoutTemplates, plan.workoutTemplates),
    templateExercises: sub(rows.templateExercises, plan.templateExercises),
    sessions: sub(rows.sessions, plan.sessions),
    setLogs: sub(rows.setLogs, plan.setLogs),
  }
}
const alive = <T extends { deletedAt: number | null }>(l: T[]) => l.filter((r) => !r.deletedAt)

describe('planMerge', () => {
  it('deja 35 ejercicios y las rutinas vivas, sin perder series ni sesiones, con referencias válidas', () => {
    const before = fixture()
    const after = apply(before, 50)
    expect(alive(after.exercises)).toHaveLength(35)
    expect(alive(after.workoutTemplates).map((t) => t.id).sort()).toEqual(['tpl-a', 'tpl-user'])
    expect(alive(after.sessions)).toHaveLength(2) // s-live y s-dup
    expect(alive(after.setLogs)).toHaveLength(alive(before.setLogs).length)
    const liveEx = new Set(alive(after.exercises).map((e) => e.id))
    for (const l of alive(after.setLogs)) expect(liveEx.has(l.exerciseId), l.id).toBe(true)
    for (const t of alive(after.templateExercises)) expect(liveEx.has(t.exerciseId), t.id).toBe(true)
    const liveTpl = new Set(alive(after.workoutTemplates).map((t) => t.id))
    for (const s of alive(after.sessions)) expect(liveTpl.has(s.templateId!), s.id).toBe(true)
    expect(after.sessions.find((s) => s.id === 's-dup')!.templateId).toBe('tpl-a')
  })

  it('nunca borra físicamente: solo marca deletedAt', () => {
    const before = fixture()
    const after = apply(before, 50)
    expect(after.exercises).toHaveLength(before.exercises.length)
    expect(after.templateExercises).toHaveLength(before.templateExercises.length)
    expect(after.setLogs).toHaveLength(before.setLogs.length)
  })

  it('fusiona las filas de las rutinas duplicadas sin repetir ejercicio y con posiciones consecutivas', () => {
    const after = apply(fixture(), 50)
    const rows = alive(after.templateExercises).filter((t) => t.templateId === 'tpl-a').sort((a, b) => a.position - b.position)
    expect(rows.map((t) => t.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(new Set(rows.map((t) => t.exerciseId)).size).toBe(9)
  })

  it('conserva lo editado por el usuario: la fila más reciente aporta sus valores', () => {
    const rows = fixture()
    const edited = rows.templateExercises.find((t) => t.id === 'x-2')!
    edited.targetWeightKg = 77
    edited.updatedAt = 500
    const after = apply(rows, 50)
    expect(after.templateExercises.find((t) => t.id === 'y-2')!.targetWeightKg).toBe(77)
  })

  it('no borra la rutina del usuario aunque otra se fusione, y re-apunta sus filas y series', () => {
    const after = apply(fixture(), 50)
    const user = alive(after.templateExercises).filter((t) => t.templateId === 'tpl-user').sort((a, b) => a.position - b.position)
    expect(user.map((t) => [t.exerciseId, t.targetWeightKg])).toEqual([['a-3', 30], ['a-20', 60]])
    expect(after.setLogs.filter((l) => l.sessionId === 's-live').map((l) => l.exerciseId)).toEqual(['a-3', 'a-3', 'a-20'])
  })

  it('es idempotente', () => {
    const once = apply(fixture(), 50)
    expect(mergeSize(planMerge(once, 60))).toBe(0)
  })

  it('converge entre dispositivos: mismo resultado con otro orden de filas y otro instante', () => {
    const a = fixture()
    const b = fixture()
    b.exercises.reverse()
    b.templateExercises.reverse()
    const canon = (r: MergeRows, now: number) =>
      JSON.stringify(
        Object.values(r).map((list) =>
          (list as { id: string; updatedAt: number; deletedAt: number | null }[])
            .map((x) => ({ ...x, updatedAt: 0, deletedAt: x.deletedAt === now ? -1 : x.deletedAt }))
            .sort((p, q) => p.id.localeCompare(q.id)),
        ),
      )
    expect(canon(apply(a, 50), 50)).toBe(canon(apply(b, 70), 70))
  })

  it('el mínimo global de un grupo nunca lo borra ningún dispositivo, aunque decidan con datos distintos', () => {
    const empty = { templateExercises: [], setLogs: [], sessions: [], workoutTemplates: [] }
    const deviceA = planMerge({ ...empty, exercises: [ex('m-1', 'Curl'), ex('m-2', 'Curl')] }, 1)
    const deviceB = planMerge({ ...empty, exercises: [ex('m-0', 'Curl'), ex('m-1', 'Curl'), ex('m-2', 'Curl')] }, 2)
    const deleted = new Set([...deviceA.exercises, ...deviceB.exercises].map((e) => e.id))
    expect(deleted.has('m-0')).toBe(false)
    expect(deleted.has('m-1') && deleted.has('m-2') && deleted.has('m-0')).toBe(false)
  })

  it('un ejercicio sin duplicados no se toca', () => {
    const rows = { exercises: [ex('solo', 'Único')], templateExercises: [], setLogs: [log('l', 's', 'solo')], sessions: [], workoutTemplates: [] }
    expect(mergeSize(planMerge(rows, 1))).toBe(0)
  })
})
