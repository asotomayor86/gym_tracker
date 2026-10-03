import { useEffect, useRef, useState } from 'react'
import type { ExerciseGuide, MovementDiagram } from '../lib/guideTypes'
import type { MuscleGroup } from '../lib/types'

/**
 * Figura lateral con el mismo tratamiento que BodyMap (relleno suave + contorno, músculos en
 * naranja), animada: inicio → medio → final → vuelta. La figura se recalcula cada fotograma
 * con cinemática de 2 huesos para brazo o pierna.
 */
type P = [number, number]
type Prof = [t: number, w: number][]

const FLOOR = 156
const TORSO = 50, THIGH = 45, SHIN = 33, UARM = 27, FARM = 24
const BX = 20, BW = 180, BH = FLOOR - 6

const pt = ([x, y]: [number, number]): P => [BX + x * BW, FLOOR - y * BH]
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]]
const mix = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const dist = (a: P, b: P) => Math.hypot(b[0] - a[0], b[1] - a[1])
const str = (ps: P[]) => ps.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')

/** `reach`: fracción máxima de la longitud total (<1 deja siempre una ligera flexión de codo/rodilla). */
function ik(root: P, target: P, l1: number, l2: number, pick: (a: P, b: P) => P, reach = 0.99): { mid: P; end: P } {
  let d = dist(root, target)
  const dir: P = d === 0 ? [1, 0] : [(target[0] - root[0]) / d, (target[1] - root[1]) / d]
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.5, (l1 + l2) * 0.32), (l1 + l2) * reach)
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  const m: P = [root[0] + dir[0] * a, root[1] + dir[1] * a]
  return {
    mid: pick([m[0] - dir[1] * h, m[1] + dir[0] * h], [m[0] + dir[1] * h, m[1] - dir[0] * h]),
    end: [root[0] + dir[0] * d, root[1] + dir[1] * d],
  }
}
const lower = (a: P, b: P) => (a[1] > b[1] ? a : b)
/** Rodilla/codo hacia el lado "anterior" del eje raíz→objetivo (el de la rodilla humana, en cualquier postura). */
const anterior = (root: P, target: P) => {
  const cross = (k: P) => (target[0] - root[0]) * (k[1] - root[1]) - (target[1] - root[1]) * (k[0] - root[0])
  return (a: P, b: P) => (cross(a) < cross(b) ? a : b)
}
const higher = (a: P, b: P) => (a[1] < b[1] ? a : b)

function skeleton(pose: MovementDiagram['pose'], backAngle: number) {
  const r = (backAngle * Math.PI) / 180
  const up: P = [-Math.sin(r), -Math.cos(r)]
  let hip: P, shoulder: P, ankle: P, knee: P
  switch (pose) {
    case 'tumbado':
      hip = [92, 118]; ankle = [hip[0] + 46, FLOOR]
      shoulder = add(hip, [up[0] * TORSO, up[1] * TORSO]); knee = ik(hip, ankle, THIGH, SHIN, anterior(hip, ankle)).mid
      break
    case 'prono':
      hip = [100, 118]; shoulder = [hip[0] + TORSO, hip[1]]
      knee = [hip[0] - THIGH, hip[1]]; ankle = [knee[0] - SHIN, knee[1]]
      break
    case 'de-pie':
      hip = [104, FLOOR - 77]; ankle = [104, FLOOR]
      shoulder = add(hip, [up[0] * TORSO, up[1] * TORSO]); knee = ik(hip, ankle, THIGH, SHIN, anterior(hip, ankle)).mid
      break
    case 'colgado':
      shoulder = [108, 32]; hip = [108, 32 + TORSO]; ankle = [104, hip[1] + THIGH + SHIN - 4]
      knee = ik(hip, ankle, THIGH, SHIN, anterior(hip, ankle)).mid
      break
    default:
      hip = [92, FLOOR - 36]; ankle = [hip[0] + THIGH - 2, FLOOR]
      shoulder = add(hip, [up[0] * TORSO, up[1] * TORSO]); knee = ik(hip, ankle, THIGH, SHIN, anterior(hip, ankle)).mid
  }
  return { hip, shoulder, knee, ankle, up }
}

