import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SyncBanner } from '../components/SyncUI'
import { Button, EmptyState, HeatBar, Page, SectionTitle } from '../components/ui'
import { alive, db } from '../db/db'
import { MUSCLE_LABELS, fmtDate } from '../lib/labels'
import { startSession } from '../lib/session'
import { isDone, muscleStats } from '../lib/stats'

export default function HomePage() {
  const navigate = useNavigate()
  const [today] = useState(() => Date.now())
  const templates = useLiveQuery(() => db.workoutTemplates.filter(alive).toArray())
  const sessions = useLiveQuery(() => db.sessions.filter(alive).toArray())
  const logs = useLiveQuery(() => db.setLogs.filter(alive).toArray())
  const exercises = useLiveQuery(() => db.exercises.filter(alive).toArray())
  if (!templates || !sessions || !logs || !exercises) return null

  const active = sessions.find((s) => !s.endedAt)
  const recent = [...sessions].filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt).slice(0, 5)
  const neglected = muscleStats(logs, exercises)
    .filter((m) => m.daysSince == null || m.daysSince >= 7)
    .sort((a, b) => (b.daysSince ?? 999) - (a.daysSince ?? 999))
    .slice(0, 3)
  const tName = (id: string | null) => templates.find((t) => t.id === id)?.name ?? 'Sesión libre'

  return (
    <Page title="Hoy" eyebrow={fmtDate(today)}>
      <SyncBanner />
      {active && (
        <Link
          to={`/session/${active.id}`}
          className="press glow group flex items-center justify-between gap-4 rounded-[20px] bg-gradient-to-br from-signal to-signal-2 p-5 text-on-signal"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest opacity-75"><span className="size-2 rounded-full bg-on-signal" /> En curso</div>
            <div className="display mt-2 text-2xl">{tName(active.templateId)}</div>
          </div>
          <span className="display text-3xl transition-transform group-hover:translate-x-1">→</span>
        </Link>
      )}

      <section>
        <SectionTitle n="01">Empezar rutina</SectionTitle>
        {templates.length === 0 && (
          <EmptyState>
            Aún no hay rutinas: crea la primera en <Link className="underline decoration-signal decoration-2 underline-offset-4" to="/templates">Rutinas</Link>.
          </EmptyState>
        )}
        <ul className="space-y-3">
          {templates.map((t) => (
            <li key={t.id} className="glass flex items-center gap-4 p-4">
              <span className="display flex-1 text-lg leading-snug">{t.name}</span>
              <Button disabled={!!active} onClick={async () => navigate(`/session/${await startSession(t.id)}`)}>Empezar</Button>
            </li>
          ))}
        </ul>
      </section>

      {neglected.length > 0 && (
        <section>
          <SectionTitle n="02" aside="Mapa de calor">Llevas tiempo sin trabajar</SectionTitle>
          <div className="glass space-y-4 p-4">
            {neglected.map((m) => (
              <HeatBar
                key={m.muscle}
                label={MUSCLE_LABELS[m.muscle]}
                value={m.daysSince == null ? 6 : Math.max(6, 100 - m.daysSince * 4)}
                max={100}
                cold
                note={m.daysSince == null ? 'sin datos · frío' : `${m.daysSince} d · frío`}
              />
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <SectionTitle n="03">Últimas sesiones</SectionTitle>
          <ul className="glass-flat divide-y divide-hair overflow-hidden">
            {recent.map((s) => (
              <li key={s.id}>
                <Link to={`/session/${s.id}`} className="flex items-baseline gap-3 px-4 py-3.5 hover:bg-ink/5">
                  <span className="w-24 shrink-0 text-xs uppercase tracking-wider text-mute">{fmtDate(s.startedAt)}</span>
                  <span className="flex-1 font-semibold">{tName(s.templateId)}</span>
                  <span className="num text-sm">
                    {logs.filter((l) => l.sessionId === s.id && isDone(l)).length}
                    <span className="text-xs font-normal text-mute"> ser.</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  )
}
