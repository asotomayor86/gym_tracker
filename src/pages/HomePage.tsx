import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Page, card } from '../components/ui'
import { alive, db } from '../db/db'
import { MUSCLE_LABELS, fmtDate } from '../lib/labels'
import { startSession } from '../lib/session'
import { isDone, muscleStats } from '../lib/stats'

export default function HomePage() {
  const navigate = useNavigate()
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
    <Page title="Hoy">
      {active && (
        <Link to={`/session/${active.id}`} className={`${card} block p-4 border-blue-500`}>
          <div className="font-semibold">▶ Sesión en curso</div>
          <div className="text-sm text-zinc-500">{tName(active.templateId)} · toca para continuar</div>
        </Link>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase text-zinc-500">Empezar rutina</h2>
        {templates.length === 0 && (
          <p className="text-zinc-500">
            Primero <Link className="underline" to="/exercises">añade ejercicios</Link> y crea una{' '}
            <Link className="underline" to="/templates">rutina</Link>.
          </p>
        )}
        {templates.map((t) => (
          <div key={t.id} className={`${card} p-3 flex items-center justify-between`}>
            <span className="font-medium">{t.name}</span>
            <Button disabled={!!active} onClick={async () => navigate(`/session/${await startSession(t.id)}`)}>Empezar</Button>
          </div>
        ))}
      </section>

      {neglected.length > 0 && (
        <section className={`${card} p-4`}>
          <h2 className="text-sm font-semibold uppercase text-zinc-500 mb-1">Llevas tiempo sin trabajar</h2>
          <div className="flex flex-wrap gap-2">
            {neglected.map((m) => (
              <span key={m.muscle} className="rounded-full bg-amber-100 dark:bg-amber-950 px-3 py-1 text-sm">
                {MUSCLE_LABELS[m.muscle]} · {m.daysSince == null ? 'nunca' : `${m.daysSince} d`}
              </span>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase text-zinc-500">Últimas sesiones</h2>
          {recent.map((s) => (
            <Link key={s.id} to={`/session/${s.id}`} className={`${card} block p-3`}>
              <div className="font-medium">{tName(s.templateId)}</div>
              <div className="text-sm text-zinc-500">
                {fmtDate(s.startedAt)} · {logs.filter((l) => l.sessionId === s.id && isDone(l)).length} series
              </div>
            </Link>
          ))}
        </section>
      )}
    </Page>
  )
}
