import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ExercisePicker } from '../components/gym/ExercisePicker'
import { AvailabilityChip } from '../components/gym/GymUI'
import { useGymContext } from '../components/gym/useGymContext'
import { LastAttemptButton } from '../components/LastAttempt'
import { DragHandle, MoveButtons, SortableItem, SortableList } from '../components/Sortable'
import { Button, CommitInput, NameEn, Page, inputCls } from '../components/ui'
import { alive, db, remove, save } from '../db/db'
import { reorderTemplateExercises } from '../lib/order'
import { usePrefs } from '../lib/prefs'
import { fromKg, roundTo, toKg } from '../lib/units'

const num = (v: string, fallback: number) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback)

export default function TemplateEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const justCreated = !!(useLocation().state as { created?: boolean } | null)?.created
  const { unit } = usePrefs()
  const template = useLiveQuery(() => db.workoutTemplates.get(id!), [id])
  const rows = useLiveQuery(
    () => db.templateExercises.where('templateId').equals(id!).filter(alive).sortBy('position'),
    [id],
  )
  const exercises = useLiveQuery(() => db.exercises.filter(alive).toArray())
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  const { gym, avail } = useGymContext()
  if (!template || !rows || !exercises) return null
  const byId = new Map(exercises.map((e) => [e.id, e]))
  // orden de alta (position); mientras se guarda un arrastre se muestra el orden nuevo sin parpadeo
  const ids = rows.map((r) => r.id)
  const shownIds = localOrder && localOrder.length === ids.length && localOrder.every((x) => ids.includes(x)) ? localOrder : ids
  const shown = shownIds.map((rid) => rows.find((r) => r.id === rid)!)
  const reorder = async (next: string[]) => {
    setLocalOrder(next)
    await reorderTemplateExercises(template.id, next)
    requestAnimationFrame(() => setLocalOrder(null))
  }

  const addExercise = async (exerciseId: string) => {
    if (!exerciseId) return
    await save('templateExercises', {
      templateId: template.id, exerciseId, position: rows.length,
      targetSets: 3, targetReps: 10, targetWeightKg: 20, restS: 90,
    })
  }

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= shownIds.length) return
    const next = [...shownIds]
    ;[next[index], next[j]] = [next[j], next[index]]
    void reorder(next)
  }

  return (
    <Page
      title="Rutina"
      eyebrow="Editar"
      actions={
        <div className="flex gap-2">
          <Link to="/templates"><Button variant="ghost">Volver</Button></Link>
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm(`¿Borrar "${template.name}"?`)) return
              for (const r of rows) await remove('templateExercises', r.id)
              await remove('workoutTemplates', template.id)
              navigate('/templates')
            }}
          >
            Borrar
          </Button>
        </div>
      }
    >
      {justCreated && <p role="status" className="rounded-xl bg-signal/10 px-3 py-2 text-sm"><b className="text-signal-text">Rutina creada</b> a partir de la sesión. Ajusta lo que quieras.</p>}
      <CommitInput
        value={template.name}
        className={`${inputCls} display !text-xl !min-h-14`}
        onCommit={(v) => save('workoutTemplates', { ...template, name: v.trim() || template.name })}
      />
      <SortableList ids={shownIds} onReorder={reorder}>
      {shown.map((r, i) => {
        const ex = byId.get(r.exerciseId)
        const update = (patch: Partial<typeof r>) => save('templateExercises', { ...r, ...patch })
        const name = ex?.name ?? 'Ejercicio eliminado'
        return (
          <SortableItem key={r.id} id={r.id}>
          {({ handle }) => (
          <div className="glass mb-5 space-y-3 p-4">
            <div className="flex items-center gap-2">
              <DragHandle handle={handle} label={name} />
              <span className="num text-xs text-signal-text">{String(i + 1).padStart(2, '0')}</span>
              <div className="min-w-0 flex-1">
                <div className="display text-base leading-snug">{name}</div>
                <NameEn className="text-sm">{ex?.nameEn}</NameEn>
                {gym && ex && avail(ex.id) !== 'available' && <div className="mt-1"><AvailabilityChip status={avail(ex.id)} gymName={gym.name} /></div>}
              </div>
              {ex && <LastAttemptButton iconOnly exerciseId={ex.id} exerciseName={name} exerciseNameEn={ex.nameEn} onApply={async (v) => { await update({ targetWeightKg: v.weightKg, targetReps: v.reps }); return 1 }} />}
              <MoveButtons label={name} first={i === 0} last={i === shown.length - 1} onMove={(dir) => move(i, dir)} />
              <Button variant="danger" className="!min-h-9 px-3" aria-label={`Quitar ${name}`} onClick={() => remove('templateExercises', r.id)}>✕</Button>
            </div>
            <div className="eyebrow grid grid-cols-4 gap-3 [&_input]:num [&_input]:mt-1 [&_input]:text-center [&_input]:text-lg [&_input]:normal-case [&_input]:tracking-normal [&_input]:text-ink">
              <label>Series<CommitInput type="number" inputMode="numeric" value={r.targetSets} onCommit={(v) => update({ targetSets: Math.max(1, Math.round(num(v, r.targetSets))) })} /></label>
              <label>Reps<CommitInput type="number" inputMode="numeric" value={r.targetReps} onCommit={(v) => update({ targetReps: Math.max(1, Math.round(num(v, r.targetReps))) })} /></label>
              <label>Peso ({unit})<CommitInput type="number" inputMode="decimal" value={roundTo(fromKg(r.targetWeightKg, unit), 0.5)} onCommit={(v) => update({ targetWeightKg: toKg(num(v, 0), unit) })} /></label>
              <label>Desc. (s)<CommitInput type="number" inputMode="numeric" value={r.restS} onCommit={(v) => update({ restS: Math.max(0, Math.round(num(v, r.restS))) })} /></label>
            </div>
          </div>
          )}
          </SortableItem>
        )
      })}
      </SortableList>
      <ExercisePicker exercises={exercises} label="+ Añadir ejercicio" onPick={addExercise} />
    </Page>
  )
}