/** Segmento con perfil de grosor: contorno, centro y borde "frontal" a cualquier altura t. */
function seg(a: P, b: P, prof: Prof, frontSign: 1 | -1 = 1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
  const f: P = [(dy / l) * frontSign, (-dx / l) * frontSign]
  const w = (t: number) => {
    for (let i = 1; i < prof.length; i++) {
      if (t <= prof[i][0]) {
        const [t0, w0] = prof[i - 1], [t1, w1] = prof[i]
        return w0 + ((w1 - w0) * (t - t0)) / (t1 - t0 || 1)
      }
    }
    return prof[prof.length - 1][1]
  }
  const c = (t: number) => mix(a, b, t)
  const edge = (t: number, s: number): P => [c(t)[0] + f[0] * w(t) * s, c(t)[1] + f[1] * w(t) * s]
  const knots = prof.map((k) => k[0])
  const outline = [...knots.map((t) => edge(t, 1)), ...[...knots].reverse().map((t) => edge(t, -1))]
  /** Músculo en forma de lente sobre un lado (o ambos) entre t0 y t1. */
  const band = (t0: number, t1: number, side: 'front' | 'back' | 'both') => {
    const ks = [0, 0.2, 0.4, 0.6, 0.8, 1]
    const outer = (sign: number) => ks.map((k) => {
      const t = t0 + (t1 - t0) * k
      return edge(t, sign * 0.92 * (0.45 + 0.55 * Math.sin(Math.PI * k) ** 0.6))
    })
    const inner = (sign: number) => ks.map((k) => edge(t0 + (t1 - t0) * k, sign * 0.12 * Math.sin(Math.PI * k)))
    const one = (sign: number) => [...outer(sign), ...inner(sign).reverse()]
    if (side === 'front') return one(1)
    if (side === 'back') return one(-1)
    return [...outer(1), ...outer(-1).reverse()]
  }
  return { outline, band, edge, c }
}

const TORSO_PROF: Prof = [[0, 9.5], [0.35, 8.5], [0.75, 12], [1, 10]]
const THIGH_PROF: Prof = [[0, 9.5], [0.5, 8.5], [1, 6.2]]
const SHIN_PROF: Prof = [[0, 6.2], [0.3, 6.8], [1, 3.8]]
const UARM_PROF: Prof = [[0, 5.5], [1, 4.4]]
const FARM_PROF: Prof = [[0, 4.4], [0.3, 4.6], [1, 3]]
const NECK_PROF: Prof = [[0, 4.2], [1, 3.8]]
const FOOT_PROF: Prof = [[0, 4.2], [1, 2.6]]

const smooth = (x: number) => x * x * (3 - 2 * x)
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
  const head = str([
    e,
    [e[0] - hd * Math.cos(ang - 0.45), e[1] - hd * Math.sin(ang - 0.45)],
    [e[0] - hd * Math.cos(ang + 0.45), e[1] - hd * Math.sin(ang + 0.45)],
  ])
  const line = str([...pts.slice(0, -1), [e[0] - 5 * Math.cos(ang), e[1] - 5 * Math.sin(ang)]])
  return { head, line }
}

