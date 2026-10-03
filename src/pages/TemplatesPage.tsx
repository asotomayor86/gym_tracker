import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { Button, EmptyState, Page } from '../components/ui'
import { alive, db, save } from '../db/db'

export default function TemplatesPage() {
  const navigate = useNavigate()
  const templates = useLiveQuery(() => db.workoutTemplates.filter(alive).toArray())
  const items = useLiveQuery(() => db.templateExercises.filter(alive).toArray())
  if (!templates || !items) return null

  const add = async () => {
    const t = await save('workoutTemplates', { name: 'Nueva rutina' })
    navigate(`/templates/${t.id}`)
  }

  return (
    <Page title="Rutinas" eyebrow={`${templates.length} guardadas`} actions={<Button onClick={add}>+ Nueva</Button>}>
      {templates.length === 0 && <EmptyState>Aún no hay rutinas: crea la primera con «+ Nueva» y añade ejercicios con series y repeticiones objetivo.</EmptyState>}
      <ul className="space-y-3">
        {templates.map((t) => (
          <li key={t.id}>
            <Link to={`/templates/${t.id}`} className="glass press group flex items-center gap-4 p-4">
              <span className="display flex-1 text-lg leading-snug">{t.name}</span>
              <span className="text-xs text-mute">{items.filter((x) => x.templateId === t.id).length} ej.</span>
              <span className="display text-xl text-signal-text transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  )
}
