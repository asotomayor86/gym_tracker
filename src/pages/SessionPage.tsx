import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, CommitInput, Page, card, inputCls } from '../components/ui'
import { alive, db, remove, save } from '../db/db'
import { fmtDate } from '../lib/labels'
import { setPrefs, usePrefs } from '../lib/prefs'
import { suggestNext } from '../lib/progression'
import { isDone, lastSessionSets } from '../lib/stats'
import { EFFORT_LABELS, type Effort, type SetLog } from '../lib/types'
import { formatWeight, fromKg, roundTo, toKg } from '../lib/units'

const EFFORT_STYLE: Record<Effort, string> = {
  easy_done: 'bg-green-600 border-green-600',
  hard_done: 'bg-yellow-500 border-yellow-500',
  failed_close: 'bg-orange-500 border-orange-500',
  failed: 'bg-red-600 border-red-600',
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
      title={fmtDate(session.startedAt)}
      actions={
        <div className="flex gap-1 rounded-lg border border-zinc-300 dark:border-zinc-700 p-0.5">
          {(['kg', 'lb'] as const).map((u) => (
            <button key={u} onClick={() => setPrefs({ unit: u })} className={`px-3 min-h-10 rounded-md ${unit === u ? 'bg-blue-600 text-white' : ''}`}>
              {u}
            </button>
          ))}
        </div>
      }
    >
      {groups.map((eid) => {
        const sets = logs.filter((l) => l.exerciseId === eid).sort((a, b) => a.setIndex - b.setIndex)
        const sug = suggestNext(lastSessionSets(allLogs, eid, session.id), { incrementKg })
        return (
          <section key={eid} className={`${card} p-3 space-y-2`}>
            <div className="font-semibold">{exName(eid)}</div>
            {sug && (
              <div className="text-xs text-zinc-500">
                Sugerencia: {formatWeight(sug.weightKg, unit)} × {sug.reps} · {sug.reason}
              </div>
            )}
            {sets.map((l, i) => (
              <div key={l.id} className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 text-sm text-zinc-500">{i + 1}</span>
                  <CommitInput
                    type="number" inputMode="decimal" aria-label="Peso" className={`${inputCls} text-center`}
                    value={roundTo(fromKg(l.weightKg, unit), 0.5)}
                    onCommit={(v) => {
                      const w = parseFloat(v)
                      if (Number.isFinite(w) && w >= 0) patchLog(l, { weightKg: toKg(w, unit), inputUnit: unit, inputWeight: w })
                    }}
                  />
                  <span className="text-sm text-zinc-500">{unit}</span>
                  <CommitInput
                    type="number" inputMode="numeric" aria-label="Repeticiones" className={`${inputCls} text-center`}
                    value={l.reps}
                    onCommit={(v) => Number.isFinite(parseInt(v)) && patchLog(l, { reps: Math.max(0, parseInt(v)) })}
                  />
                  <span className="text-sm text-zinc-500">reps</span>
                  <button aria-label="Quitar serie" className="px-2 text-zinc-400" onClick={() => remove('setLogs', l.id)}>✕</button>
                </div>
                <div className="grid grid-cols-4 gap-1.5 pl-8">
                  {EFFORTS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setEffort(l, e)}
                      className={`min-h-11 rounded-lg border text-sm font-medium ${
                        l.effort === e ? `${EFFORT_STYLE[e]} text-white` : 'border-zinc-300 dark:border-zinc-700'
                      }`}
                    >
                      {EFFORT_LABELS[e]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Button variant="ghost" onClick={() => addSet(eid)}>+ Serie</Button>
          </section>
        )
      })}

      <select
        className={inputCls}
        value=""
        onChange={async (e) => e.target.value && addSet(e.target.value)}
      >
        <option value="" className="text-black">+ Añadir ejercicio a la sesión…</option>
        {[...exercises].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
          <option key={e.id} value={e.id} className="text-black">{e.name}</option>
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

  return (
    <div className="fixed bottom-20 md:bottom-6 inset-x-4 md:inset-x-auto md:right-6 z-30 flex items-center justify-between gap-4 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-3 shadow-lg">
      <span>{left > 0 ? 'Descanso' : '¡A por la siguiente!'}</span>
      <span className="text-2xl font-mono tabular-nums">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </span>
      <button onClick={onClose} className="px-2 min-h-11" aria-label="Cerrar">✕</button>
    </div>
  )
}
