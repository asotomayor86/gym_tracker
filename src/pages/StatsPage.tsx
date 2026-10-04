import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { WeightEvolution } from '../components/weight/WeightEvolution'
import { HeatBar, Page, SectionTitle, inputCls } from '../components/ui'
import { alive, db } from '../db/db'
import { MUSCLE_LABELS } from '../lib/labels'
import { exerciseHistory, muscleStats } from '../lib/stats'
import { roundHalf } from '../components/weight/weightFormat'

export default function StatsPage() {
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
        <div className="glass space-y-4 p-4">
          {stats.map((s) => {
            const stale = s.daysSince == null || s.daysSince >= 7
            return (
              <HeatBar
                key={s.muscle}
                label={MUSCLE_LABELS[s.muscle]}
                value={s.sets30}
                max={maxSets}
                cold={stale}
                note={`${s.daysSince == null ? 'sin datos' : s.daysSince === 0 ? 'hoy' : `hace ${s.daysSince} d`} · 7 d: ${s.sets7} · ${s.sets30} series`}
              />
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
            <select className={`${inputCls} font-semibold`} value={selected} onChange={(e) => setExerciseId(e.target.value)}>
              {trained.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <LineChart values={history.map((h) => roundHalf(h.e1rm))} unit="kg" />
            <p className="eyebrow">1RM estimado (Epley) por sesión · {history.length} sesiones</p>
          </>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle n="03" aside="media móvil de 7 días">Evolución del peso corporal</SectionTitle>
        <WeightEvolution registerLink />
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
    <div className="glass p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="num text-4xl">{values[values.length - 1]}<span className="ml-1 text-sm font-normal text-mute">{unit}</span></span>
        <span className="eyebrow">máx {max} · mín {min}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolución del 1RM estimado">
        <defs>
          <linearGradient id="lc" x1="0" x2="1"><stop offset="0" stopColor="#7b8791" /><stop offset="1" stopColor="#ffb000" /></linearGradient>
          <linearGradient id="lf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ffb000" stopOpacity="0.28" /><stop offset="1" stopColor="#ffb000" stopOpacity="0" /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--hair)" />)}
        <polygon points={`${pts[0][0]},${H} ${pts.map((p) => p.join(',')).join(' ')} ${last[0]},${H}`} fill="url(#lf)" />
        <polyline fill="none" stroke="url(#lc)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={pts.map((p) => p.join(',')).join(' ')} />
        {pts.slice(0, -1).map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--surface)" stroke="var(--mute)" strokeWidth="1.5" />)}
        <circle cx={last[0]} cy={last[1]} r="6" fill="var(--signal)" stroke="var(--surface)" strokeWidth="2" />
      </svg>
    </div>
  )
}
