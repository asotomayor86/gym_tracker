import { useEffect, useState } from 'react'
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
const LOWER: MuscleGroup[] = ['cuadriceps', 'isquios', 'gluteo', 'gemelo', 'aductores']

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-2 border-b border-hair pb-1.5 !text-ink">{title}</h3>
      {children}
    </section>
  )
}

const Bullets = ({ items, mark }: { items: string[]; mark: string }) => (
  <ul className="space-y-1.5 text-sm">
    {items.map((t) => (
      <li key={t} className="flex gap-2"><span className="num shrink-0 text-signal-text">{mark}</span>{t}</li>
    ))}
  </ul>
)

/** Ficha completa. Sin guía (ejercicio propio) muestra solo el mapa corporal del ejercicio. */
export default function ExerciseGuideView({ exercise }: { exercise: Pick<Exercise, 'name' | 'primaryMuscle' | 'secondaryMuscles'> }) {
  const guide = findGuide(exercise.name)

  if (!guide) {
    return (
      <div className="glass-flat space-y-2 p-4">
        <BodyMap primary={[exercise.primaryMuscle]} secondary={exercise.secondaryMuscles} />
        <p className="eyebrow">Sin ficha técnica para este ejercicio</p>
      </div>
    )
  }

  const limb = guide.diagram.limb ?? (guide.primary.every((m) => LOWER.includes(m)) ? 'pierna' : 'brazo')

  return (
    <article className="glass-flat space-y-5 p-4 md:p-5">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="eyebrow flex flex-wrap gap-x-3">
          <span className="!text-ink">{CATEGORY[guide.category]}</span>
          <span>{IMPLEMENT[guide.diagram.implement]}</span>
        </div>
        <div className="flex items-center gap-2" title={LEVEL[guide.difficulty]}>
          <span className="flex gap-0.5" aria-hidden>
            {[1, 2, 3].map((n) => <i key={n} className={`h-2 w-5 rounded-full ${n <= guide.difficulty ? 'bg-signal' : 'bg-ink/15'}`} />)}
          </span>
          <span className="eyebrow !text-ink">{LEVEL[guide.difficulty]} {guide.difficulty}/3</span>
        </div>
      </header>

      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <BodyMap primary={guide.primary} secondary={guide.secondary} muscleIds={guide.muscleIds} />
        <ExerciseDiagram diagram={{ ...guide.diagram, limb }} primary={guide.primary} secondary={guide.secondary} muscleIds={guide.muscleIds} steps={guide.steps} tempo={guide.tempo} tempoNote={guide.tempoNote} />
      </div>

      <Block title="Posición inicial"><Bullets items={guide.setup} mark="▸" /></Block>
      <Block title="Ejecución">
        <ol className="space-y-1.5 text-sm">
          {guide.execution.map((t, i) => (
            <li key={t} className="flex gap-2"><span className="num shrink-0 text-signal-text">{String(i + 1).padStart(2, '0')}</span>{t}</li>
          ))}
        </ol>
      </Block>
      {guide.breathing && <Block title="Respiración"><p className="text-sm">{guide.breathing}</p></Block>}
      {guide.tips.length > 0 && <Block title="Consejos"><Bullets items={guide.tips} mark="+" /></Block>}
      {guide.mistakes.length > 0 && <Block title="Errores comunes"><Bullets items={guide.mistakes} mark="×" /></Block>}
    </article>
  )
}

/** Botón "Ficha" que despliega la guía en línea con plegado suave (la ficha se monta al abrir y se desmonta al terminar de cerrar). */
export function GuideToggle({ exercise, className = '' }: { exercise: Pick<Exercise, 'name' | 'primaryMuscle' | 'secondaryMuscles'>; className?: string }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => setMounted(true))
      return () => cancelAnimationFrame(raf)
    }
    const t = setTimeout(() => setMounted(false), 600)
    return () => clearTimeout(t)
  }, [open])
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`press min-h-9 rounded-full border px-3.5 text-xs font-semibold ${
          open ? 'border-signal bg-signal text-on-signal' : 'border-hair bg-ink/5 text-ink hover:bg-ink/10'
        } ${className}`}
      >
        {open ? 'Cerrar ficha' : 'Ficha'}
      </button>
      {(open || mounted) && (
        <div className="fold basis-full" data-open={open && mounted ? 'true' : 'false'}>
          <div><div className="pt-2"><ExerciseGuideView exercise={exercise} /></div></div>
        </div>
      )}
    </>
  )
}
