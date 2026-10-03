/**
 * Regresión anatómica PERMANENTE de los esquemas animados: para cada ficha se muestrea el ciclo completo
 * (120 fotogramas: ida y vuelta) con la cinemática del rig y se exige:
 *  a) rodilla: solo flexiona (hacia atrás), sin hiperextensión > 5° y ≤ 140°;
 *  b) codo: solo flexiona (hacia delante), sin hiperextensión > 5° y ≤ 150°;
 *  c) hombro −60…180° y cadera −20…120°;
 *  d) tobillo (plantarflexión) ≤ 50°;
 *  e) CONTINUIDAD: sin cambios bruscos entre fotogramas (detecta inversiones del IK, como la rodilla de los gemelos);
 *  f) nada bajo el suelo, cabeza dentro del lienzo, manos en la barra cuando el cuerpo cuelga.
 * Los mensajes dicen ficha, articulación y fotograma.
 *
 * `poseAt` replica la lógica de pose de ExerciseDiagram (colgado, hip thrust, sentadilla, gemelos, brazo estático)
 * con geom.ts + rigSpec. Cuando DISEÑADOR exponga una función pura equivalente, basta con sustituir `poseAt`.
 */
import { describe, expect, it } from 'vitest'
import { add, anterior, dist, higher, ik, lower, mix, type P } from '../components/android/geom'
import { GUIDES } from './exerciseGuides'
import type { MovementDiagram } from './guideTypes'
import { basePose, CANVAS, REACH, SEG, SPECIAL, toPx } from './rigSpec'

const FLOOR = CANVAS.floor
const { torso: TORSO, thigh: THIGH, shin: SHIN, uarm: UARM, farm: FARM } = SEG
const N = 60 // fotogramas por mitad (ida y vuelta → 120)

type Pick = (a: P, b: P) => P
interface Pose {
  plane: 'lateral' | 'frontal'
  shoulder: P; elbow: P; hand: P
  hip: P; knee: P; ankle: P
  torsoUp: P
  headTop: number
  target: P | null // barra o asa fija (colgado)
  plantarDeg: number
  /** Solo vista frontal de brazos: giro del antebrazo respecto al brazo (grados) */
  frontalElbowDeg?: number
}

/** Opciones solo para la prueba de sensibilidad. */
interface Opts { legPick?: (root: P, target: P) => Pick }

