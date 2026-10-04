import { useState } from 'react'
import type { Availability } from '../../lib/gyms'
import type { Exercise } from '../../lib/types'
import { inputCls } from '../ui'
import { useGymContext } from './useGymContext'

const CHIP: Record<Exclude<Availability, 'available'>, { icon: string; cls: string; text: (g: string) => string }> = {
  unavailable: { icon: '✕', cls: 'border-e-fail/60 text-e-fail', text: (g) => `No disponible en ${g}` },
  unverified: { icon: '?', cls: 'border-dashed border-hair text-mute', text: () => 'Sin verificar' },
}

/** Marca de disponibilidad (icono + texto, no solo color). No pinta nada si está disponible. */
export function AvailabilityChip({ status, gymName, showOk }: { status: Availability; gymName: string; showOk?: boolean }) {
  if (status === 'available') {
    return showOk ? <span className="inline-flex items-center gap-1 rounded-full border border-hair px-2 py-0.5 text-[0.65rem] font-semibold text-mute"><span aria-hidden className="text-e-easy">✓</span>{gymName}</span> : null
  }
  const c = CHIP[status]
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${c.cls}`}><span aria-hidden>{c.icon}</span>{c.text(gymName)}</span>
}

/**
 * Selector para añadir un ejercicio (rutina o sesión). Con gimnasio elegido oculta los NO disponibles
 * (interruptor «Mostrar todos») y marca los «sin verificar»; el resultado se añade al final de la lista.
 */
export function ExercisePicker({ exercises, onPick, placeholder }: { exercises: Exercise[]; onPick: (id: string) => void; placeholder: string }) {
  const { gym, avail } = useGymContext()
  const [all, setAll] = useState(false)
  const sorted = [...exercises].sort((a, b) => a.name.localeCompare(b.name))
  const hidden = gym ? sorted.filter((e) => avail(e.id) === 'unavailable') : []
  const list = all || !gym ? sorted : sorted.filter((e) => avail(e.id) !== 'unavailable')
  return (
    <div className="space-y-2">
      <select className={inputCls} value="" aria-label={placeholder} onChange={(e) => e.target.value && onPick(e.target.value)}>
        <option value="">{placeholder}</option>
        {list.map((e) => {
          const s = gym ? avail(e.id) : 'available'
          return <option key={e.id} value={e.id}>{e.name}{s === 'unavailable' ? ` — no disponible en ${gym!.name}` : s === 'unverified' ? ' · sin verificar' : ''}</option>
        })}
      </select>
      {gym && (hidden.length > 0 || all) && (
        <label className="flex items-center gap-2 text-xs text-mute">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="size-4 accent-[var(--signal)]" />
          Mostrar todos{!all && ` (${hidden.length} no ${hidden.length === 1 ? 'disponible' : 'disponibles'} en ${gym.name})`}
        </label>
      )}
    </div>
  )
}
