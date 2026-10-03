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
  easy_done: 'bg-e-easy text-e-easy-ink',
  hard_done: 'bg-e-hard text-on-signal shadow-[0_0_20px_rgb(255_176_0/0.45)]',
  failed_close: 'bg-e-close text-on-signal',
  failed: 'bg-e-fail text-on-signal',
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
        <div className="glass flex rounded-full p-1">
          {(['kg', 'lb'] as const).map((u) => (
            <button key={u} onClick={() => setPrefs({ unit: u })} className={`rounded-full px-3.5 min-h-9 text-sm font-semibold transition-colors ${unit === u ? 'bg-signal text-on-signal' : 'text-mute'}`}>
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
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="num text-xs text-signal-text">{String(gi + 1).padStart(2, '0')}</span>
              <h2 className="display min-w-0 flex-1 text-xl leading-snug">{exName(eid)}</h2>
              {exById.get(eid) && <GuideToggle exercise={exById.get(eid)!} />}
            </div>
            {sug && (
              <div className="mb-2 rounded-xl bg-signal/10 px-3 py-2 text-xs">
                <span className="text-mute">Sugerido </span>
                <b className="text-signal-text">{formatWeight(sug.weightKg, unit)} × {sug.reps}</b>
                <span className="text-mute"> · {sug.reason}</span>
              </div>
            )}
            {sets.map((l, i) => (
              <div key={l.id} className={`glass mb-3 p-3 transition-colors ${isDone(l) ? 'border-signal/40' : ''}`}>
                <div className="flex items-end gap-3">
                  <span className="num w-6 pb-2.5 text-xs text-mute">{String(i + 1).padStart(2, '0')}</span>
                  <label className="flex-1">
                    <span className="eyebrow">{unit}</span>
                    <CommitInput
                      type="number" inputMode="decimal" aria-label="Peso" className={`${inputCls} num text-center text-2xl`}
                      value={roundTo(fromKg(l.weightKg, unit), 0.5)}
                      onCommit={(v) => {
                        const w = parseFloat(v)
                        if (Number.isFinite(w) && w >= 0) patchLog(l, { weightKg: toKg(w, unit), inputUnit: unit, inputWeight: w })
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
                      className={`press min-h-11 rounded-xl text-xs font-semibold transition-colors ${
                        l.effort === e ? EFFORT_STYLE[e] : 'bg-ink/5 text-mute hover:text-ink'
                      }`}
                    >
                      {EFFORT_LABELS[e]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Button variant="ghost" className="w-full" onClick={() => addSet(eid)}>+ Serie</Button>
          </section>
        )
      })}

      <select
        className={inputCls}
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
    <div className="glass-flat fixed bottom-24 md:bottom-6 inset-x-4 md:inset-x-auto md:right-6 md:w-80 z-30 flex items-center gap-4 px-4 py-3 shadow-[0_8px_30px_rgb(0_0_0/0.35)]">
      <div className="relative size-12 shrink-0" aria-hidden>
        {!ready && <><div className="pulse-ring" /><div className="pulse-ring" style={{ animationDelay: '-1.4s' }} /></>}
        <div className="absolute inset-3.5 rounded-full bg-[radial-gradient(circle,#fff3d0,#ffb000)]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="eyebrow">{ready ? '¡Siguiente serie!' : 'Descanso'}</div>
        <div className="num text-3xl leading-tight">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </div>
      </div>
      <button onClick={onClose} className="press rounded-full border border-hair px-3 min-h-10 text-sm text-mute hover:text-ink" aria-label="Cerrar">✕</button>
    </div>
  )
}
