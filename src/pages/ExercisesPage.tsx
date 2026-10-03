import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button, CommitInput, MuscleSelect, Page, card, inputCls } from '../components/ui'
import { alive, db, remove, save } from '../db/db'
import { MUSCLE_LABELS } from '../lib/labels'
import { seedExercises } from '../lib/seed'
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
    <Page title="Ejercicios" actions={<Button onClick={add}>+ Nuevo</Button>}>
      <input className={inputCls} placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {exercises.length === 0 && (
        <div className={`${card} p-4 space-y-3`}>
          <p>Aún no tienes ejercicios.</p>
          <Button onClick={seedExercises}>Cargar ejercicios de ejemplo</Button>
        </div>
      )}
      {MUSCLE_GROUPS.map((m) => {
        const list = shown.filter((e) => e.primaryMuscle === m)
        if (!list.length) return null
        return (
          <section key={m} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase text-zinc-500">{MUSCLE_LABELS[m]}</h2>
            {list.map((e) =>
              editing === e.id ? (
                <ExerciseForm key={e.id} exercise={e} onClose={() => setEditing(null)} />
              ) : (
                <button key={e.id} onClick={() => setEditing(e.id)} className={`${card} w-full p-3 text-left`}>
                  <div className="font-medium">{e.name}</div>
                  <div className="text-sm text-zinc-500">
                    {[e.equipment, ...e.secondaryMuscles.map((s) => MUSCLE_LABELS[s])].filter(Boolean).join(' · ')}
                  </div>
                </button>
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
    <div className={`${card} p-3 space-y-3 border-blue-500`}>
      <CommitInput value={e.name} onCommit={(v) => update({ name: v.trim() || e.name })} placeholder="Nombre" />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">
          Grupo principal
          <MuscleSelect value={e.primaryMuscle} onChange={(m) => update({ primaryMuscle: m })} />
        </label>
        <label className="text-sm">
          Material
          <CommitInput value={e.equipment} onCommit={(v) => update({ equipment: v })} />
        </label>
      </div>
      <div>
        <div className="text-sm mb-1">Grupos secundarios</div>
        <div className="flex flex-wrap gap-2">
          {MUSCLE_GROUPS.filter((m) => m !== e.primaryMuscle).map((m) => (
            <button
              key={m}
              onClick={() => toggleSecondary(m)}
              className={`rounded-full px-3 py-1 text-sm border ${
                e.secondaryMuscles.includes(m) ? 'bg-blue-600 text-white border-blue-600' : 'border-zinc-300 dark:border-zinc-700'
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
