import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useAuth } from '../components/auth/authShim'
import { GuideToggle } from '../components/ExerciseGuideView'
import { AvailabilityChip } from '../components/gym/GymUI'
import { useGymContext } from '../components/gym/useGymContext'
import { Button, CommitInput, EmptyState, MuscleSelect, Page, SectionTitle, inputCls } from '../components/ui'
import { alive, db, remove, save } from '../db/db'
import { MUSCLE_LABELS } from '../lib/labels'
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '../lib/types'

export default function ExercisesPage() {
  const exercises = useLiveQuery(() => db.exercises.filter(alive).toArray())
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const isAdmin = useAuth().isAdmin // el catálogo es global: solo el administrador crea, edita y borra
  const { gym, avail } = useGymContext()

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
    <Page title="Ejercicios" eyebrow={`${exercises.length} en catálogo`} actions={isAdmin ? <Button onClick={add}>+ Nuevo</Button> : undefined}>
      <input className={`${inputCls} text-base`} type="search" placeholder="Buscar ejercicio…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {exercises.length === 0 && <EmptyState>{isAdmin ? 'Aún no hay ejercicios: crea el primero con «+ Nuevo».' : 'Aún no hay ejercicios en el catálogo.'}</EmptyState>}
      {MUSCLE_GROUPS.map((m) => {
        const list = shown.filter((e) => e.primaryMuscle === m)
        if (!list.length) return null
        return (
          <section key={m}>
            <SectionTitle aside={String(list.length)}>{MUSCLE_LABELS[m]}</SectionTitle>
            <div className="glass-flat divide-y divide-hair overflow-hidden">
              {list.map((e) =>
                isAdmin && editing === e.id ? (
                  <ExerciseForm key={e.id} exercise={e} onClose={() => setEditing(null)} />
                ) : (
                  <div key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 transition-colors hover:bg-ink/5">
                    <button onClick={() => isAdmin && setEditing(e.id)} disabled={!isAdmin} className="min-w-0 flex-1 py-1 text-left disabled:cursor-default">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold">{e.name}</span>
                        {gym && <AvailabilityChip status={avail(e.id)} gymName={gym.name} showOk />}
                      </div>
                      <div className="text-xs text-mute">
                        {[e.equipment, ...e.secondaryMuscles.map((s) => MUSCLE_LABELS[s])].filter(Boolean).join(' · ')}
                      </div>
                    </button>
                    <GuideToggle exercise={e} />
                  </div>
                ),
              )}
            </div>
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
    <div className="space-y-3 bg-ink/5 p-4">
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
              className={`press rounded-full border px-3 py-1 text-xs font-semibold ${
                e.secondaryMuscles.includes(m) ? 'border-signal bg-signal text-on-signal' : 'border-hair text-mute hover:text-ink'
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
