import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Page, SectionTitle, inputCls } from '../components/ui'
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
    <Page title="Stats" eyebrow="Últimos 30 días">
      <section>
        <SectionTitle n="01" aside="series / 30 d">Grupos musculares</SectionTitle>
        <div>
          {stats.map((s) => {
            const stale = s.daysSince == null || s.daysSince >= 7
            return (
              <div key={s.muscle} className="border-b border-hair py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="display text-xl">{MUSCLE_LABELS[s.muscle]}</span>
                  <span className="mono text-xs text-mute">
                    <span className={stale ? 'font-bold text-signal' : ''}>
                      {s.daysSince == null ? 'sin datos' : s.daysSince === 0 ? 'hoy' : `hace ${s.daysSince} d`}
                    </span>
                    {' · '}7d {s.sets7} · <b className="text-ink">{s.sets30}</b>
                  </span>
                </div>
                <div className="mt-1.5 h-2 bg-ink/10">
                  <div className={`h-2 ${stale ? 'bg-ink/40' : 'bg-signal'}`} style={{ width: `${(s.sets30 / maxSets) * 100}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle n="02">Progreso por ejercicio</SectionTitle>
        {trained.length === 0 ? (
          <p className="text-mute">Completa alguna serie para ver tu progreso.</p>
        ) : (
          <>
            <select className={`${inputCls} bg-paper font-semibold`} value={selected} onChange={(e) => setExerciseId(e.target.value)}>
              {trained.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <LineChart values={history.map((h) => roundTo(fromKg(h.e1rm, unit), 0.5))} unit={unit} />
            <p className="eyebrow">1RM estimado (Epley) por sesión · {history.length} sesiones</p>
          </>
        )}
      </section>
    </Page>
  )
}

function LineChart({ values, unit }: { values: number[]; unit: string }) {
  if (values.length < 2) return <p className="text-sm text-mute">Necesitas al menos 2 sesiones. Último: {values[0] ?? '—'} {unit}</p>
  const W = 300, H = 130, P = 10
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [P + (i / (values.length - 1)) * (W - 2 * P), H - P - ((v - min) / span) * (H - 2 * P)])
  const last = pts[pts.length - 1]
  return (
    <div className="border border-ink bg-surface p-3">
      <div className="mono mb-2 flex items-baseline justify-between">
        <span className="text-4xl font-bold">{values[values.length - 1]}<span className="ml-1 text-sm text-mute">{unit}</span></span>
        <span className="eyebrow">máx {max} · mín {min}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolución del 1RM estimado">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--hair)" />)}
        <polyline fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="miter" points={pts.map((p) => p.join(',')).join(' ')} />
        {pts.slice(0, -1).map((p, i) => <rect key={i} x={p[0] - 2.5} y={p[1] - 2.5} width="5" height="5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.5" />)}
        <rect x={last[0] - 5} y={last[1] - 5} width="10" height="10" fill="var(--signal)" stroke="var(--ink)" strokeWidth="1.5" />
      </svg>
    </div>
  )
}
