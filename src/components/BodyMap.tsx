import { MUSCLE_LABELS } from '../lib/labels'
import type { MuscleGroup } from '../lib/types'

/**
 * Mapa corporal esquemático, frente y espalda. Cada región se define solo para la mitad
 * izquierda (x < 60) y se refleja para la derecha: simetría perfecta y la línea media
 * queda como un hueco limpio entre músculos.
 */
type Region = { m: MuscleGroup; d: string }

const BASE_HALF = [
  'M60 34 L48 37 L38 42 L35 62 L40 90 L41 116 L60 118 Z', // torso
  'M37 44 Q24 44 22 60 L18 96 L14 128 L18 136 L27 134 L31 98 L35 78 Z', // brazo
  'M60 114 L41 114 Q37 150 41 192 L58 192 Z', // muslo
  'M43 194 Q40 220 45 244 L57 244 L58 194 Z', // pierna
]

const FRONT: Region[] = [
  { m: 'hombro', d: 'M40 42 Q27 40 24 54 Q24 63 31 66 Q37 60 38 52 Z' },
  { m: 'pecho', d: 'M59 45 L47 43 Q39 47 38 57 Q40 67 52 69 L59 67 Z' },
  { m: 'biceps', d: 'M31 68 Q25 68 24 76 L23 91 L31 93 Q34 82 34 72 Z' },
  { m: 'antebrazo', d: 'M23 96 L31 96 L29 126 L19 127 Z' },
  { m: 'core', d: 'M58 72 L52 72 Q48 90 50 112 L58 114 Z' },
  { m: 'cuadriceps', d: 'M58 120 L42 120 Q39 152 43 190 L56 190 Q60 160 58 120 Z' },
  { m: 'gemelo', d: 'M45 198 L56 198 L55 238 L47 238 Q43 218 45 198 Z' },
]

const BACK: Region[] = [
  { m: 'hombro', d: 'M40 42 Q27 40 24 54 Q24 63 31 66 Q37 60 38 52 Z' },
  { m: 'espalda', d: 'M59 35 L48 38 L40 48 L39 62 Q41 82 51 96 L59 98 Z' },
  { m: 'triceps', d: 'M31 68 Q25 68 24 76 L23 91 L31 93 Q34 82 34 72 Z' },
  { m: 'antebrazo', d: 'M23 96 L31 96 L29 126 L19 127 Z' },
  { m: 'core', d: 'M58 100 L51 100 L49 114 L58 114 Z' },
  { m: 'gluteo', d: 'M58 117 L43 117 Q39 128 43 140 L58 140 Z' },
  { m: 'isquios', d: 'M58 144 L43 144 Q40 166 44 190 L56 190 Q60 168 58 144 Z' },
  { m: 'gemelo', d: 'M45 196 Q41 216 47 238 L56 238 Q58 216 55 196 Z' },
]

const MIRROR = 'translate(120 0) scale(-1 1)'

function Figure({ title, regions, primary, secondary }: {
  title: string; regions: Region[]; primary: Set<MuscleGroup>; secondary: Set<MuscleGroup>
}) {
  const style = (m: MuscleGroup) =>
    primary.has(m)
      ? { fill: 'var(--signal)', stroke: 'var(--signal-2)', strokeWidth: 1 }
      : secondary.has(m)
        ? { fill: 'var(--signal)', fillOpacity: 0.32, stroke: 'var(--signal)', strokeWidth: 1 }
        : { fill: 'transparent', stroke: 'var(--hair)', strokeWidth: 0.8 }

  const half = (
    <>
      {BASE_HALF.map((d) => <path key={d} d={d} fill="var(--ink)" fillOpacity="0.07" stroke="var(--ink)" strokeOpacity="0.55" strokeWidth="1" strokeLinejoin="round" />)}
      {regions.map((r) => <path key={r.m + r.d} d={r.d} {...style(r.m)} strokeLinejoin="round" />)}
    </>
  )

  return (
    <figure className="m-0 flex-1">
      <svg viewBox="0 0 120 252" className="mx-auto block h-auto w-full max-w-[150px]" role="img" aria-label={title}>
        <circle cx="60" cy="17" r="10" fill="var(--ink)" fillOpacity="0.07" stroke="var(--ink)" strokeOpacity="0.55" />
        <rect x="55" y="26" width="10" height="9" fill="var(--ink)" fillOpacity="0.07" stroke="var(--ink)" strokeOpacity="0.55" />
        <g>{half}</g>
        <g transform={MIRROR}>{half}</g>
      </svg>
      <figcaption className="eyebrow mt-1 text-center">{title}</figcaption>
    </figure>
  )
}

export default function BodyMap({ primary, secondary }: { primary: MuscleGroup[]; secondary: MuscleGroup[] }) {
  const p = new Set(primary)
  const s = new Set(secondary.filter((m) => !p.has(m)))
  return (
    <div>
      <div className="flex gap-2">
        <Figure title="Frente" regions={FRONT} primary={p} secondary={s} />
        <Figure title="Espalda" regions={BACK} primary={p} secondary={s} />
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