export default function ExerciseDiagram({
  diagram: d, primary = [], secondary = [], steps, tempo, tempoNote,
}: {
  diagram: MovementDiagram
  primary?: MuscleGroup[]
  secondary?: MuscleGroup[]
  /** Etiquetas de los 3 pasos (inicio, medio, final). */
  steps?: [string, string, string]
  /** Ritmo recomendado; sin él (o en isométricos) no se pintan fases de carga/control. */
  tempo?: ExerciseGuide['tempo']
  tempoNote?: string
}) {
  const phases = !!tempo && d.motion !== 'isometrico'
  const loadPhase = d.loadPhase ?? 'ida'
  const tl = timeline(phases ? tempo : undefined, loadPhase)
  const [reduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [paused, setPaused] = useState(reduced)
  const [t, setT] = useState(reduced ? tl.pz + tl.ida + tl.pz / 2 : tl.pz)
  const clock = useRef(t)
  const { p, seg: tramo } = at(tl, t)

  useEffect(() => {
    if (paused) return
    let raf = 0, last = performance.now()
    const tick = (now: number) => {
      clock.current += now - last
      last = now
      setT(clock.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused])

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

  const base = skeleton(d.pose, d.backAngle)
  let s = base
  let A = pt(d.from), B = pt(d.to), V: P | null = d.via ? pt(d.via) : null
  let cur: P = V ? (p < 0.5 ? mix(A, V, p * 2) : mix(V, B, (p - 0.5) * 2)) : mix(A, B, p)
  const leg = d.limb === 'pierna'

  // Colgado: las manos quedan fijas en la barra/asas y es el cuerpo el que sube (marca en el pecho).
  let armTarget: P | null = null
  let armPick = d.elbow === 'arriba' ? higher : lower
  if (d.pose === 'colgado') {
    const pull = d.motion === 'tiron'
    const H: P = pull ? [B[0], Math.min(A[1], B[1])] : [A[0], Math.max(A[1], B[1])]
    const bodyAt = (q: number): P => [pull ? H[0] - 12 : H[0], pull ? H[1] + 58 - 34 * q : H[1] - 20 - 34 * q]
    const chest = (q: number): P => add(bodyAt(q), [13, 14])
    const sh = bodyAt(p)
    const hip: P = [sh[0], sh[1] + TORSO]
    const ankle: P = [hip[0] - 10, Math.min(hip[1] + 34, FLOOR - 4)]
    s = { shoulder: sh, hip, ankle, knee: ik(hip, ankle, THIGH, SHIN, anterior(hip, ankle)).mid, up: [0, -1] }
    A = chest(0); B = chest(1); V = null; cur = chest(p)
    armTarget = H
    if (!pull) armPick = (a, b) => (a[0] < b[0] ? a : b)
  }
  // Hip thrust: espalda alta fija en el banco, el recorrido es el de la cadera.
  if (d.pose === 'tumbado' && d.motion === 'bisagra' && !leg) {
    const S = base.shoulder
    const l = Math.hypot(cur[0] - S[0], cur[1] - S[1]) || 1
    const hip: P = [S[0] + ((cur[0] - S[0]) / l) * TORSO, S[1] + ((cur[1] - S[1]) / l) * TORSO]
    const k = ik(hip, base.ankle, THIGH, SHIN, anterior(hip, base.ankle))
    s = { shoulder: S, hip, ankle: k.end, knee: k.mid, up: [(S[0] - hip[0]) / TORSO, (S[1] - hip[1]) / TORSO] }
  }

  const squat = leg && d.motion === 'sentadilla'
  if (squat) {
    const A0 = A, hipOf = (c: P): P => [base.hip[0] + (A0[0] - c[0]), base.hip[1] + (A0[1] - c[1])]
    const hip = hipOf(cur)
    // la marca sigue a la cadera (lo que realmente baja), no al pie
    const pathAt = (q: number): P => (V ? (q < 0.5 ? mix(A0, V, q * 2) : mix(V, B, (q - 0.5) * 2)) : mix(A0, B, q))
    A = hipOf(pathAt(0)); B = hipOf(pathAt(1)); cur = hip; V = null
    const shift: P = [hip[0] - base.hip[0], hip[1] - base.hip[1]]
    const k = ik(hip, base.ankle, THIGH, SHIN, anterior(hip, base.ankle), 0.985)
    s = { shoulder: add(base.shoulder, shift), hip, ankle: k.end, knee: k.mid, up: base.up }
  }

  // Elevación de gemelos: cadera, rodilla y tobillo FIJOS; solo gira el pie (plantarflexión 0→40°) empujando un pedal.
  const calf = leg && d.motion === 'elevacion'
  const rot = (v: P, a: number): P => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]
  let footVec: P | null = null
  let calfLeg: { mid: P; end: P } | null = null
  let pedal: [P, P] | null = null
  if (calf) {
    const reclined = d.pose === 'sentado-reclinado'
    let rest: { mid: P; end: P }
    if (reclined) {
      // Prensa: piernas casi rectas (flexión ~7°), inclinadas hacia el punto de partida del pie.
      const dl = Math.hypot(A[0] - s.hip[0], A[1] - s.hip[1]) || 1
      const tgt: P = [s.hip[0] + ((A[0] - s.hip[0]) / dl) * (THIGH + SHIN), s.hip[1] + ((A[1] - s.hip[1]) / dl) * (THIGH + SHIN)]
      rest = ik(s.hip, tgt, THIGH, SHIN, anterior(s.hip, tgt), 0.998)
    } else {
      // Sentado: rodilla ~90°; el tobillo queda algo elevado para que el pedal gire sin hundirse en el suelo.
      const tgt: P = [A[0], FLOOR - 9]
      rest = ik(s.hip, tgt, THIGH, SHIN, anterior(s.hip, tgt), 0.985)
    }
    const l0 = Math.hypot(rest.end[0] - rest.mid[0], rest.end[1] - rest.mid[1]) || 1
    const f0: P = [(rest.end[1] - rest.mid[1]) / l0, -(rest.end[0] - rest.mid[0]) / l0]
    const fvAt = (q: number) => rot(f0, ((40 * Math.PI) / 180) * q)
    const toeAt = (q: number): P => add(rest.end, [fvAt(q)[0] * 11, fvAt(q)[1] * 11])
    footVec = fvAt(p)
    calfLeg = rest
    const sole: P = [-footVec[1], footVec[0]]
    pedal = [
      add(rest.end, [sole[0] * 4 - footVec[0] * 4, sole[1] * 4 - footVec[1] * 4]),
      add(rest.end, [sole[0] * 4 + footVec[0] * 19, sole[1] * 4 + footVec[1] * 19]),
    ]
    A = toeAt(0); B = toeAt(1); V = null; cur = toeAt(p)
  }
  // Brazo que no trabaja: cuelga (o agarra el asa en prono / la barra en sentadilla), sin atravesar suelo ni banco.
  const staticArm: P = d.pose === 'prono' ? [10, 14] : squat ? [4, -4] : [14, Math.min(40, FLOOR - 4 - s.shoulder[1])]
  const arm = leg
    ? ik(s.shoulder, add(s.shoulder, staticArm), UARM, FARM, lower)
    : ik(s.shoulder, armTarget ?? cur, UARM, FARM, armPick, 0.98)
  const lg = calfLeg ?? (squat ? { mid: s.knee, end: s.ankle } : leg ? ik(s.hip, cur, THIGH, SHIN, anterior(s.hip, cur), 0.985) : { mid: s.knee, end: s.ankle })

  const torso = seg(s.hip, s.shoulder, TORSO_PROF, -1)
  const neck = seg(s.shoulder, add(s.shoulder, [s.up[0] * 11, s.up[1] * 11]), NECK_PROF, -1)
  const head = add(s.shoulder, [s.up[0] * 17, s.up[1] * 17])
  const thigh = seg(s.hip, lg.mid, THIGH_PROF)
  const shin = seg(lg.mid, lg.end, SHIN_PROF)
  const sl = Math.hypot(lg.end[0] - lg.mid[0], lg.end[1] - lg.mid[1]) || 1
  const foot = seg(lg.end, add(lg.end, footVec ? [footVec[0] * 11, footVec[1] * 11] : [((lg.end[1] - lg.mid[1]) / sl) * 11, (-(lg.end[0] - lg.mid[0]) / sl) * 11]), FOOT_PROF)
  const uarm = seg(s.shoulder, arm.mid, UARM_PROF)
  const farm = seg(arm.mid, arm.end, FARM_PROF)

  const prim = new Set(primary), sec = new Set(secondary.filter((m) => !prim.has(m)))
  // Pectoral y dorsal nacen en el tronco y se insertan en el húmero: se estiran con el brazo.
  const pecPts: P[] = [
    torso.edge(0.58, 0.9), torso.edge(0.78, 1), torso.edge(0.97, 0.9),
    uarm.edge(0.1, 0.9), uarm.edge(0.42, 0.85), uarm.edge(0.42, 0.1), torso.edge(0.7, 0.1),
  ]
  const latPts: P[] = [
    torso.edge(0.25, -0.9), torso.edge(0.55, -1), torso.edge(0.95, -0.9),
    uarm.edge(0.1, -0.9), uarm.edge(0.4, -0.85), uarm.edge(0.4, -0.1), torso.edge(0.45, -0.1),
  ]
  const muscles: { m: MuscleGroup; pts?: P[]; circle?: P }[] = [
    { m: 'pecho', pts: pecPts },
    { m: 'core', pts: torso.band(0.08, 0.55, 'front') },
    { m: 'espalda', pts: latPts },
    { m: 'gluteo', pts: [...torso.band(0, 0.2, 'back'), ...thigh.band(0.05, 0.3, 'back')] },
    { m: 'hombro', circle: s.shoulder, pts: uarm.band(0, 0.45, 'both') },
    { m: 'biceps', pts: uarm.band(0.15, 0.92, 'front') },
    { m: 'triceps', pts: uarm.band(0.15, 0.92, 'back') },
    { m: 'antebrazo', pts: farm.band(0.05, 0.92, 'both') },
    { m: 'cuadriceps', pts: thigh.band(0.1, 0.95, 'front') },
    { m: 'isquios', pts: thigh.band(0.2, 0.95, 'back') },
    { m: 'gemelo', pts: shin.band(0.05, 0.7, 'back') },
  ]
  // El resalte "late": más intenso cuanto más cerca del punto de máximo esfuerzo.
  const mStyle = (m: MuscleGroup) =>
    prim.has(m)
      ? { fill: 'var(--signal)', fillOpacity: 0.5 + 0.5 * effort, stroke: 'var(--ink)', strokeWidth: 0.8 }
      : { fill: 'var(--signal)', fillOpacity: 0.16 + 0.2 * effort, stroke: 'var(--signal)', strokeWidth: 0.8 }

  const body = { fill: 'color-mix(in srgb, var(--ink) 7%, var(--surface))', stroke: 'var(--ink)', strokeOpacity: 0.55, strokeWidth: 1, strokeLinejoin: 'round' as const }
  const mute = { stroke: 'var(--ink)', strokeOpacity: 0.28 }

  // Implemento
  const bk: P = [-Math.cos((d.backAngle * Math.PI) / 180), Math.sin((d.backAngle * Math.PI) / 180)]
  const padA = add(s.hip, [bk[0] * 12 - s.up[0] * 4, bk[1] * 12 - s.up[1] * 4])
  const padB = add(s.shoulder, [bk[0] * 12 + s.up[0] * 14, bk[1] * 12 + s.up[1] * 14])
  const pull = !leg && d.view === 'frontal' && d.motion === 'tiron'
  const armsFront = !leg && (d.motion === 'apertura' || d.motion === 'elevacion' || pull)
  const lift = d.motion === 'elevacion' || pull
  const closing = B[0] > A[0]
  const th0 = pull ? 45 : lift ? 12 : closing ? 92 : 14, th1 = pull ? 90 : lift ? 86 : closing ? 14 : 92
  const theta = ((th0 + (th1 - th0) * p) * Math.PI) / 180
  // face pull: del agarre al frente (antebrazos hacia dentro) a codos altos con antebrazos verticales
  const th2 = pull ? ((-70 + 240 * p) * Math.PI) / 180 : theta - (lift ? 0.18 : 0.32 + 0.5 * (closing ? p : 1 - p))
  const fArms = !armsFront ? [] : ([-1, 1] as const).map((sd) => {
    const sh: P = [110 + sd * 26, 50]
    const el = add(sh, [sd * Math.sin(theta) * UARM, Math.cos(theta) * UARM])
    const hand = add(el, [sd * Math.sin(th2) * FARM, Math.cos(th2) * FARM])
    return { sd, sh, el, hand, ua: seg(sh, el, UARM_PROF), fa: seg(el, hand, FARM_PROF) }
  })
  const frontal = leg && (d.pose === 'sentado' || d.pose === 'sentado-reclinado') && Math.abs(B[1] - A[1]) < 2 && Math.abs(B[0] - A[0]) > 3
  const opening = B[0] > A[0]
  const kx = (opening ? 22 : 46) + ((opening ? 46 : 22) - (opening ? 22 : 46)) * p
  const horizontal = d.pose === 'tumbado' || d.pose === 'prono'
  const seated = d.pose === 'sentado' || d.pose === 'sentado-reclinado'
  const vertical = Math.abs(B[1] - A[1]) > Math.abs(B[0] - A[0])

  // Recorrido: la flecha de carga apunta SIEMPRE en el sentido de la fase concéntrica;
  // la vuelta (excéntrica) va en tenue, desplazada, en sentido contrario.
  const idaPts: P[] = V ? [A, V, B] : [A, B]
  const loadPts = loadPhase === 'ida' ? idaPts : [...idaPts].reverse()
  const loadArrow = arrowOn(loadPts)
  const nl = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
  const off: P = [(-(B[1] - A[1]) / nl) * 5, ((B[0] - A[0]) / nl) * 5]
  const retArrow = arrowOn([...loadPts].reverse().map((q) => add(q, off)))
  const markFill = !phases || concentric
    ? { fill: 'var(--signal)', stroke: 'var(--ink)' }
    : { fill: 'var(--surface)', stroke: 'var(--signal)', strokeDasharray: '2 1.5' }
  const verb = (() => {
    if (d.motion === 'apertura') return (d.loadPhase === 'vuelta' ? B[0] <= A[0] : B[0] > A[0]) ? 'Juntas' : 'Abres'
    return VERB[d.motion] ?? 'Cargas'
  })()

  const active = stepOf(p)
  const label = steps ? steps[active] : (d.caption ?? 'Recorrido del movimiento')

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox="0 0 220 170"
          className="block h-auto w-full cursor-pointer rounded-2xl border border-hair bg-surface"
          role="img"
          aria-label={d.caption ?? 'Esquema del ejercicio'}
          onClick={() => setPaused((x) => !x)}
        >
          <defs>
            <pattern id="dg" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.6" fill="var(--hair)" /></pattern>
          </defs>
          <rect width="220" height="170" fill="url(#dg)" />
          <line x1="6" x2="214" y1={FLOOR + 1} y2={FLOOR + 1} stroke="var(--ink)" strokeWidth="2" />

          {frontal ? (
            <g>
              <text x="8" y="14" fontSize="6.5" fill="var(--mute)" style={{ letterSpacing: '0.14em' }}>VISTA FRONTAL</text>
              <rect x="94" y="38" width="32" height="70" {...mute} fill="var(--ink)" fillOpacity="0.1" stroke="none" />
              <rect x="82" y="106" width="56" height="7" fill="var(--ink)" fillOpacity="0.2" />
              {[-1, 1].map((sd) => {
                const hipP: P = [110 + sd * 10, 107], knee: P = [110 + sd * kx, 121], foot: P = [110 + sd * (kx + 2), 151]
                const th = seg(hipP, knee, [[0, 9], [1, 6.5]])
                const sh = seg(knee, foot, [[0, 6.5], [1, 4]])
                const hot = prim.has('gluteo') ? 'gluteo' : 'cuadriceps'
                const loadOpening = loadPhase === 'vuelta' ? !opening : opening
                const tipX = 110 + sd * (kx + (loadOpening ? 28 : 15)), tailX = 110 + sd * (kx + (loadOpening ? 15 : 28))
                return (
                  <g key={sd}>
                    <line x1={110 + sd * (kx + 9)} y1="109" x2={110 + sd * (kx + 9)} y2="134" stroke="var(--ink)" strokeOpacity="0.3" strokeWidth="6" />
                    <polygon points={str(sh.outline)} {...body} />
                    <polygon points={str([[foot[0] - 7, 150], [foot[0] + 7, 150], [foot[0] + 9, 156], [foot[0] - 9, 156]])} {...body} />
                    <polygon points={str(th.outline)} {...body} />
                    {(prim.has(hot) || sec.has(hot)) && <polygon points={str(th.band(0.1, 0.95, 'both'))} {...mStyle(hot)} />}
                    <g opacity={!phases || concentric ? 1 : 0.35}><line x1={tailX} y1="124" x2={tipX} y2="124" stroke="var(--signal)" strokeWidth="2" strokeLinecap="round" />
                    <polygon points={str([[tipX, 124], [tipX - sd * 6, 120.5], [tipX - sd * 6, 127.5]])} fill="var(--signal)" stroke="var(--ink)" strokeWidth="0.6" strokeLinejoin="round" /></g>
                    <rect x={knee[0] - 4.5} y={knee[1] - 4.5} width="9" height="9" {...markFill} strokeWidth="1.5" />
                  </g>
                )
              })}
              <polygon points={str([[83, 44], [137, 44], [127, 80], [129, 106], [91, 106], [93, 80]])} {...body} />
              <polygon points={str([[83, 44], [74, 47], [68, 88], [76, 90], [84, 58]])} {...body} />
              <polygon points={str([[137, 44], [146, 47], [152, 88], [144, 90], [136, 58]])} {...body} />
              <rect x="105" y="33" width="10" height="12" {...body} />
              <circle cx="110" cy="24" r="8" {...body} />
            </g>
          ): armsFront ? (
            <g>
              <text x="8" y="14" fontSize="6.5" fill="var(--mute)" style={{ letterSpacing: '0.14em' }}>VISTA FRONTAL</text>
              {d.implement === 'polea' && [-1, 1].map((sd) => (
                <g key={sd} stroke="var(--ink)" strokeOpacity="0.3" fill="none">
                  <line x1={110 + sd * 96} x2={110 + sd * 96} y1="8" y2={FLOOR} strokeWidth="6" />
                  <circle cx={110 + sd * 96} cy="22" r="6" fill="var(--surface)" strokeWidth="2" />
                  <line x1={110 + sd * 96} y1="22" x2={fArms[sd < 0 ? 0 : 1].hand[0]} y2={fArms[sd < 0 ? 0 : 1].hand[1]} stroke="var(--ink)" strokeOpacity="0.6" strokeWidth="1.2" strokeDasharray="3 2" />
                </g>
              ))}
              {d.pose.startsWith('sentado') && <rect x="86" y="106" width="48" height="7" fill="var(--ink)" fillOpacity="0.2" />}
              {[-1, 1].map((sd) => {
                const lg2 = seg([110 + sd * 9, 106], [110 + sd * 12, 150], [[0, 9], [0.4, 8], [1, 4.8]])
                return (
                  <g key={sd}>
                    <polygon points={str(lg2.outline)} {...body} />
                    <polygon points={str([[110 + sd * 12 - 7, 150], [110 + sd * 12 + 7, 150], [110 + sd * 12 + 9, 156], [110 + sd * 12 - 9, 156]])} {...body} />
                  </g>
                )
              })}
              <polygon points={str([[83, 44], [137, 44], [127, 80], [129, 108], [91, 108], [93, 80]])} {...body} />
              <rect x="105" y="33" width="10" height="12" {...body} />
              <circle cx="110" cy="24" r="8" {...body} />
              {fArms.map((a) => (
                <g key={a.sd}>
                  <polygon points={str(a.ua.outline)} {...body} />
                  <polygon points={str(a.fa.outline)} {...body} />
                  <circle cx={a.hand[0]} cy={a.hand[1]} r="3.4" {...body} />
                </g>
              ))}
              {fArms.map((a) => (
                <g key={'m' + a.sd}>
                  {(prim.has('pecho') || sec.has('pecho')) && (
                    <polygon
                      points={str([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => [110 + a.sd * 13 + Math.cos((k / 10) * 2 * Math.PI) * 11, 62 + Math.sin((k / 10) * 2 * Math.PI) * 8.5] as P))}
                      {...mStyle('pecho')} strokeLinejoin="round"
                    />
                  )}
                  {(prim.has('hombro') || sec.has('hombro')) && (
                    <>
                      <circle cx={a.sh[0]} cy={a.sh[1]} r="7.5" {...mStyle('hombro')} />
                      <polygon points={str(a.ua.band(0, 0.5, 'both'))} {...mStyle('hombro')} strokeLinejoin="round" />
                    </>
                  )}
                  {(prim.has('biceps') || sec.has('biceps')) && <polygon points={str(a.ua.band(0.2, 0.9, 'both'))} {...mStyle('biceps')} strokeLinejoin="round" />}
                  {(prim.has('triceps') || sec.has('triceps')) && <polygon points={str(a.ua.band(0.2, 0.9, 'both'))} {...mStyle('triceps')} strokeLinejoin="round" />}
                  {(prim.has('antebrazo') || sec.has('antebrazo')) && <polygon points={str(a.fa.band(0.05, 0.9, 'both'))} {...mStyle('antebrazo')} strokeLinejoin="round" />}
                  {(prim.has('core') || sec.has('core')) && <polygon points={str([[100, 78], [120, 78], [118, 106], [102, 106]])} {...mStyle('core')} />}
                  {/* flecha de sentido en cada mano */}
                  {(() => {
                    const flip = loadPhase === 'vuelta' ? -1 : 1
                    const dir: P = lift ? [0, -flip] : closing ? [-a.sd * flip, 0] : [a.sd * flip, 0]
                    const o: P = lift ? [a.sd * 13, 0] : [0, 14]
                    const t0 = add(a.hand, o), t1 = add(t0, [dir[0] * 16, dir[1] * 16])
                    return (
                      <g opacity={!phases || concentric ? 1 : 0.35}>
                        <line x1={t0[0]} y1={t0[1]} x2={t1[0]} y2={t1[1]} stroke="var(--signal)" strokeWidth="2" strokeLinecap="round" />
                        <polygon points={str([t1, add(t1, [-dir[0] * 6 - dir[1] * 3.5, -dir[1] * 6 + dir[0] * 3.5]), add(t1, [-dir[0] * 6 + dir[1] * 3.5, -dir[1] * 6 - dir[0] * 3.5])])} fill="var(--signal)" stroke="var(--ink)" strokeWidth="0.6" strokeLinejoin="round" />
                      </g>
                    )
                  })()}
                  <rect x={a.hand[0] - 4.5} y={a.hand[1] - 4.5} width="9" height="9" {...markFill} strokeWidth="1.5" />
                </g>
              ))}
            </g>
          ) : (<>
          <g {...mute} strokeLinecap="butt" fill="none">
            {(seated || horizontal) && <line x1={padA[0]} y1={padA[1]} x2={padB[0]} y2={padB[1]} strokeWidth="9" />}
            {seated && <line x1={s.hip[0] - 12} y1={s.hip[1] + 11} x2={s.hip[0] + 16} y2={s.hip[1] + 11} strokeWidth="7" />}
            {seated && <line x1={s.hip[0] - 4} y1={s.hip[1] + 15} x2={s.hip[0] - 4} y2={FLOOR} strokeWidth="5" />}
            {horizontal && <>
              <line x1={s.hip[0] - 4} y1={s.hip[1] + 15} x2={s.hip[0] + 24} y2={s.hip[1] + 15} strokeWidth="7" />
              <line x1={Math.min(s.hip[0], s.shoulder[0]) + 6} y1={s.hip[1] + 19} x2={Math.min(s.hip[0], s.shoulder[0]) + 6} y2={FLOOR} strokeWidth="5" />
              <line x1={Math.max(s.hip[0], s.shoulder[0]) - 6} y1={s.hip[1] + 19} x2={Math.max(s.hip[0], s.shoulder[0]) - 6} y2={FLOOR} strokeWidth="5" />
            </>}
            {d.implement === 'polea' && (vertical ? (
              <>
                <line x1="10" x2="210" y1="12" y2="12" strokeWidth="5" />
                <circle cx={A[0]} cy="12" r="7" fill="var(--surface)" strokeWidth="2" />
                <line x1={A[0]} y1="12" x2={cur[0]} y2={cur[1]} stroke="var(--ink)" strokeOpacity="0.6" strokeWidth="1.2" strokeDasharray="3 2" />
              </>
            ) : (
              <>
                <line x1="205" x2="205" y1="8" y2={FLOOR} strokeWidth="8" />
                <circle cx="205" cy={A[1]} r="7" fill="var(--surface)" strokeWidth="2" />
                <line x1="205" y1={A[1]} x2={cur[0]} y2={cur[1]} stroke="var(--ink)" strokeOpacity="0.6" strokeWidth="1.2" strokeDasharray="3 2" />
              </>
            ))}
            {d.implement === 'multipower' && <line x1={A[0]} x2={A[0]} y1="8" y2={FLOOR} strokeWidth="5" />}
          </g>
          {d.implement === 'multipower' && <circle cx={cur[0]} cy={cur[1]} r="4.5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2.5" />}
          {pedal && <line x1={pedal[0][0]} y1={pedal[0][1]} x2={pedal[1][0]} y2={pedal[1][1]} stroke="var(--ink)" strokeOpacity="0.4" strokeWidth="3.5" strokeLinecap="round" />}
          {d.implement === 'maquina' && !calf && <circle cx={cur[0] + 3} cy={cur[1] - 1} r="3.5" fill="var(--ink)" fillOpacity="0.35" />}

          {/* recorrido: línea punteada + flecha + marca de inicio */}
          {phases ? (
            <>
              <polyline points={retArrow.line} fill="none" stroke="var(--ink)" strokeOpacity={concentric ? 0.28 : 0.7} strokeWidth="1.6" strokeDasharray="1.5 4" strokeLinecap="round" strokeLinejoin="round" />
              <polygon points={retArrow.head} fill="none" stroke="var(--ink)" strokeOpacity={concentric ? 0.28 : 0.7} strokeWidth="1.2" strokeLinejoin="round" />
              <polyline points={loadArrow.line} fill="none" stroke="var(--signal)" strokeOpacity={concentric ? 1 : 0.35} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              <polygon points={loadArrow.head} fill="var(--signal)" fillOpacity={concentric ? 1 : 0.35} stroke="var(--ink)" strokeOpacity={concentric ? 1 : 0.35} strokeWidth="0.7" strokeLinejoin="round" />
            </>
          ) : (
            <>
              <polyline points={loadArrow.line} fill="none" stroke="var(--signal)" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" strokeLinejoin="round" />
              <polygon points={loadArrow.head} fill="var(--signal)" stroke="var(--ink)" strokeWidth="0.7" strokeLinejoin="round" />
            </>
          )}
          <rect x={A[0] - 3.5} y={A[1] - 3.5} width="7" height="7" fill="var(--surface)" stroke="var(--signal)" strokeWidth="1.5" />

          {/* figura */}
          <polygon points={str(thigh.outline)} {...body} />
          <polygon points={str(shin.outline)} {...body} />
          <polygon points={str(foot.outline)} {...body} />
          <polygon points={str(torso.outline)} {...body} />
          <polygon points={str(neck.outline)} {...body} />
          <circle cx={head[0]} cy={head[1]} r="7" {...body} />
          <polygon points={str(uarm.outline)} {...body} />
          <polygon points={str(farm.outline)} {...body} />
          <circle cx={arm.end[0]} cy={arm.end[1]} r="3.4" {...body} />

          {muscles.filter((x) => prim.has(x.m) || sec.has(x.m)).map((x) => (
            <g key={x.m}>
              {x.circle && <circle cx={x.circle[0]} cy={x.circle[1]} r="6.5" {...mStyle(x.m)} />}
              {x.pts && <polygon points={str(x.pts)} {...mStyle(x.m)} strokeLinejoin="round" />}
            </g>
          ))}

          {/* punto móvil */}
          <rect x={cur[0] - 4.5} y={cur[1] - 4.5} width="9" height="9" {...markFill} strokeWidth="1.5" />
          </>)}
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
