import {
  DndContext, KeyboardSensor, MouseSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DraggableAttributes,
} from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties, ReactNode } from 'react'

/**
 * Lista reordenable: arrastrar con el ratón desde el asa ⋮⋮ (solo con puntero fino) o con teclado
 * (Espacio para coger, flechas para mover, Espacio para soltar). En táctil no hay arrastre: se usan los botones ↑↓.
 */
const ANNOUNCE = {
  onDragStart: ({ active }: { active: { id: string | number } }) => `Has cogido ${active.id}. Usa las flechas arriba y abajo para moverlo.`,
  onDragOver: ({ over }: { over: { id: string | number } | null }) => (over ? 'Se mueve a una nueva posición.' : 'Fuera de la lista.'),
  onDragEnd: () => 'Elemento soltado en su nueva posición.',
  onDragCancel: () => 'Movimiento cancelado.',
}
const INSTRUCTIONS = 'Para reordenar, pulsa Espacio, mueve con las flechas y vuelve a pulsar Espacio para soltar.'

export function SortableList({ ids, onReorder, children }: { ids: string[]; onReorder: (next: string[]) => void; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id)), to = ids.indexOf(String(over.id))
    if (from >= 0 && to >= 0) onReorder(arrayMove(ids, from, to))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd} accessibility={{ announcements: ANNOUNCE as never, screenReaderInstructions: { draggable: INSTRUCTIONS } }}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  )
}

/** Propiedades del asa (ref de activación + atributos de accesibilidad + escuchas de arrastre). */
export type HandleProps = DraggableAttributes & NonNullable<SyntheticListenerMap> & { ref: (el: HTMLElement | null) => void }

export function SortableItem({ id, children }: { id: string; children: (o: { handle: HandleProps; dragging: boolean }) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform ? { ...transform, x: 0, scaleX: 1, scaleY: 1 } : null),
    transition,
    position: 'relative',
    zIndex: isDragging ? 20 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'drag-lift' : undefined}>
      {children({ handle: { ...attributes, ...(listeners ?? {}), ref: setActivatorNodeRef } as HandleProps, dragging: isDragging })}
    </div>
  )
}

/** Asa ⋮⋮: solo se ve con puntero fino (ratón); en táctil se oculta y quedan los botones ↑↓. */
export function DragHandle({ handle, label }: { handle: HandleProps; label: string }) {
  return (
    <button
      type="button" {...handle}
      aria-label={`Reordenar ${label}`} title="Arrastra para reordenar"
      className="drag-handle press hidden size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-mute hover:bg-ink/10 hover:text-ink active:cursor-grabbing [@media(pointer:fine)]:grid"
    >
      <svg viewBox="0 0 12 18" className="h-4 w-3" fill="currentColor" aria-hidden>
        {[3, 9, 15].flatMap((y) => [3, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
      </svg>
    </button>
  )
}

/** Botones subir/bajar (táctil y teclado). */
export function MoveButtons({ label, first, last, onMove }: { label: string; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void }) {
  const cls = 'press grid size-9 place-items-center rounded-lg border border-hair text-sm text-mute hover:text-ink disabled:pointer-events-none disabled:opacity-30'
  return (
    <span className="flex shrink-0 gap-1">
      <button type="button" className={cls} disabled={first} aria-label={`Subir ${label}`} onClick={() => onMove(-1)}>↑</button>
      <button type="button" className={cls} disabled={last} aria-label={`Bajar ${label}`} onClick={() => onMove(1)}>↓</button>
    </span>
  )
}
