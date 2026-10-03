import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GuideToggle } from '../components/ExerciseGuideView'
import { Button, CommitInput, Page, inputCls } from '../components/ui'
import { alive, db, remove, save } from '../db/db'
import { fmtDate } from '../lib/labels'
import { setPrefs, usePrefs } from '../lib/prefs'
import { suggestNext } from '../lib/progression'
import { isDone, lastSessionSets } from '../lib/stats'
import { EFFORT_LABELS, type Effort, type SetLog } from '../lib/types'
import { formatWeight, fromKg, roundTo, toKg } from '../lib/units'

const EFFORT_STYLE: Record<Effort, string> = {
  easy_done: 'bg-e-easy text-paper',
  hard_done: 'bg-e-hard text-ink',
  failed_close: 'bg-e-close text-ink',
  failed: 'bg-e-fail text-paper',
}
const EFFORTS = Object.keys(EFFORT_LABELS) as Effort[]

export default function SessionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { unit, incrementKg } = usePrefs()
  const [restUntil, setRestUntil] = useState<number | null>(null)

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
  const exName = (eid: string) => exercises.find((e) => e.id === eid)?.name ?? 'Ejercicio'
  const position = (eid: string) => items.find((i) => i.exerciseId === eid)?.position ?? 1000
  const groups = [...new Set(logs.map((l) => l.exerciseId))].sort(
    (a, b) => position(a) - position(b) || exName(a).localeCompare(exName(b)),
  )
  const finished = !!session.endedAt

  const patchLog = (l: SetLog, patch: Partial<SetLog>) => save('setLogs', { ...l, ...patch })

  const setEffort = async (l: SetLog, effort: Effort) => {
    if (l.effort === effort) return patchLog(l, { effort: null, completedAt: null })
    await patchLog(l, { effort, completedAt: Date.now() })
    const rest = items.find((i) => i.exerciseId === l.exerciseId)?.restS ?? 90
    if (rest > 0) setRestUntil(Date.now() + rest * 1000)
  }

  const addSet = (eid: string) => {
    const mine = logs.filter((l) => l.exerciseId === eid).sort((a, b) => a.setIndex - b.setIndex)
    const last = mine[mine.length - 1]
    return save('setLogs', {
      sessionId: session.id, exerciseId: eid, setIndex: (last?.setIndex ?? -1) + 1,
      reps: last?.reps ?? 10, weightKg: last?.weightKg ?? 20,
      inputUnit: unit, inputWeight: roundTo(fromKg(last?.weightKg ?? 20, unit), 0.5),
      effort: null, completedAt: null,
    })
  }

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
      actions={
        <div className="flex border border-ink">
          {(['kg', 'lb'] as const).map((u) => (
            <button key={u} onClick={() => setPrefs({ unit: u })} className={`mono px-3 min-h-10 text-sm font-bold uppercase ${unit === u ? 'bg-ink text-paper' : ''}`}>
              {u}
            </button>
          ))}
        </div>
      }
    >
      {groups.map((eid, gi) => {
        const sets = logs.filter((l) => l.exerciseId === eid).sort((a, b) => a.setIndex - b.setIndex)
        const sug = suggestNext(lastSessionSets(allLogs, eid, session.id), { incrementKg })
        return (
          <section key={eid}>
            <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-ink pb-1.5">
              <span className="mono text-xs font-bold text-signal">{String(gi + 1).padStart(2, '0')}</span>
              <h2 className="display min-w-0 flex-1 text-3xl">{exName(eid)}</h2>
              {exById.get(eid) && <GuideToggle exercise={exById.get(eid)!} />}
            </div>
            {sug && (
              <div className="mono mb-1 border-l-[3px] border-signal bg-surface px-3 py-1.5 text-xs">
                <span className="text-mute">SUGERIDO </span>
                <b>{formatWeight(sug.weightKg, unit)} × {sug.reps}</b>
                <span className="text-mute"> · {sug.reason}</span>
              </div>
            )}
            {sets.map((l, i) => (
              <div key={l.id} className={`border-b border-hair py-3 ${isDone(l) ? 'bg-surface/70' : ''}`}>
                <div className="flex items-end gap-3">
                  <span className="mono w-6 pb-2 text-sm text-mute">{String(i + 1).padStart(2, '0')}</span>
                  <label className="flex-1">
                    <span className="eyebrow">{unit}</span>
                    <CommitInput
                      type="number" inputMode="decimal" aria-label="Peso" className={`${inputCls} mono text-center text-3xl font-bold`}
                      value={roundTo(fromKg(l.weightKg, unit), 0.5)}
                      onCommit={(v) => {
                        const w = parseFloat(v)
                        if (Number.isFinite(w) && w >= 0) patchLog(l, { weightKg: toKg(w, unit), inputUnit: unit, inputWeight: w })
                      }}
                    />
                  </label>
                  <span className="display pb-2 text-2xl text-mute">×</span>
                  <label className="flex-1">
                    <span className="eyebrow">reps</span>
                    <CommitInput
                      type="number" inputMode="numeric" aria-label="Repeticiones" className={`${inputCls} mono text-center text-3xl font-bold`}
                      value={l.reps}
                      onCommit={(v) => Number.isFinite(parseInt(v)) && patchLog(l, { reps: Math.max(0, parseInt(v)) })}
                    />
                  </label>
                  <button aria-label="Quitar serie" className="pb-2 px-1 text-mute hover:text-e-fail" onClick={() => remove('setLogs', l.id)}>✕</button>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-px border border-ink bg-ink pl-0 ml-9">
                  {EFFORTS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setEffort(l, e)}
                      className={`min-h-11 text-xs font-bold uppercase tracking-wider transition-colors ${
                        l.effort === e ? EFFORT_STYLE[e] : 'bg-paper text-mute hover:text-ink'
                      }`}
                    >
                      {EFFORT_LABELS[e]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Button variant="ghost" className="mt-3 w-full" onClick={() => addSet(eid)}>+ Serie</Button>
          </section>
        )
      })}

      <select
        className={`${inputCls} bg-paper`}
        value=""
        onChange={async (e) => e.target.value && addSet(e.target.value)}
      >
        <option value="">+ Añadir ejercicio a la sesión…</option>
        {[...exercises].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>

      <div className="flex gap-2">
        {!finished && <Button className="flex-1" onClick={finish}>Terminar sesión</Button>}
        {finished && <Button className="flex-1" variant="ghost" onClick={() => navigate('/')}>Volver</Button>}
        <Button variant="danger" onClick={discard}>Descartar</Button>
      </div>

      {restUntil && <RestTimer until={restUntil} onClose={() => setRestUntil(null)} />}
    </Page>
  )
}

function RestTimer({ until, onClose }: { until: number; onClose: () => void }) {
  const [now, setNow] = useState(Date.now())
  const left = Math.max(0, Math.ceil((until - now) / 1000))

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [until])

  useEffect(() => {
    if (left === 0) navigator.vibrate?.([200, 100, 200])
  }, [left])

  const ready = left === 0
  return (
    <div
      className={`fixed bottom-20 md:bottom-6 inset-x-4 md:inset-x-auto md:right-6 md:w-80 z-30 flex items-center justify-between gap-4 border-2 border-ink px-4 py-3 ${
        ready ? 'bg-signal text-on-signal' : 'bg-ink text-paper'
      }`}
    >
      <span className="eyebrow !text-current opacity-70">{ready ? '¡Siguiente serie!' : 'Descanso'}</span>
      <span className="mono text-4xl font-bold leading-none">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </span>
      <button onClick={onClose} className="px-2 min-h-11" aria-label="Cerrar">✕</button>
    </div>
  )
}