function poseAt(d: MovementDiagram, p: number, opts: Opts = {}): Pose {
  const legPick = opts.legPick ?? anterior
  const r = (d.backAngle * Math.PI) / 180
  const up: P = [-Math.sin(r), -Math.cos(r)]
  const bp = basePose(d.pose, d.backAngle)
  const base = { hip: bp.hip, shoulder: bp.shoulder, ankle: bp.ankle, up, knee: d.pose === 'prono' ? ([bp.hip[0] - THIGH, bp.hip[1]] as P) : ik(bp.hip, bp.ankle, THIGH, SHIN, legPick(bp.hip, bp.ankle)).mid }
  const leg = d.limb === 'pierna'
  let s: { shoulder: P; hip: P; ankle: P; knee: P; up: P } = base
  const A = toPx(d.from), B = toPx(d.to)
  const V: P | null = d.via ? toPx(d.via) : null
  const cur: P = V ? (p < 0.5 ? mix(A, V, p * 2) : mix(V, B, (p - 0.5) * 2)) : mix(A, B, p)
  let armTarget: P | null = null
  let armPick: Pick = d.elbow === 'arriba' ? higher : lower
  if (d.pose === 'colgado') {
    const { rise, pullStart, dipStart } = SPECIAL.colgado
    const pull = d.motion === 'tiron'
    const H: P = pull ? [B[0], Math.min(A[1], B[1])] : [A[0], Math.max(A[1], B[1])]
    const bodyAt = (q: number): P => [pull ? H[0] - 12 : H[0], pull ? H[1] + pullStart - rise * q : H[1] + dipStart - rise * q]
    const sh = bodyAt(p)
    const hip: P = [sh[0], sh[1] + TORSO]
    const ankle: P = [hip[0] - 10, Math.min(hip[1] + 34, FLOOR - 4)]
    s = { shoulder: sh, hip, ankle, knee: ik(hip, ankle, THIGH, SHIN, legPick(hip, ankle)).mid, up: [0, -1] }
    armTarget = H
    if (!pull) armPick = (a, b) => (a[0] < b[0] ? a : b)
  }
  if (d.pose === 'tumbado' && d.motion === 'bisagra' && !leg) {
    const S0 = base.shoulder
    const l = Math.hypot(cur[0] - S0[0], cur[1] - S0[1]) || 1
    const hip: P = [S0[0] + ((cur[0] - S0[0]) / l) * TORSO, S0[1] + ((cur[1] - S0[1]) / l) * TORSO]
    const k = ik(hip, base.ankle, THIGH, SHIN, legPick(hip, base.ankle))
    s = { shoulder: S0, hip, ankle: k.end, knee: k.mid, up: [(S0[0] - hip[0]) / TORSO, (S0[1] - hip[1]) / TORSO] }
  }
  const squat = leg && d.motion === 'sentadilla'
  if (squat) {
    const hip: P = [base.hip[0] + (A[0] - cur[0]), base.hip[1] + (A[1] - cur[1])]
    const shift: P = [hip[0] - base.hip[0], hip[1] - base.hip[1]]
    const k = ik(hip, base.ankle, THIGH, SHIN, legPick(hip, base.ankle), REACH.leg)
    s = { shoulder: add(base.shoulder, shift), hip, ankle: k.end, knee: k.mid, up: base.up }
  }
  const calf = leg && d.motion === 'elevacion'
  let calfLeg: { mid: P; end: P } | null = null
  let plantarDeg = 0
  if (calf) {
    if (d.pose === 'sentado-reclinado') {
      const dl = Math.hypot(A[0] - s.hip[0], A[1] - s.hip[1]) || 1
      const tgt: P = [s.hip[0] + ((A[0] - s.hip[0]) / dl) * (THIGH + SHIN), s.hip[1] + ((A[1] - s.hip[1]) / dl) * (THIGH + SHIN)]
      calfLeg = ik(s.hip, tgt, THIGH, SHIN, legPick(s.hip, tgt), REACH.legRigid)
    } else {
      const tgt: P = [A[0], FLOOR - 9]
      calfLeg = ik(s.hip, tgt, THIGH, SHIN, legPick(s.hip, tgt), REACH.leg)
    }
    plantarDeg = SPECIAL.calf.maxPlantarflexionDeg * p
  }
  const sa = SPECIAL.staticArm
  const staticArm: P = d.pose === 'prono' ? [...sa.prono] as P : squat ? [...sa.squat] as P : d.pose === 'sentado-reclinado' ? [...sa.reclined] as P : [sa.default[0], Math.min(sa.default[1], FLOOR - 4 - s.shoulder[1])]
  const arm = leg ? ik(s.shoulder, add(s.shoulder, staticArm), UARM, FARM, lower) : ik(s.shoulder, armTarget ?? cur, UARM, FARM, armPick, REACH.arm)
  const lg = calfLeg ?? (squat ? { mid: s.knee, end: s.ankle } : leg ? ik(s.hip, cur, THIGH, SHIN, legPick(s.hip, cur), REACH.leg) : { mid: s.knee, end: s.ankle })

  // vistas frontales (mismas fórmulas que ExerciseDiagram)
  const pull = !leg && d.view === 'frontal' && d.motion === 'tiron'
  const armsFront = !leg && (d.motion === 'apertura' || d.motion === 'elevacion' || pull)
  let frontalElbowDeg: number | undefined
  if (armsFront) {
    const lift = d.motion === 'elevacion' || pull
    const closing = B[0] > A[0]
    const th0 = pull ? 45 : lift ? 12 : closing ? 92 : 14, th1 = pull ? 90 : lift ? 86 : closing ? 14 : 92
    const theta = th0 + (th1 - th0) * p
    const th2 = pull ? -70 + 240 * p : theta - ((lift ? 0.18 : 0.32 + 0.5 * (closing ? p : 1 - p)) * 180) / Math.PI
    frontalElbowDeg = theta - th2
  }
  const headTop = s.shoulder[1] + s.up[1] * (SEG.neckVisible + SEG.head)
  return {
    plane: armsFront ? 'frontal' : 'lateral',
    shoulder: s.shoulder, elbow: arm.mid, hand: arm.end, hip: s.hip, knee: lg.mid, ankle: lg.end,
    torsoUp: [s.shoulder[0] - s.hip[0], s.shoulder[1] - s.hip[1]], headTop, target: armTarget, plantarDeg, frontalElbowDeg,
  }
}

