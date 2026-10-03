import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Page, card } from '../components/ui'
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
    <Page title="Rutinas" actions={<Button onClick={add}>+ Nueva</Button>}>
      {templates.length === 0 && <p className="text-zinc-500">Crea una rutina y añade ejercicios con series y repeticiones objetivo.</p>}
      {templates.map((t) => (
        <Link key={t.id} to={`/templates/${t.id}`} className={`${card} block p-4`}>
          <div className="font-semibold">{t.name}</div>
          <div className="text-sm text-zinc-500">{items.filter((i) => i.templateId === t.id).length} ejercicios</div>
        </Link>
      ))}
    </Page>
  )
}
