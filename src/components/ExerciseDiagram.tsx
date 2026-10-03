import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ExerciseGuide, MovementDiagram } from '../lib/guideTypes'
import { CANVAS } from '../lib/rigSpec'
import type { MuscleGroup } from '../lib/types'
import { add, type P, poseAt, smooth } from './android/geom'
import { androidDefs, renderAndroid } from './android/render'
import { armsAt, bits, buildFront, buildSide, FRONT_CX, frontLayout, ghostSide, idsFromGroups, type Levels } from './android/scene'

/**
 * Esquema animado del maniquí facetado: inicio → medio → final → vuelta. La pose sale de `poseAt` (cinemática de
 * 2 huesos, rigSpec) y la escena resultante se dibuja como SVG; los músculos de `muscleIds` se iluminan en ámbar.
 */
const FLOOR = CANVAS.floor

const str = (ps: P[]) => ps.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')
const n1 = (n: number) => n.toFixed(1)

type Seg = 'pause0' | 'ida' | 'pause1' | 'vuelta'
type Timeline = { pz: number; ida: number; vuelta: number; total: number }

/** Ciclo = pausa(from) · ida · pausa(to) · vuelta, con los tiempos del tempo (si lo hay). */
function timeline(tempo: ExerciseGuide['tempo'], loadPhase: 'ida' | 'vuelta'): Timeline {
  const pz = (tempo?.pauseS ?? (tempo ? 0.5 : 0.73)) * 1000
  const conc = (tempo?.concentricS ?? 1.66) * 1000, ecc = (tempo?.eccentricS ?? 1.66) * 1000
  const ida = loadPhase === 'ida' ? conc : ecc, vuelta = loadPhase === 'ida' ? ecc : conc
  return { pz, ida, vuelta, total: 2 * pz + ida + vuelta }
}
/** Progreso 0..1 (from→to) y tramo en curso. Easing suave en cada tramo, sin caída libre. */
function at(tl: Timeline, ms: number): { p: number; seg: Seg } {
  let t = ms % tl.total
  if (t < tl.pz) return { p: 0, seg: 'pause0' }
  t -= tl.pz
  if (t < tl.ida) return { p: smooth(t / tl.ida), seg: 'ida' }
  t -= tl.ida
  if (t < tl.pz) return { p: 1, seg: 'pause1' }
  t -= tl.pz
  return { p: 1 - smooth(t / tl.vuelta), seg: 'vuelta' }
}
const stepOf = (p: number) => (p < 0.15 ? 0 : p > 0.85 ? 2 : 1)
const VERB: Partial<Record<MovementDiagram['motion'], string>> = {
  empuje: 'Empujas', tiron: 'Tiras', curl: 'Flexionas', flexion: 'Flexionas', extension: 'Estiras',
  elevacion: 'Subes', sentadilla: 'Subes', bisagra: 'Subes',
}

/** Flecha (línea acortada + cabeza) sobre una polilínea. */
function arrowOn(pts: P[]) {
  const e = pts[pts.length - 1], q = pts[pts.length - 2]
  const ang = Math.atan2(e[1] - q[1], e[0] - q[0]), hd = 8
  const head: P[] = [
    e,
    [e[0] - hd * Math.cos(ang - 0.45), e[1] - hd * Math.sin(ang - 0.45)],
    [e[0] - hd * Math.cos(ang + 0.45), e[1] - hd * Math.sin(ang + 0.45)],
  ]
  const line: P[] = [...pts.slice(0, -1), [e[0] - 5 * Math.cos(ang), e[1] - 5 * Math.sin(ang)]]
  return { head: str(head), line: str(line) }
}

const sq = (c: P, h: number, style: string, extra = '') =>
  `<rect x="${n1(c[0] - h)}" y="${n1(c[1] - h)}" width="${2 * h}" height="${2 * h}" rx="1.5" ${extra} style="${style}"/>`

