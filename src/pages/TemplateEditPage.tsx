import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, CommitInput, Page, inputCls } from '../components/ui'
import { alive, db, remove, save } from '../db/db'
import { usePrefs } from '../lib/prefs'
import { fromKg, roundTo, toKg } from '../lib/units'

const num = (v: string, fallback: number) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback)

export default function TemplateEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { unit } = usePrefs()
  const template = useLiveQuery(() => db.workoutTemplates.get(id!), [id])
  const rows = useLiveQuery(
    () => db.templateExercises.where('templateId').equals(id!).filter(alive).sortBy('position'),
    [id],
  )
  const exercises = useLiveQuery(() => db.exercises.filter(alive).toArray())
  if (!template || !rows || !exercises) return null
  const byId = new Map(exercises.map((e) => [e.id, e]))

  const addExercise = async (exerciseId: string) => {
    if (!exerciseId) return
    await save('templateExercises', {
      templateId: template.id, exerciseId, position: rows.length,
      targetSets: 3, targetReps: 10, targetWeightKg: 20, restS: 90,
    })
  }

  const move = async (index: number, dir: -1 | 1) => {
    const other = rows[index + dir]
    if (!other) return
    await save('templateExercises', { ...rows[index], position: other.position })
    await save('templateExercises', { ...other, position: rows[index].position })
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
      <CommitInput
        value={template.name}
        className={`${inputCls} display !text-xl !min-h-14`}
        onCommit={(v) => save('workoutTemplates', { ...template, name: v.trim() || template.name })}
      />
      {rows.map((r, i) => {
        const ex = byId.get(r.exerciseId)
        const update = (patch: Partial<typeof r>) => save('templateExercises', { ...r, ...patch })
        return (
          <div key={r.id} className="glass space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="display text-base leading-snug">{ex?.name ?? 'Ejercicio eliminado'}</div>
              <div className="flex gap-1">
                <Button variant="ghost" className="px-3" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
                <Button variant="ghost" className="px-3" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>↓</Button>
                <Button variant="danger" className="px-3" onClick={() => remove('templateExercises', r.id)}>✕</Button>
              </div>
            </div>
            <div className="eyebrow grid grid-cols-4 gap-3 [&_input]:num [&_input]:mt-1 [&_input]:text-center [&_input]:text-lg [&_input]:normal-case [&_input]:tracking-normal [&_input]:text-ink">
              <label>Series<CommitInput type="number" inputMode="numeric" value={r.targetSets} onCommit={(v) => update({ targetSets: Math.max(1, Math.round(num(v, r.targetSets))) })} /></label>
              <label>Reps<CommitInput type="number" inputMode="numeric" value={r.targetReps} onCommit={(v) => update({ targetReps: Math.max(1, Math.round(num(v, r.targetReps))) })} /></label>
              <label>Peso ({unit})<CommitInput type="number" inputMode="decimal" value={roundTo(fromKg(r.targetWeightKg, unit), 0.5)} onCommit={(v) => update({ targetWeightKg: toKg(num(v, 0), unit) })} /></label>
              <label>Desc. (s)<CommitInput type="number" inputMode="numeric" value={r.restS} onCommit={(v) => update({ restS: Math.max(0, Math.round(num(v, r.restS))) })} /></label>
            </div>
          </div>
        )
      })}
      <select className={inputCls} value="" onChange={(e) => addExercise(e.target.value)}>
        <option value="">+ Añadir ejercicio…</option>
        {[...exercises].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
    </Page>
  )
}