// ── ángulos con signo (positivo = sentido anatómico normal) ──
const deg = (rad: number) => (rad * 180) / Math.PI
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0]
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1]
const unit = (v: P): P => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l] }
/** Rodilla: flexión positiva (la pierna se dobla hacia atrás), el humanoide mira a +x. */
const kneeFlex = (q: Pose) => { const t = sub(q.knee, q.hip), sh = sub(q.ankle, q.knee); return deg(Math.atan2(cross(t, sh), dot(t, sh))) }
/** Codo: flexión positiva (el antebrazo se dobla hacia delante). */
const elbowFlex = (q: Pose) => { const u = sub(q.elbow, q.shoulder), f = sub(q.hand, q.elbow); return -deg(Math.atan2(cross(u, f), dot(u, f))) }
/** Hombro/cadera: ángulo respecto al eje "hacia abajo" del tronco, positivo hacia delante. */
const swing = (down: P, v: P) => {
  const a = -deg(Math.atan2(cross(unit(down), unit(v)), dot(unit(down), unit(v))))
  return a < -120 ? a + 360 : a // brazos por encima de la cabeza: continúa por encima de 180°
}
const shoulderAngle = (q: Pose) => swing([-q.torsoUp[0], -q.torsoUp[1]], sub(q.elbow, q.shoulder))
const hipAngle = (q: Pose) => swing([-q.torsoUp[0], -q.torsoUp[1]], sub(q.knee, q.hip))

const frames = (): { p: number; label: string }[] =>
  Array.from({ length: 2 * N }, (_, k) => (k < N ? { p: k / N, label: `ida ${k}` } : { p: 1 - (k - N) / N, label: `vuelta ${k - N}` }))

interface Issue { ficha: string; articulacion: string; fotograma: string; detalle: string }

function checkCycle(d: MovementDiagram, ficha: string, opts: Opts = {}): Issue[] {
  const issues: Issue[] = []
  const bad = (articulacion: string, fotograma: string, detalle: string) => { if (issues.length < 6) issues.push({ ficha, articulacion, fotograma, detalle }) }
  const leg = d.limb === 'pierna'
  const frontalLeg = leg && (d.pose === 'sentado' || d.pose === 'sentado-reclinado') && Math.abs(toPx(d.to)[1] - toPx(d.from)[1]) < 2 && Math.abs(toPx(d.to)[0] - toPx(d.from)[0]) > 3
  let prev: { f: string; p: Pose; knee: number; elbow: number; sh: number; hip: number } | null = null
  for (const { p, label } of frames()) {
    const q = poseAt(d, p, opts)
    const knee = kneeFlex(q), elbow = elbowFlex(q), sh = shoulderAngle(q), hip = hipAngle(q)
    const f = `${label} (p=${p.toFixed(2)})`
    // a) rodilla
    if (!frontalLeg) {
      if (knee < -5) bad('rodilla', f, `hiperextensión/inversión: ${knee.toFixed(1)}° (mín −5°)`)
      if (knee > 140) bad('rodilla', f, `flexión excesiva: ${knee.toFixed(1)}° (máx 140°)`)
    }
    // b) codo (en vista frontal solo se comprueba el giro del antebrazo)
    if (q.plane === 'lateral') {
      if (elbow < -5) bad('codo', f, `hiperextensión/inversión: ${elbow.toFixed(1)}° (mín −5°)`)
      if (elbow > 150) bad('codo', f, `flexión excesiva: ${elbow.toFixed(1)}° (máx 150°)`)
      // c) hombro
      if (sh < -60 || sh > 180) bad('hombro', f, `${sh.toFixed(1)}° fuera de −60…180°`)
    } else if (q.frontalElbowDeg !== undefined && Math.abs(q.frontalElbowDeg) > 150) {
      bad('codo (frontal)', f, `giro del antebrazo ${q.frontalElbowDeg.toFixed(1)}° (máx 150°)`)
    }
    if (hip < -20 || hip > 120) bad('cadera', f, `${hip.toFixed(1)}° fuera de −20…120°`)
    // d) tobillo
    if (q.plantarDeg > 50) bad('tobillo', f, `plantarflexión ${q.plantarDeg.toFixed(1)}° (máx 50°)`)
    // f) suelo, cabeza, manos en agarre
    for (const [name, pt] of [['mano', q.hand], ['pie', q.ankle], ['codo', q.elbow], ['rodilla', q.knee]] as const) {
      if (pt[1] > FLOOR + 0.5) bad(name, f, `bajo el suelo: y=${pt[1].toFixed(1)} (suelo ${FLOOR})`)
    }
    if (q.headTop < 0) bad('cabeza', f, `fuera del lienzo: y=${q.headTop.toFixed(1)}`)
    if (q.target && dist(q.hand, q.target) > 2) bad('mano', f, `a ${dist(q.hand, q.target).toFixed(1)} px de la barra`)
    // e) continuidad con el fotograma anterior
    if (prev) {
      const step = (name: string, a: number, b: number, max: number) => {
        if (Math.abs(a - b) > max) bad(name, f, `salto de ${(b - a).toFixed(1)}° respecto a ${prev!.f} (máx ${max}°/fotograma)`)
        if (Math.sign(a) !== Math.sign(b) && Math.abs(a) > 8 && Math.abs(b) > 8) bad(name, f, `cambio de signo ${a.toFixed(1)}° → ${b.toFixed(1)}° (inversión)`)
      }
      if (!frontalLeg) step('rodilla', prev.knee, knee, 8)
      if (q.plane === 'lateral') { step('codo', prev.elbow, elbow, 8); step('hombro', prev.sh, sh, 8) }
      step('cadera', prev.hip, hip, 8)
      // en vista frontal el brazo se dibuja con otra construcción: el IK lateral del brazo no se usa
      const joints: [string, P, P][] = [['rodilla (posición)', prev.p.knee, q.knee]]
      if (q.plane === 'lateral') joints.push(['codo (posición)', prev.p.elbow, q.elbow])
      for (const [name, a, b] of joints) {
        if (dist(a, b) > 6) bad(name, f, `salta ${dist(a, b).toFixed(1)} px entre fotogramas`)
      }
    }
    prev = { f, p: q, knee, elbow, sh, hip }
  }
  return issues
}

