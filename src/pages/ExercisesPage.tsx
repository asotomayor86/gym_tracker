import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { GuideToggle } from '../components/ExerciseGuideView'
import { Button, CommitInput, EmptyState, MuscleSelect, Page, SectionTitle, card, inputCls } from '../components/ui'
import { alive, db, remove, save } from '../db/db'
import { MUSCLE_LABELS } from '../lib/labels'
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '../lib/types'

export default function ExercisesPage() {
  const exercises = useLiveQuery(() => db.exercises.filter(alive).toArray())
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  if (!exercises) return null
  const q = query.trim().toLowerCase()
  const shown = exercises.filter((e) => e.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name))

  const add = async () => {
    const e = await save('exercises', {
      name: 'Nuevo ejercicio', primaryMuscle: 'pecho', secondaryMuscles: [], equipment: '', notes: '',
    })
    setEditing(e.id)
  }

  return (
    <Page title="Ejercicios" eyebrow={`${exercises.length} en catálogo`} actions={<Button onClick={add}>+ Nuevo</Button>}>
      <input className={`${inputCls} text-lg`} placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {exercises.length === 0 && <EmptyState>Aún no hay ejercicios: crea el primero con «+ Nuevo».</EmptyState>}
      {MUSCLE_GROUPS.map((m) => {
        const list = shown.filter((e) => e.primaryMuscle === m)
        if (!list.length) return null
        return (
          <section key={m}>
            <SectionTitle aside={String(list.length)}>{MUSCLE_LABELS[m]}</SectionTitle>
            {list.map((e) =>
              editing === e.id ? (
                <ExerciseForm key={e.id} exercise={e} onClose={() => setEditing(null)} />
              ) : (
                <div key={e.id} className="flex flex-wrap items-center gap-2 border-b border-hair py-2 hover:bg-surface">
                  <button onClick={() => setEditing(e.id)} className="min-w-0 flex-1 py-1 text-left">
                    <div className="font-semibold">{e.name}</div>
                    <div className="mono text-xs text-mute">
                      {[e.equipment, ...e.secondaryMuscles.map((s) => MUSCLE_LABELS[s])].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                  <GuideToggle exercise={e} />
                </div>
              ),
            )}
          </section>
        )
      })}
    </Page>
  )
}

function ExerciseForm({ exercise: e, onClose }: { exercise: Exercise; onClose: () => void }) {
  const update = (patch: Partial<Exercise>) => save('exercises', { ...e, ...patch })
  const toggleSecondary = (m: MuscleGroup) =>
    update({
      secondaryMuscles: e.secondaryMuscles.includes(m)
        ? e.secondaryMuscles.filter((x) => x !== m)
        : [...e.secondaryMuscles, m],
    })

  return (
    <div className={`${card} space-y-3 p-3 !border-signal`}>
      <CommitInput value={e.name} onCommit={(v) => update({ name: v.trim() || e.name })} placeholder="Nombre" />
      <div className="grid grid-cols-2 gap-2">
        <label className="eyebrow">
          Grupo principal
          <MuscleSelect value={e.primaryMuscle} onChange={(m) => update({ primaryMuscle: m })} />
        </label>
        <label className="eyebrow">
          Material
          <CommitInput value={e.equipment} onCommit={(v) => update({ equipment: v })} />
        </label>
      </div>
      <div>
        <div className="eyebrow mb-1.5">Grupos secundarios</div>
        <div className="flex flex-wrap gap-2">
          {MUSCLE_GROUPS.filter((m) => m !== e.primaryMuscle).map((m) => (
            <button
              key={m}
              onClick={() => toggleSecondary(m)}
              className={`border border-ink px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                e.secondaryMuscles.includes(m) ? 'bg-ink text-paper' : 'text-mute hover:text-ink'
              }`}
            >
              {MUSCLE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      <CommitInput value={e.notes} onCommit={(v) => update({ notes: v })} placeholder="Notas" />
      <div className="flex gap-2">
        <Button onClick={onClose}>Hecho</Button>
        <Button
          variant="danger"
          onClick={() => confirm(`¿Borrar "${e.name}"?`) && remove('exercises', e.id).then(onClose)}
        >
          Borrar
        </Button>
      </div>
    </div>
  )
}