/** Niveles de resaltado: muscleIds de la ficha o, si faltan, los ids de sus grupos. */
function levelsOf(ids: ExerciseGuide['muscleIds'], primary: MuscleGroup[], secondary: MuscleGroup[]): Levels {
  const prim = new Set<string>(ids ? ids.primary : idsFromGroups(primary))
  const sec = new Set<string>((ids ? ids.secondary : idsFromGroups(secondary)).filter((m) => !prim.has(m)))
  return { prim, sec }
}

const reduceQuery = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches

export default function ExerciseDiagram({
  diagram: d, primary = [], secondary = [], muscleIds, steps, tempo, tempoNote,
}: {
  diagram: MovementDiagram
  primary?: MuscleGroup[]
  secondary?: MuscleGroup[]
  /** Músculos concretos a iluminar (ids base de guideTypes); sin ellos se usan los grupos. */
  muscleIds?: ExerciseGuide['muscleIds']
  /** Etiquetas de los 3 pasos (inicio, medio, final). */
  steps?: [string, string, string]
  /** Ritmo recomendado; sin él (o en isométricos) no se pintan fases de carga/control. */
  tempo?: ExerciseGuide['tempo']
  tempoNote?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const phases = !!tempo && d.motion !== 'isometrico'
  const loadPhase = d.loadPhase ?? 'ida'
  const tl = timeline(phases ? tempo : undefined, loadPhase)
  const [reduced] = useState(() => reduceQuery('(prefers-reduced-motion: reduce)'))
  const [paused, setPaused] = useState(reduced)
  const [visible, setVisible] = useState(true)
  const [t, setT] = useState(reduced ? tl.pz + tl.ida + tl.pz / 2 : tl.pz)
  const clock = useRef(t)
  const wrap = useRef<HTMLDivElement>(null)
  const stamp = useRef(0)
  const cost = useRef(0)
  useLayoutEffect(() => { if (stamp.current) cost.current = performance.now() - stamp.current })
  const { p, seg: tramo } = at(tl, t)

  useEffect(() => {
    const el = wrap.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '60px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const running = !paused && visible
  useEffect(() => {
    if (!running) return
    let raf = 0, last = performance.now(), drawn = 0
    const tick = (now: number) => {
      clock.current += now - last
      last = now
      // ~30 fps como mucho; si el equipo tarda en pintar la figura se espacian los fotogramas
      if (now - drawn >= Math.max(30, Math.min(160, cost.current * 2.5))) { drawn = now; stamp.current = performance.now(); setT(clock.current) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running])

  const seek = (i: number) => {
    const target = i === 0 ? tl.pz / 2 : i === 1 ? tl.pz + tl.ida / 2 : tl.pz + tl.ida + tl.pz / 2
    setPaused(true)
    clock.current = target
    setT(target)
  }
  // Fase activa: el tramo en curso (en pausa, el que acaba de terminar).
  const phase: 'ida' | 'vuelta' = tramo === 'ida' || tramo === 'pause1' ? 'ida' : 'vuelta'
  const concentric = phase === loadPhase
  const effort = loadPhase === 'ida' ? p : 1 - p
  const hot = phases ? (concentric ? 0.55 + 0.45 * effort : 0.12 + 0.28 * effort) : 0.4 + 0.6 * effort

  const levels = useMemo(() => levelsOf(muscleIds, primary, secondary), [muscleIds, primary, secondary])
  const defs = useMemo(() => androidDefs(uid), [uid])

  const pose = poseAt(d, p)
  const { s, arm, A, B, V, cur, frontal } = pose

  // Recorrido: la flecha de carga apunta SIEMPRE en el sentido de la fase concéntrica;
  // la vuelta (excéntrica) va en tenue, desplazada, en sentido contrario.
  const idaPts: P[] = V ? [A, V, B] : [A, B]
  const loadPts = loadPhase === 'ida' ? idaPts : [...idaPts].reverse()
  const loadArrow = arrowOn(loadPts)
  const nl = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
  const off: P = [(-(B[1] - A[1]) / nl) * 5, ((B[0] - A[0]) / nl) * 5]
  const retArrow = arrowOn([...loadPts].reverse().map((q) => add(q, off)))
  const markStyle = !phases || concentric ? 'fill:var(--signal);stroke:var(--ink)' : 'fill:var(--surface);stroke:var(--signal)'
  const markDash = !phases || concentric ? '' : 'stroke-dasharray="2 1.5"'
  const verb = (() => {
    if (d.motion === 'apertura') return (d.loadPhase === 'vuelta' ? B[0] <= A[0] : B[0] > A[0]) ? 'Juntas' : 'Abres'
    return VERB[d.motion] ?? 'Cargas'
  })()
  const arrowSvg = (alpha: number) => (phases
    ? `<polyline points="${retArrow.line}" fill="none" stroke-width="1.6" stroke-dasharray="1.5 4" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${concentric ? 0.28 : 0.7}" style="stroke:var(--ink)"/>` +
      `<polygon points="${retArrow.head}" fill="none" stroke-width="1.2" stroke-linejoin="round" stroke-opacity="${concentric ? 0.28 : 0.7}" style="stroke:var(--ink)"/>` +
      `<polyline points="${loadArrow.line}" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${alpha}" style="stroke:var(--signal)"/>` +
      `<polygon points="${loadArrow.head}" stroke-width=".7" stroke-linejoin="round" fill-opacity="${alpha}" stroke-opacity="${alpha}" style="fill:var(--signal);stroke:var(--ink)"/>`
    : `<polyline points="${loadArrow.line}" fill="none" stroke-width="2" stroke-dasharray="2 4" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--signal)"/>` +
      `<polygon points="${loadArrow.head}" stroke-width=".7" stroke-linejoin="round" style="fill:var(--signal);stroke:var(--ink)"/>`)

  const arrowHand = (c: P, dir: P, op: number) => {
    const t1 = add(c, [dir[0] * 16, dir[1] * 16])
    const head: P[] = [t1, add(t1, [-dir[0] * 6 - dir[1] * 3.5, -dir[1] * 6 + dir[0] * 3.5]), add(t1, [-dir[0] * 6 + dir[1] * 3.5, -dir[1] * 6 - dir[0] * 3.5])]
    return `<g opacity="${op}"><line x1="${n1(c[0])}" y1="${n1(c[1])}" x2="${n1(t1[0])}" y2="${n1(t1[1])}" stroke-width="2" stroke-linecap="round" style="stroke:var(--signal)"/>` +
      `<polygon points="${str(head)}" stroke-width=".6" stroke-linejoin="round" style="fill:var(--signal);stroke:var(--ink)"/></g>`
  }
  const armOp = !phases || concentric ? 1 : 0.35
  const common = { id: uid, hot, levels }

  let sc
  if (frontal?.kind === 'legs') {
    const L = frontLayout(true)
    sc = buildFront({ ...common, hy: L.hy, kneeX: frontal.kx, arms: armsAt(0.12, 0.07) })
    sc.back.push(bits.shadow(FRONT_CX, FLOOR + 1, 46, uid))
    sc.back.push(bits.line([FRONT_CX, L.sy - 2], [FRONT_CX, L.hy + 6], 30), bits.line([FRONT_CX - 28, L.hy + 13], [FRONT_CX + 28, L.hy + 13], 7))
    const loadOpening = loadPhase === 'vuelta' ? !frontal.opening : frontal.opening
    for (const sd of [-1, 1]) {
      const kneeY = L.hy + 3
      sc.back.push(bits.line([FRONT_CX + sd * (frontal.kx + 12), kneeY - 8], [FRONT_CX + sd * (frontal.kx + 12), kneeY + 20], 6))
      const tipX = FRONT_CX + sd * (frontal.kx + (loadOpening ? 34 : 21)), tailX = FRONT_CX + sd * (frontal.kx + (loadOpening ? 21 : 34))
      const y = kneeY + 1
      sc.front.push(`<g opacity="${armOp}"><line x1="${n1(tailX)}" y1="${n1(y)}" x2="${n1(tipX)}" y2="${n1(y)}" stroke-width="2" stroke-linecap="round" style="stroke:var(--signal)"/>` +
        `<polygon points="${str([[tipX, y], [tipX - sd * 6, y - 3.5], [tipX - sd * 6, y + 3.5]])}" stroke-width=".6" stroke-linejoin="round" style="fill:var(--signal);stroke:var(--ink)"/></g>`)
      sc.front.push(sq([FRONT_CX + sd * frontal.kx, kneeY], 4.5, markStyle, `stroke-width="1.5" ${markDash}`))
    }
  } else if (frontal?.kind === 'arms') {
    const seatedArms = d.pose.startsWith('sentado')
    const L = frontLayout(seatedArms)
    const mk = armsAt(frontal.theta, frontal.th2)
    sc = buildFront({ ...common, hy: L.hy, kneeX: seatedArms ? 11 : undefined, arms: mk })
    sc.back.push(bits.shadow(FRONT_CX, FLOOR + 1, 46, uid))
    if (seatedArms) sc.back.push(bits.line([FRONT_CX - 26, L.hy + 14], [FRONT_CX + 26, L.hy + 14], 7))
    const hands = mk(L.sy)
    if (d.implement === 'polea') {
      for (const a of hands) {
        const tx = FRONT_CX + a.sd * 96
        sc.back.push(bits.line([tx, 8], [tx, FLOOR], 5), bits.ring([tx, 34], 6), bits.rope([tx, 34], a.hand))
      }
    }
    for (const a of hands) {
      const flip = loadPhase === 'vuelta' ? -1 : 1
      const dir: P = frontal.lift ? [0, -flip] : frontal.closing ? [-a.sd * flip, 0] : [a.sd * flip, 0]
      const o: P = frontal.lift ? [a.sd * 13, 0] : [0, 14]
      sc.front.push(arrowHand(add(a.hand, o), dir, armOp))
      sc.front.push(sq(a.hand, 4.5, markStyle, `stroke-width="1.5" ${markDash}`))
    }
  } else {
    sc = buildSide({
      ...common, hip: s.hip, shoulder: s.shoulder, up: s.up, knee: s.knee, ankle: s.ankle, armMid: arm.mid, armEnd: arm.end,
      footVec: pose.footVec ?? undefined,
    })
    const cx = (s.hip[0] + s.ankle[0]) / 2
    sc.back.push(bits.shadow(Math.max(60, Math.min(160, cx + 6)), FLOOR + 1, 58, uid))
    const bkA = (d.backAngle * Math.PI) / 180
    const bk: P = [-Math.cos(bkA), Math.sin(bkA)]
    const padA = add(s.hip, [bk[0] * 16 - s.up[0] * 4, bk[1] * 16 - s.up[1] * 4])
    const padB = add(s.shoulder, [bk[0] * 17 + s.up[0] * 14, bk[1] * 17 + s.up[1] * 14])
    if (pose.seated || pose.horizontal) sc.back.push(bits.line(padA, padB, 9))
    if (pose.seated) sc.back.push(bits.line([s.hip[0] - 12, s.hip[1] + 15], [s.hip[0] + 16, s.hip[1] + 15], 7), bits.line([s.hip[0] - 4, s.hip[1] + 19], [s.hip[0] - 4, FLOOR], 5))
    if (pose.horizontal) {
      sc.back.push(
        bits.line([s.hip[0] - 4, s.hip[1] + 19], [s.hip[0] + 24, s.hip[1] + 19], 7),
        bits.line([Math.min(s.hip[0], s.shoulder[0]) + 6, s.hip[1] + 23], [Math.min(s.hip[0], s.shoulder[0]) + 6, FLOOR], 5),
        bits.line([Math.max(s.hip[0], s.shoulder[0]) - 6, s.hip[1] + 23], [Math.max(s.hip[0], s.shoulder[0]) - 6, FLOOR], 5),
      )
    }
    if (d.implement === 'polea') {
      if (pose.vertical) sc.back.push(bits.line([10, 12], [210, 12], 5), bits.ring([A[0], 12], 7), bits.rope([A[0], 12], cur))
      else sc.back.push(bits.line([205, 8], [205, FLOOR], 8), bits.ring([205, A[1]], 7), bits.rope([205, A[1]], cur))
    }
    if (d.implement === 'multipower') sc.back.push(bits.line([A[0], 8], [A[0], FLOOR], 5), bits.dot(cur, 4.5))
    if (pose.pedal) sc.back.push(bits.line(pose.pedal[0], pose.pedal[1], 3.5))
    if (d.implement === 'maquina' && !pose.calf) sc.back.push(bits.dot([cur[0] + 3, cur[1] - 1], 3.5))
    // pose inicial fantasma, recorrido y marca de inicio
    const g0 = poseAt(d, 0)
    sc.back.push(ghostSide({ hip: g0.s.hip, shoulder: g0.s.shoulder, up: g0.s.up, knee: g0.s.knee, ankle: g0.s.ankle, armMid: g0.arm.mid, armEnd: g0.arm.end }))
    sc.back.push(arrowSvg(concentric || !phases ? 1 : 0.35))
    sc.back.push(sq(A, 3.5, 'fill:var(--surface);stroke:var(--signal)', 'stroke-width="1.5"'))
    sc.front.push(sq(cur, 4.5, markStyle, `stroke-width="1.5" ${markDash}`))
  }

  const body = renderAndroid(sc)
  const active = stepOf(p)
  const label = steps ? steps[active] : (d.caption ?? 'Recorrido del movimiento')

  return (
    <figure className="m-0">
      <div className="relative" ref={wrap}>
        <svg
          viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`}
          className="block h-auto w-full cursor-pointer rounded-2xl border border-hair"
          style={{ background: 'var(--a-figbg)' }}
          role="img"
          aria-label={d.caption ?? 'Esquema del ejercicio'}
          onClick={() => setPaused((x) => !x)}
        >
          <defs dangerouslySetInnerHTML={{ __html: defs }} />
          {frontal && <text x="8" y={CANVAS.h - 3} fontSize="6.5" fill="var(--mute)" style={{ letterSpacing: '0.14em' }}>VISTA FRONTAL</text>}
          <line x1="6" x2="214" y1={FLOOR + 1} y2={FLOOR + 1} stroke="var(--ink)" strokeWidth="2" />
          <g dangerouslySetInnerHTML={{ __html: body }} />
        </svg>
        <button
          type="button"
          aria-label={paused ? 'Reproducir animación' : 'Pausar animación'}
          onClick={() => setPaused((x) => !x)}
          className="press absolute right-2 top-2 grid size-8 place-items-center rounded-full border border-hair bg-paper/80 text-ink hover:bg-signal hover:text-on-signal"
        >
          <svg viewBox="0 0 10 10" className="size-3" fill="currentColor" aria-hidden>
            {paused ? <polygon points="2,1 9,5 2,9" /> : <path d="M2 1h2v8H2zM6 1h2v8H6z" />}
          </svg>
        </button>
      </div>

      <figcaption className="mt-2 flex items-center gap-3 text-xs">
        <span className="flex shrink-0 gap-1">
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => seek(i)}
              aria-label={`Paso ${i + 1}`}
              aria-current={active === i}
              className={`press size-7 rounded-full border text-[0.7rem] font-semibold ${active === i ? 'border-signal bg-signal text-on-signal' : 'border-hair text-mute hover:text-ink'}`}
            >
              {i + 1}
            </button>
          ))}
        </span>
        <span className="min-w-0 flex-1">{label}</span>
      </figcaption>
      {phases && (
        <div className="mt-2 space-y-1 text-[0.72rem] leading-snug">
          <span
            aria-label={concentric ? 'Fase de carga' : 'Fase de control'}
            className={`inline-block rounded-full border px-3 py-0.5 font-semibold ${
              concentric ? 'border-signal bg-signal text-on-signal' : 'border-dashed border-hair text-mute'
            }`}
          >
            {concentric ? `● Carga · ${verb}` : '○ Vuelves · controla'}
          </span>
          <p className="text-mute">
            <b className="text-ink">Carga</b> (concéntrica): el músculo se acorta venciendo el peso.{' '}
            <b className="text-ink">Controla</b> (excéntrica): se alarga frenando el peso.
          </p>
        </div>
      )}
      {tempoNote && phases && <p className="mt-1 text-[0.72rem] text-ink">{tempoNote}</p>}
    </figure>
  )
}
