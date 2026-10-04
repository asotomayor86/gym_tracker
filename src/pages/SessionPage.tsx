import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LastAttemptButton } from '../components/LastAttempt'
import { CreateRoutineButton } from '../components/CreateRoutine'
import { GuideToggle } from '../components/ExerciseGuideView'
import { ExercisePicker } from '../components/gym/ExercisePicker'
import { AvailabilityChip } from '../components/gym/GymUI'
import { useGymContext } from '../components/gym/useGymContext'
import { RestTimer, type Rest } from '../components/RestTimer'
import { DragHandle, MoveButtons, SortableItem, SortableList } from '../components/Sortable'
import { Button, CommitInput, NameEn, Page, inputCls } from '../components/ui'
import { alive, db, remove, save } from '../db/db'
import { unlockAudio } from '../lib/restAudio'
import { addSetToSession, reorderSessionExercises, sessionExerciseIds } from '../lib/order'
import { fmtDate } from '../lib/labels'
import { fmtKg, roundHalf } from '../components/weight/weightFormat'
import { usePrefs } from '../lib/prefs'
import { suggestNext } from '../lib/progression'
import { isDone, lastSessionSets } from '../lib/stats'
import { EFFORT_LABELS, type Effort, type SetLog } from '../lib/types'

/** Icono por esfuerzo: la información no depende solo del color (daltonismo). */
const EFFORT_ICON: Record<Effort, string> = { easy_done: '✓', hard_done: '●', failed_close: '▲', failed: '✕' }
const EFFORT_DOT: Record<Effort, string> = { easy_done: 'bg-e-easy', hard_done: 'bg-e-hard', failed_close: 'bg-e-close', failed: 'bg-e-fail' }

const EFFORT_STYLE: Record<Effort, string> = {
  easy_done: 'bg-e-easy text-e-easy-ink shadow-[0_0_18px_rgb(52_199_123/0.4)]',
  hard_done: 'bg-e-hard text-on-signal shadow-[0_0_20px_rgb(255_176_0/0.45)]',
  failed_close: 'bg-e-close text-on-signal shadow-[0_0_18px_rgb(255_122_26/0.4)]',
  failed: 'bg-e-fail text-on-signal shadow-[0_0_18px_rgb(255_90_54/0.4)]',
}
const EFFORTS = Object.keys(EFFORT_LABELS) as Effort[]

