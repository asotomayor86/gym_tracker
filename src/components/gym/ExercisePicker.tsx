import { useEffect, useId, useMemo, useState } from 'react'
import { filterExercises } from '../../lib/exerciseFilter'
import { availabilityIndex, useExerciseGyms } from '../../lib/gyms'
import { MUSCLE_LABELS } from '../../lib/labels'
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '../../lib/types'
import { Button, inputCls } from '../ui'
import { AvailabilityChip } from './GymUI'
import { useGymContext } from './useGymContext'

const KEY = 'gt.pickerFilter'
interface Remembered { onlyGym: boolean; muscles: MuscleGroup[] }
const loadRemembered = (): Remembered => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Remembered>
    return { onlyGym: v.onlyGym ?? true, muscles: (v.muscles ?? []).filter((m) => MUSCLE_GROUPS.includes(m)) }
  } catch { return { onlyGym: true, muscles: [] } }
}

/**
 * Añadir ejercicio (rutina o sesión): botón que abre una hoja a pantalla completa con la barra de filtros fija arriba
 * (solo en mi gimnasio, grupos musculares, búsqueda y contador) y la lista debajo. Pulsar uno lo añade al FINAL y la hoja
 * sigue abierta para añadir más; el filtro se recuerda entre usos.
 */
export function ExercisePicker({ exercises, onPick, label }: { exercises: Exercise[]; onPick: (id: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" className="w-full" onClick={() => setOpen(true)}>{label}</Button>
      {open && <PickerSheet exercises={exercises} onPick={onPick} onClose={() => setOpen(false)} />}
    </>
  )
}

function PickerSheet({ exercises, onPick, onClose }: { exercises: Exercise[]; onPick: (id: string) => void; onClose: () => void }) {
  const { gym, gymId } = useGymContext()
  const rows = useExerciseGyms()
  const [rem, setRem] = useState(loadRemembered)
  const [query, setQuery] = useState('')
  const [added, setAdded] = useState<string[]>([])
  const id = useId()
  const onlyGym = !!gym && rem.onlyGym
  const update = (p: Partial<Remembered>) => {
    const next = { ...rem, ...p }
    setRem(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* sin almacenamiento: solo dura esta hoja */ }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const list = useMemo(
    () => filterExercises(exercises, { onlyAvailableAt: onlyGym ? gymId : null, muscles: rem.muscles, query, sort: 'name' }, rows),
    [exercises, onlyGym, gymId, rem.muscles, query, rows],
  )
  // con el interruptor apagado se muestran todos, pero los no disponibles en mi gimnasio van marcados
  const statusOf = useMemo(() => availabilityIndex(gymId, rows), [gymId, rows])
  const toggleMuscle = (m: MuscleGroup) => update({ muscles: rem.muscles.includes(m) ? rem.muscles.filter((x) => x !== m) : [...rem.muscles, m] })

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="shrink-0 space-y-3 border-b border-hair px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <h2 id={`${id}-t`} className="display flex-1 text-lg">Añadir ejercicio</h2>
          <span className="num text-sm text-mute" aria-live="polite">{list.length} ejercicio{list.length === 1 ? '' : 's'}</span>
          <Button onClick={onClose} className="!min-h-10 px-4">{added.length ? `Hecho (${added.length})` : 'Cerrar'}</Button>
        </div>
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <input className={`${inputCls} text-base`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, equipo o músculo…" aria-label="Buscar ejercicio" />
          <label className={`flex min-h-11 items-center gap-3 rounded-xl border border-hair px-3 ${gym ? '' : 'opacity-60'}`}>
            <input type="checkbox" disabled={!gym} checked={onlyGym} onChange={(e) => update({ onlyGym: e.target.checked })} className="size-5 accent-[var(--signal)]" />
            <span className="text-sm font-semibold">{gym ? `Solo en mi gimnasio (${gym.name})` : 'Solo en mi gimnasio'}</span>
            {!gym && <span className="text-xs text-mute">· elígelo en Ajustes</span>}
          </label>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label="Grupos musculares">
            {rem.muscles.length > 0 && (
              <button type="button" onClick={() => update({ muscles: [] })} className="press shrink-0 rounded-full border border-hair px-3 min-h-10 text-sm text-mute">Todos ✕</button>
            )}
            {MUSCLE_GROUPS.map((m) => {
              const on = rem.muscles.includes(m)
              return (
                <button key={m} type="button" aria-pressed={on} onClick={() => toggleMuscle(m)}
                  className={`press shrink-0 rounded-full border px-3.5 min-h-10 text-sm font-semibold ${on ? 'border-signal bg-signal text-on-signal' : 'border-hair text-mute hover:text-ink'}`}>
                  {MUSCLE_LABELS[m]}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <ul className="mx-auto max-w-3xl divide-y divide-hair">
          {list.map(({ exercise: e }) => {
            const n = added.filter((x) => x === e.id).length
            const status = gym ? statusOf(e.id) : 'available'
            return (
              <li key={e.id}>
                <button type="button" onClick={() => { onPick(e.id); setAdded((a) => [...a, e.id]) }} className="press flex min-h-14 w-full items-center gap-3 py-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">{e.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mute">
                      {MUSCLE_LABELS[e.primaryMuscle]}
                      {gym && status !== 'available' && <AvailabilityChip status={status} gymName={gym.name} />}
                    </span>
                  </span>
                  {n > 0 && <span className="num shrink-0 text-xs text-signal-text">✓ añadido{n > 1 ? ` ×${n}` : ''}</span>}
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full border border-hair text-lg text-signal-text">+</span>
                </button>
              </li>
            )
          })}
        </ul>
        {list.length === 0 && <p className="mx-auto max-w-3xl py-10 text-center text-sm text-mute">Ningún ejercicio coincide con estos filtros.</p>}
      </div>
    </div>
  )
}
