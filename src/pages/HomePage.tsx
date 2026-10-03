import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Page, SectionTitle } from '../components/ui'
import { alive, db } from '../db/db'
import { MUSCLE_LABELS, fmtDate } from '../lib/labels'
import { startSession } from '../lib/session'
import { isDone, muscleStats } from '../lib/stats'

const pad = (n: number) => String(n).padStart(2, '0')

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
      {active && (
        <Link
          to={`/session/${active.id}`}
          className="group flex items-end justify-between gap-4 border border-ink bg-signal p-4 text-on-signal"
        >
          <div>
            <div className="eyebrow !text-on-signal/70">● En curso</div>
            <div className="display mt-2 text-4xl">{tName(active.templateId)}</div>
          </div>
          <span className="display text-5xl transition-transform group-hover:translate-x-1">→</span>
        </Link>
      )}

      <section>
        <SectionTitle n="01">Empezar rutina</SectionTitle>
        {templates.length === 0 && (
          <p className="text-mute">
            Primero <Link className="underline decoration-signal decoration-2 underline-offset-4" to="/exercises">añade ejercicios</Link> y crea una{' '}
            <Link className="underline decoration-signal decoration-2 underline-offset-4" to="/templates">rutina</Link>.
          </p>
        )}
        <ul>
          {templates.map((t, i) => (
            <li key={t.id} className="flex items-center gap-4 border-b border-hair py-3">
              <span className="mono w-6 text-sm text-mute">{pad(i + 1)}</span>
              <span className="display flex-1 text-3xl">{t.name}</span>
              <Button disabled={!!active} onClick={async () => navigate(`/session/${await startSession(t.id)}`)}>Empezar</Button>
            </li>
          ))}
        </ul>
      </section>

      {neglected.length > 0 && (
        <section>
          <SectionTitle n="02" aside="Abandonados">Llevas tiempo sin trabajar</SectionTitle>
          <div className="grid grid-cols-3 gap-px border border-ink bg-ink">
            {neglected.map((m) => (
              <div key={m.muscle} className="bg-surface p-3">
                <div className="mono text-4xl font-bold leading-none text-signal">
                  {m.daysSince == null ? '—' : m.daysSince}
                  <span className="ml-1 text-xs font-normal text-mute">{m.daysSince == null ? '' : 'd'}</span>
                </div>
                <div className="eyebrow mt-2 !text-ink">{MUSCLE_LABELS[m.muscle]}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <SectionTitle n="03">Últimas sesiones</SectionTitle>
          <ul>
            {recent.map((s) => (
              <li key={s.id}>
                <Link to={`/session/${s.id}`} className="flex items-baseline gap-3 border-b border-hair py-3 hover:bg-surface">
                  <span className="mono w-24 shrink-0 text-xs uppercase text-mute">{fmtDate(s.startedAt)}</span>
                  <span className="flex-1 font-semibold">{tName(s.templateId)}</span>
                  <span className="mono text-sm">
                    {logs.filter((l) => l.sessionId === s.id && isDone(l)).length}
                    <span className="text-mute"> ser.</span>
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