export default function SessionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { incrementKg } = usePrefs()
  const [rest, setRest] = useState<Rest | null>(null)
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  const { gym, avail } = useGymContext()

  const session = useLiveQuery(() => db.sessions.get(id!), [id])
  const logs = useLiveQuery(() => db.setLogs.where('sessionId').equals(id!).filter(alive).toArray(), [id])
  const allLogs = useLiveQuery(() => db.setLogs.filter(alive).toArray())
  const exercises = useLiveQuery(() => db.exercises.filter(alive).toArray())
  const items = useLiveQuery(
    () => (session?.templateId ? db.templateExercises.where('templateId').equals(session.templateId).filter(alive).toArray() : []),
    [session?.templateId],
  )
  if (!session || !logs || !allLogs || !exercises || !items) return <Page title="Sesión"><p>No encontrada.</p></Page>

  const exById = new Map(exercises.map((e) => [e.id, e]))
  const exEn = (eid: string) => exercises.find((e) => e.id === eid)?.nameEn
  const exName = (eid: string) => exercises.find((e) => e.id === eid)?.name ?? 'Ejercicio'
  // orden de alta (exerciseOrder); mientras se guarda un arrastre se muestra el orden nuevo sin parpadeo
  const stored = sessionExerciseIds(logs)
  const groups = localOrder && localOrder.length === stored.length && localOrder.every((x) => stored.includes(x)) ? localOrder : stored
  const reorder = async (next: string[]) => {
    setLocalOrder(next)
    await reorderSessionExercises(session.id, next)
    requestAnimationFrame(() => setLocalOrder(null))
  }
  const move = (eid: string, dir: -1 | 1) => {
    const i = groups.indexOf(eid), j = i + dir
    if (j < 0 || j >= groups.length) return
    const next = [...groups]
    ;[next[i], next[j]] = [next[j], next[i]]
    void reorder(next)
  }
  const finished = !!session.endedAt

  const patchLog = (l: SetLog, patch: Partial<SetLog>) => save('setLogs', { ...l, ...patch })

  const setEffort = async (l: SetLog, effort: Effort) => {
    unlockAudio()
    if (l.effort === effort) return patchLog(l, { effort: null, completedAt: null })
    await patchLog(l, { effort, completedAt: Date.now() })
    const restS = items.find((i) => i.exerciseId === l.exerciseId)?.restS ?? 90
    if (restS > 0) setRest({ id: Date.now(), until: Date.now() + restS * 1000, total: restS, label: `${exName(l.exerciseId)} · serie ${l.setIndex + 1}` })
  }

  /** Rellena peso y repeticiones sugeridos en las series aún sin completar de un ejercicio. */
  const applySuggestion = async (eid: string, v: { weightKg: number; reps: number }) => {
    const pending = logs.filter((l) => l.exerciseId === eid && !isDone(l))
    for (const l of pending) await patchLog(l, { weightKg: v.weightKg, reps: v.reps, inputUnit: 'kg', inputWeight: roundHalf(v.weightKg) })
    return pending.length
  }

  const addSet = (eid: string) => addSetToSession(session.id, eid, 'kg')

  const finish = async () => {
    for (const l of logs) if (!isDone(l)) await remove('setLogs', l.id)
    await save('sessions', { ...session, endedAt: Date.now() })
    navigate('/')
  }

  const discard = async () => {
    if (!confirm('¿Descartar esta sesión y todas sus series?')) return
    for (const l of logs) await remove('setLogs', l.id)
    await remove('sessions', session.id)
    navigate('/')
  }

  return (
    <Page
      title="Sesión"
      eyebrow={`${fmtDate(session.startedAt)}${finished ? ' · cerrada' : ' · en curso'}`}
    >
      {rest && (
        <RestTimer
          key={rest.id}
          rest={rest}
          onClose={() => setRest(null)}
          onAdjust={(d) => setRest((r) => (r ? { ...r, until: Math.max(Date.now(), r.until + d * 1000), total: Math.max(5, r.total + d) } : r))}
        />
      )}
      <SortableList ids={groups} onReorder={reorder}>
      {groups.map((eid, gi) => {
        const sets = logs.filter((l) => l.exerciseId === eid).sort((a, b) => a.setIndex - b.setIndex)
        const sug = suggestNext(lastSessionSets(allLogs, eid, session.id), { incrementKg })
        return (
          <SortableItem key={eid} id={eid}>
          {({ handle }) => (
          <section className="mb-7">
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-2">
              {!finished && <DragHandle handle={handle} label={exName(eid)} />}
              <span className="num text-xs text-signal-text">{String(gi + 1).padStart(2, '0')}</span>
              <div className="min-w-0 flex-1 basis-40">
                <h2 className="display text-xl leading-snug [overflow-wrap:anywhere]">{exName(eid)}</h2>
                <NameEn className="mt-0.5 text-sm">{exEn(eid)}</NameEn>
                {gym && avail(eid) !== 'available' && <div className="mt-1"><AvailabilityChip status={avail(eid)} gymName={gym.name} /></div>}
              </div>
              {!finished && groups.length > 1 && <MoveButtons label={exName(eid)} first={gi === 0} last={gi === groups.length - 1} onMove={(dir) => move(eid, dir)} />}
              {!finished && <LastAttemptButton exerciseId={eid} exerciseName={exName(eid)} exerciseNameEn={exEn(eid)} excludeSessionId={session.id} onApply={(v) => applySuggestion(eid, v)} />}
              {exById.get(eid) && <GuideToggle exercise={exById.get(eid)!} />}
            </div>
            {sug && (
              <div className="mb-2 rounded-xl bg-signal/10 px-3 py-2 text-xs">
                <span className="text-mute">Sugerido </span>
                <b className="text-signal-text">{fmtKg(sug.weightKg)} × {sug.reps}</b>
                <span className="text-mute"> · {sug.reason}</span>
              </div>
            )}
            {sets.map((l, i) => (
              <div key={l.id} className={`glass mb-3 p-3 transition-colors ${isDone(l) ? 'border-signal/40' : ''}`}>
                <div className="flex items-end gap-3">
                  <span className="num w-6 pb-2.5 text-xs text-mute">{String(i + 1).padStart(2, '0')}</span>
                  <label className="flex-1">
                    <span className="eyebrow">kg</span>
                    <CommitInput
                      type="number" inputMode="decimal" aria-label="Peso" className={`${inputCls} num text-center text-2xl`}
                      value={roundHalf(l.weightKg)}
                      onCommit={(v) => {
                        const w = parseFloat(v)
                        if (Number.isFinite(w) && w >= 0) patchLog(l, { weightKg: w, inputUnit: 'kg', inputWeight: w })
                      }}
                    />
                  </label>
                  <span className="pb-2 text-xl text-mute">×</span>
                  <label className="flex-1">
                    <span className="eyebrow">reps</span>
                    <CommitInput
                      type="number" inputMode="numeric" aria-label="Repeticiones" className={`${inputCls} num text-center text-2xl`}
                      value={l.reps}
                      onCommit={(v) => Number.isFinite(parseInt(v)) && patchLog(l, { reps: Math.max(0, parseInt(v)) })}
                    />
                  </label>
                  <button aria-label="Quitar serie" className="pb-2 px-1 text-mute hover:text-e-fail" onClick={() => remove('setLogs', l.id)}>✕</button>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5 pl-9">
                  {EFFORTS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setEffort(l, e)}
                      aria-pressed={l.effort === e}
                      className={`press flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold transition-colors ${
                        l.effort === e ? EFFORT_STYLE[e] : 'bg-ink/5 text-mute hover:text-ink'
                      }`}
                    >
                      <span aria-hidden className={l.effort === e ? 'text-sm leading-none' : `grid size-4 place-items-center rounded-full text-[0.62rem] leading-none text-e-easy-ink ${EFFORT_DOT[e]}`}>{EFFORT_ICON[e]}</span>
                      {EFFORT_LABELS[e]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Button variant="ghost" className="w-full" onClick={() => addSet(eid)}>+ Serie</Button>
          </section>
          )}
          </SortableItem>
        )
      })}
      </SortableList>

      <ExercisePicker exercises={exercises} label="+ Añadir ejercicio" excludeSessionId={session.id} onPick={(id) => void addSet(id)} />

      <div className="flex gap-2">
        {!finished && <Button className="flex-1" onClick={finish}>Terminar sesión</Button>}
        {finished && <Button className="flex-1" variant="ghost" onClick={() => navigate('/')}>Volver</Button>}
        {finished && <CreateRoutineButton sessionId={session.id} startedAt={session.startedAt} className="shrink-0 !min-h-11 text-sm" />}
        <Button variant="danger" onClick={discard}>Descartar</Button>
      </div>

    </Page>
  )
}
