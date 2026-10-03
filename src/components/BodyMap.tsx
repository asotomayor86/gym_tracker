import { useId, useMemo } from 'react'
import type { ExerciseGuide } from '../lib/guideTypes'
import { MUSCLE_LABELS } from '../lib/labels'
import type { MuscleGroup } from '../lib/types'
import { androidDefs, renderAndroid } from './android/render'
import { armsAt, buildFront, frontLayout, idsFromGroups, type Levels } from './android/scene'

/**
 * Mapa corporal: el mismo androide de placas del esquema animado, de frente y de espalda, con los músculos
 * trabajados iluminados en ámbar (principal: relleno; secundario: borde).
 */
function Figure({ title, back, levels }: { title: string; back: boolean; levels: Levels }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const defs = useMemo(() => androidDefs(uid), [uid])
  const body = useMemo(() => {
    const sc = buildFront({ back, hy: frontLayout(false).hy, arms: armsAt(0.36, 0.3), levels })
    return renderAndroid(sc, { id: uid, hot: 0.85 })
  }, [back, levels, uid])
  return (
    <figure className="m-0 flex-1">
      <svg viewBox="50 2 120 172" className="mx-auto block h-auto w-full max-w-[130px] sm:max-w-[170px]" role="img" aria-label={title}>
        <defs dangerouslySetInnerHTML={{ __html: defs }} />
        <g dangerouslySetInnerHTML={{ __html: body }} />
      </svg>
      <figcaption className="eyebrow mt-1 text-center">{title}</figcaption>
    </figure>
  )
}

export default function BodyMap({ primary, secondary, muscleIds }: {
  primary: MuscleGroup[]
  secondary: MuscleGroup[]
  /** Músculos concretos; sin ellos se iluminan todas las placas de cada grupo. */
  muscleIds?: ExerciseGuide['muscleIds']
}) {
  const p = new Set(primary)
  const s = new Set(secondary.filter((m) => !p.has(m)))
  const levels = useMemo<Levels>(() => {
    const prim = new Set<string>(muscleIds ? muscleIds.primary : idsFromGroups(primary))
    const sec = new Set<string>((muscleIds ? muscleIds.secondary : idsFromGroups(secondary)).filter((m) => !prim.has(m)))
    return { prim, sec }
  }, [muscleIds, primary, secondary])
  return (
    <div>
      <div className="flex gap-2">
        <Figure title="Frente" back={false} levels={levels} />
        <Figure title="Espalda" back levels={levels} />
      </div>
      <ul className="mt-3 space-y-1.5 text-xs">
        {primary.map((m) => (
          <li key={m} className="flex items-center gap-2"><i className="size-3 rounded-full bg-signal" />{MUSCLE_LABELS[m]}<span className="text-mute">principal</span></li>
        ))}
        {[...s].map((m) => (
          <li key={m} className="flex items-center gap-2"><i className="size-3 rounded-full border border-signal bg-signal/30" />{MUSCLE_LABELS[m]}<span className="text-mute">secundario</span></li>
        ))}
      </ul>
    </div>
  )
}
