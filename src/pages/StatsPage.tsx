import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Page, card, inputCls } from '../components/ui'
import { alive, db } from '../db/db'
import { MUSCLE_LABELS } from '../lib/labels'
import { usePrefs } from '../lib/prefs'
import { exerciseHistory, muscleStats } from '../lib/stats'
import { fromKg, roundTo } from '../lib/units'

export default function StatsPage() {
  const { unit } = usePrefs()
  const logs = useLiveQuery(() => db.setLogs.filter(alive).toArray())
  const exercises = useLiveQuery(() => db.exercises.filter(alive).toArray())
  const [exerciseId, setExerciseId] = useState('')
  if (!logs || !exercises) return null

  const stats = muscleStats(logs, exercises).sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999))
  const maxSets = Math.max(1, ...stats.map((s) => s.sets30))
  const done = new Set(logs.map((l) => l.exerciseId))
  const trained = exercises.filter((e) => done.has(e.id)).sort((a, b) => a.name.localeCompare(b.name))
  const selected = exerciseId || trained[0]?.id
  const history = selected ? exerciseHistory(logs, selected) : []

  return (
    <Page title="Estadísticas">
      <section className={`${card} p-4`}>
        <h2 className="font-semibold mb-3">Grupos musculares</h2>
        <div className="space-y-3">
          {stats.map((s) => (
            <div key={s.muscle}>
              <div className="flex justify-between text-sm">
                <span className="font-medium">{MUSCLE_LABELS[s.muscle]}</span>
                <span className={s.daysSince == null || s.daysSince >= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500'}>
                  {s.daysSince == null ? 'sin datos' : s.daysSince === 0 ? 'hoy' : `hace ${s.daysSince} d`} · 7 d: {s.sets7} · 30 d: {s.sets30} series
                </span>
              </div>
              <div className="mt-1 h-2 rounded bg-zinc-200 dark:bg-zinc-800">
                <div className="h-2 rounded bg-blue-600" style={{ width: `${(s.sets30 / maxSets) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={`${card} p-4 space-y-3`}>
        <h2 className="font-semibold">Progreso por ejercicio</h2>
        {trained.length === 0 ? (
          <p className="text-zinc-500">Completa alguna serie para ver tu progreso.</p>
        ) : (
          <>
            <select className={inputCls} value={selected} onChange={(e) => setExerciseId(e.target.value)}>
              {trained.map((e) => <option key={e.id} value={e.id} className="text-black">{e.name}</option>)}
            </select>
            <LineChart values={history.map((h) => roundTo(fromKg(h.e1rm, unit), 0.5))} unit={unit} />
            <p className="text-xs text-zinc-500">1RM estimado (Epley) por sesión, {history.length} sesiones.</p>
          </>
        )}
      </section>
    </Page>
  )
}

function LineChart({ values, unit }: { values: number[]; unit: string }) {
  if (values.length < 2) return <p className="text-sm text-zinc-500">Necesitas al menos 2 sesiones. Último: {values[0] ?? '—'} {unit}</p>
  const W = 300, H = 120, P = 8
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [P + (i / (values.length - 1)) * (W - 2 * P), H - P - ((v - min) / span) * (H - 2 * P)])
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolución del 1RM estimado">
        <polyline fill="none" stroke="#2563eb" strokeWidth="2" points={pts.map((p) => p.join(',')).join(' ')} />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#2563eb" />)}
      </svg>
      <div className="flex justify-between text-xs text-zinc-500">
        <span>{min} {unit}</span><span>{max} {unit}</span>
      </div>
    </div>
  )
}
