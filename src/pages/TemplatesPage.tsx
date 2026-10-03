import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Page } from '../components/ui'
import { alive, db, save } from '../db/db'
import { seedTemplates } from '../lib/seed'

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
      {templates.length === 0 && <p className="text-mute">Crea una rutina y añade ejercicios con series y repeticiones objetivo.</p>}
      <ul>
        {templates.map((t, i) => (
          <li key={t.id}>
            <Link to={`/templates/${t.id}`} className="group flex items-center gap-4 border-b border-hair py-4 hover:bg-surface">
              <span className="mono w-6 text-sm text-mute">{String(i + 1).padStart(2, '0')}</span>
              <span className="display flex-1 text-4xl">{t.name}</span>
              <span className="mono text-sm text-mute">{items.filter((x) => x.templateId === t.id).length} ej.</span>
              <span className="display text-2xl transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </li>
        ))}
      </ul>
      <Button
        onClick={async () => {
          const n = await seedTemplates()
          alert(n ? `Se añadieron ${n} rutinas.` : 'Ya tienes las rutinas del listado.')
        }}
      >
        Importar rutinas de máquina
      </Button>
    </Page>
  )
}
