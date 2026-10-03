import { useState } from 'react'
import { findGuide } from '../lib/exerciseGuides'
import type { Difficulty, ExerciseCategory, Implement } from '../lib/guideTypes'
import type { Exercise, MuscleGroup } from '../lib/types'
import BodyMap from './BodyMap'
import ExerciseDiagram from './ExerciseDiagram'

const CATEGORY: Record<ExerciseCategory, string> = {
  empuje: 'Empuje', tiron: 'Tirón', pierna: 'Pierna', aislamiento: 'Aislamiento', core: 'Core',
}
const IMPLEMENT: Record<Implement, string> = {
  maquina: 'Máquina', polea: 'Polea', multipower: 'Multipower', 'peso-corporal': 'Peso corporal',
}
const LEVEL: Record<Difficulty, string> = { 1: 'Principiante', 2: 'Intermedio', 3: 'Avanzado' }
const LOWER: MuscleGroup[] = ['cuadriceps', 'isquios', 'gluteo', 'gemelo']

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-1.5 border-b border-hair pb-1 !text-ink">{title}</h3>
      {children}
    </section>
  )
}

const Bullets = ({ items, mark }: { items: string[]; mark: string }) => (
  <ul className="space-y-1.5 text-sm">
    {items.map((t) => (
      <li key={t} className="flex gap-2"><span className="mono shrink-0 text-signal">{mark}</span>{t}</li>
    ))}
  </ul>
)

/** Ficha completa. Sin guía (ejercicio propio) muestra solo el mapa corporal del ejercicio. */
export default function ExerciseGuideView({ exercise }: { exercise: Pick<Exercise, 'name' | 'primaryMuscle' | 'secondaryMuscles'> }) {
  const guide = findGuide(exercise.name)

  if (!guide) {
    return (
      <div className="space-y-2 border border-ink bg-surface p-3">
        <BodyMap primary={[exercise.primaryMuscle]} secondary={exercise.secondaryMuscles} />
        <p className="eyebrow">Sin ficha técnica para este ejercicio</p>
      </div>
    )
  }

  const limb = guide.diagram.limb ?? (guide.primary.every((m) => LOWER.includes(m)) ? 'pierna' : 'brazo')

  return (
    <article className="space-y-5 border border-ink bg-surface p-3 md:p-4">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="eyebrow flex flex-wrap gap-x-3">
          <span className="!text-ink">{CATEGORY[guide.category]}</span>
          <span>{IMPLEMENT[guide.diagram.implement]}</span>
        </div>
        <div className="flex items-center gap-2" title={LEVEL[guide.difficulty]}>
          <span className="flex gap-0.5" aria-hidden>
            {[1, 2, 3].map((n) => <i key={n} className={`h-2.5 w-5 border border-ink ${n <= guide.difficulty ? 'bg-signal' : ''}`} />)}
          </span>
          <span className="eyebrow !text-ink">{LEVEL[guide.difficulty]} {guide.difficulty}/3</span>
        </div>
      </header>

      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <BodyMap primary={guide.primary} secondary={guide.secondary} />
        <ExerciseDiagram diagram={{ ...guide.diagram, limb }} primary={guide.primary} secondary={guide.secondary} steps={guide.steps} tempo={guide.tempo} tempoNote={guide.tempoNote} />
      </div>

      <Block title="Posición inicial"><Bullets items={guide.setup} mark="▸" /></Block>
      <Block title="Ejecución">
        <ol className="space-y-1.5 text-sm">
          {guide.execution.map((t, i) => (
            <li key={t} className="flex gap-2"><span className="mono shrink-0 font-bold text-signal">{String(i + 1).padStart(2, '0')}</span>{t}</li>
          ))}
        </ol>
      </Block>
      {guide.breathing && <Block title="Respiración"><p className="text-sm">{guide.breathing}</p></Block>}
      {guide.tips.length > 0 && <Block title="Consejos"><Bullets items={guide.tips} mark="+" /></Block>}
      {guide.mistakes.length > 0 && <Block title="Errores comunes"><Bullets items={guide.mistakes} mark="×" /></Block>}
    </article>
  )
}

/** Botón "Ficha" que despliega la guía en línea. */
export function GuideToggle({ exercise, className = '' }: { exercise: Pick<Exercise, 'name' | 'primaryMuscle' | 'secondaryMuscles'>; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`mono min-h-9 border border-ink px-2.5 text-xs font-bold uppercase tracking-wider ${open ? 'bg-ink text-paper' : 'hover:bg-ink hover:text-paper'} ${className}`}
      >
        {open ? 'Cerrar ficha' : 'Ficha'}
      </button>
      {open && <div className="basis-full">{<ExerciseGuideView exercise={exercise} />}</div>}
    </>
  )
}