const fmt = (issues: Issue[]) => issues.map((i) => `${i.ficha} · ${i.articulacion} · fotograma ${i.fotograma}: ${i.detalle}`).join('\n')

describe('anatomía del ciclo completo (120 fotogramas por ficha)', () => {
  it('todas las fichas respetan rangos, sentido de giro y continuidad', () => {
    const all = GUIDES.flatMap((g) => checkCycle(g.diagram, g.key))
    expect(all.length, '\n' + fmt(all)).toBe(0)
  })

  it('cubre las 35 fichas con 120 fotogramas cada una', () => {
    expect(GUIDES.length).toBe(35)
    expect(frames().length).toBe(120)
  })

  // Prueba de sensibilidad: si la rodilla se doblara hacia delante (el bug de los gemelos en prensa),
  // el test debe fallar. Si esto deja de detectarse, el test ya no protege nada.
  it('detecta una rodilla invertida (sensibilidad)', () => {
    const invert = (root: P, target: P): Pick => {
      const ant = anterior(root, target)
      return (a, b) => (ant(a, b) === a ? b : a)
    }
    for (const key of ['Elevación de gemelos en prensa', 'Prensa de piernas', 'Extensión de cuádriceps', 'Hack squat']) {
      const g = GUIDES.find((x) => x.key === key)!
      const issues = checkCycle(g.diagram, g.key, { legPick: invert })
      expect(issues.some((i) => i.articulacion.startsWith('rodilla')), `${key}: no detectó la rodilla invertida`).toBe(true)
    }
  })

  it('detecta un salto brusco del IK (sensibilidad)', () => {
    // un cambio de lado de la rodilla a mitad del ciclo produce un salto de posición/ángulo entre fotogramas
    const flipMid = (root: P, target: P): Pick => {
      const ant = anterior(root, target)
      return (a, b) => (target[0] > root[0] + 40 ? (ant(a, b) === a ? b : a) : ant(a, b))
    }
    const g = GUIDES.find((x) => x.key === 'Extensión de cuádriceps')!
    const issues = checkCycle(g.diagram, g.key, { legPick: flipMid })
    expect(issues.length).toBeGreaterThan(0)
  })
})
