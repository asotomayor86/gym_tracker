/** Geometría 2D del androide: puntos, cinemática de 2 huesos y pose del rig en un progreso p. */
import type { MovementDiagram } from '../../lib/guideTypes'
import { basePose, CANVAS, REACH, SEG, SPECIAL, toPx } from '../../lib/rigSpec'

export type P = [number, number]
export type Prof = [t: number, w: number][]
export type AsymProf = { f: Prof; b: Prof }

export const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]]
export const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
export const mul = (a: P, k: number): P => [a[0] * k, a[1] * k]
export const nrm = (a: P): P => [-a[1], a[0]]
export const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1]
export const mix = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
export const dist = (a: P, b: P) => Math.hypot(b[0] - a[0], b[1] - a[1])
export const f1 = (n: number) => n.toFixed(1)
export const smooth = (x: number) => x * x * (3 - 2 * x)
export const unit = (v: P): P => {
  const l = Math.hypot(v[0], v[1]) || 1
  return [v[0] / l, v[1] / l]
}
export const scl = (a: P[], k: number): P[] => a.map((p) => [p[0] * k, p[1] * k])
export const place = (o: P, ex: P, ey: P, pts: P[]): P[] =>
  pts.map((p) => [o[0] + ex[0] * p[0] + ey[0] * p[1], o[1] + ex[1] * p[0] + ey[1] * p[1]])
export const ellipse = (cx: number, cy: number, rx: number, ry: number, rot = 0, n = 14): P[] => {
  const out: P[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI, x = Math.cos(a) * rx, y = Math.sin(a) * ry
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)])
  }
  return out
}
export const bisect = (p: P, a: P, b: P): P => {
  const u = unit([a[0] - p[0], a[1] - p[1]]), v = unit([b[0] - p[0], b[1] - p[1]])
  return unit([u[0] + v[0], u[1] + v[1]])
}
export const centroid = (pts: P[]): P => {
  let x = 0, y = 0
  for (const p of pts) { x += p[0]; y += p[1] }
  return [x / pts.length, y / pts.length]
}
export const scaleAround = (pts: P[], k: number): P[] => {
  const c = centroid(pts)
  return pts.map((p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k])
}
export const bboxOf = (pts: P[]) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) }
  return [x0, y0, x1, y1] as const
}

/** `reach`: fracción máxima de la longitud total (<1 deja siempre una ligera flexión de codo/rodilla). */
export function ik(root: P, target: P, l1: number, l2: number, pick: (a: P, b: P) => P, reach = 0.99): { mid: P; end: P } {
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
export const lower = (a: P, b: P) => (a[1] > b[1] ? a : b)
export const higher = (a: P, b: P) => (a[1] < b[1] ? a : b)
/** Rodilla/codo hacia el lado "anterior" del eje raíz→objetivo (el de la rodilla humana, en cualquier postura). */
export const anterior = (root: P, target: P) => {
  const cross = (k: P) => (target[0] - root[0]) * (k[1] - root[1]) - (target[1] - root[1]) * (k[0] - root[0])
  return (a: P, b: P) => (cross(a) < cross(b) ? a : b)
}

function interp(arr: Prof, t: number): number {
  if (t <= arr[0][0]) return arr[0][1]
  for (let i = 1; i < arr.length; i++) {
    if (t <= arr[i][0]) {
      const p0 = arr[i - 1], p1 = arr[i]
      return p0[1] + ((p1[1] - p0[1]) * (t - p0[0])) / (p1[0] - p0[0] || 1)
    }
  }
  return arr[arr.length - 1][1]
}

export type Seg = ReturnType<typeof seg>
/** Segmento con perfil de grosor (simétrico o cara anterior/posterior): contorno y borde a cualquier altura t y lado s (-1 atrás … +1 delante). */
export function seg(a: P, b: P, prof: Prof | AsymProf, sign = 1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
  const f: P = [(dy / l) * sign, (-dx / l) * sign]
  const F = Array.isArray(prof) ? prof : prof.f, Bk = Array.isArray(prof) ? prof : prof.b
  const wF = (t: number) => interp(F, t), wB = (t: number) => interp(Bk, t)
  const c = (t: number) => mix(a, b, t)
  const edge = (t: number, s: number, k = 1): P => {
    const p = c(t), ww = (s >= 0 ? wF(t) : wB(t)) * Math.abs(s) * k, sg = s >= 0 ? 1 : -1
    return [p[0] + f[0] * ww * sg, p[1] + f[1] * ww * sg]
  }
  const outline = [...F.map((q) => edge(q[0], 1)), ...Bk.slice().reverse().map((q) => edge(q[0], -1))]
  return { a, b, f, c, edge, outline, len: l, t0: Math.min(F[0][0], Bk[0][0]), t1: Math.max(F[F.length - 1][0], Bk[Bk.length - 1][0]) }
}

/** Curva cerrada suave (Catmull-Rom → Bézier). */
export function smoothPath(pts: P[]): string {
  const n = pts.length
  let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])},${f1(p2[1])}`
  }
  return d + 'Z'
}
export const openPath = (pts: P[]) => 'M' + pts.map((q) => `${f1(q[0])},${f1(q[1])}`).join(' L')

/** Polígono con esquinas redondeadas (placas de armadura). */
export function roundPoly(pts: P[], r: number): string {
  const n = pts.length
  let d = ''
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n]
    const v1 = unit([a[0] - p[0], a[1] - p[1]]), v2 = unit([b[0] - p[0], b[1] - p[1]])
    const l1 = Math.min(r, dist(a, p) / 2.2), l2 = Math.min(r, dist(b, p) / 2.2)
    d += `${i ? 'L' : 'M'}${f1(p[0] + v1[0] * l1)},${f1(p[1] + v1[1] * l1)}Q${f1(p[0])},${f1(p[1])} ${f1(p[0] + v2[0] * l2)},${f1(p[1] + v2[1] * l2)}`
  }
  return d + 'Z'
}

/* ======================================================================================
 * Pose del rig en un progreso p (0..1). Función PURA: la usan el dibujo y los tests de anatomía.
 * ====================================================================================== */
export interface Skel { shoulder: P; hip: P; knee: P; ankle: P; up: P }
export type JointName = 'knee' | 'elbow' | 'hip' | 'shoulder' | 'ankle'
/** Lectura de una articulación: `deg` con signo, + = sentido natural de flexión (rodilla hacia atrás, codo hacia delante, cadera y hombro hacia delante, tobillo en flexión plantar). */
export interface JointReading { deg: number; sense: 'flexion' | 'extension' | 'neutral' }
export type Frontal =
  | { kind: 'legs'; kx: number; opening: boolean }
  | { kind: 'arms'; theta: number; th2: number; lift: boolean; closing: boolean; pull: boolean }
  | null
export interface RigPose {
  s: Skel
  arm: { mid: P; end: P }
  leg: { mid: P; end: P }
  footVec: P | null
  pedal: [P, P] | null
  A: P; B: P; V: P | null; cur: P
  limbLeg: boolean
  squat: boolean
  calf: boolean
  seated: boolean
  horizontal: boolean
  vertical: boolean
  frontal: Frontal
  /** Brazos en plano frontal (apertura, elevación, face pull). */
  armsFront: boolean
  /** Alias para los tests de anatomía: plano de dibujo y puntos clave. */
  plane: 'lateral' | 'frontal'
  shoulder: P; elbow: P; wrist: P; hip: P; knee: P; ankle: P; torsoUp: P
  /** y del vértice de la cabeza (px). */
  headTop: number
  /** Agarre fijo de las manos (colgado) o null. */
  target: P | null
  plantarDeg: number
  frontalElbowDeg?: number
  /** Ángulos articulares del lado visible (vista lateral). En vistas frontales solo el codo tiene valor (sin signo). */
  joints: Record<JointName, JointReading>
}

/** Rangos fisiológicos permitidos (grados, + = flexión natural). Fuera de ellos, el sentido es imposible. */
export const JOINT_RANGE: Record<JointName, [number, number]> = {
  knee: [-3, 150], elbow: [-3, 150], hip: [-30, 125], shoulder: [-60, 185], ankle: [-25, 55],
}

function skeletonOf(pose: MovementDiagram['pose'], backAngle: number): Skel {
  const r = (backAngle * Math.PI) / 180
  // en prono el cuerpo mira al suelo: la cabeza queda más allá del hombro (+x), no sobre el torso
  const up: P = pose === 'prono' ? [1, 0] : [-Math.sin(r), -Math.cos(r)]
  const { hip, shoulder, ankle } = basePose(pose, backAngle)
  const knee: P = pose === 'prono' ? [hip[0] - SEG.thigh, hip[1]] : ik(hip, ankle, SEG.thigh, SEG.shin, anterior(hip, ankle)).mid
  return { hip, shoulder, knee, ankle, up }
}

const signedAngle = (t: P, u: P) => (Math.atan2(t[0] * u[1] - t[1] * u[0], t[0] * u[0] + t[1] * u[1]) * 180) / Math.PI
const senseOf = (deg: number): JointReading['sense'] => (deg > 1.5 ? 'flexion' : deg < -1.5 ? 'extension' : 'neutral')
const reading = (deg: number): JointReading => ({ deg, sense: senseOf(deg) })

export function poseAt(d: MovementDiagram, p: number): RigPose {
  const { rise, pullStart, dipStart } = SPECIAL.colgado
  const base = skeletonOf(d.pose, d.backAngle)
  let s = base
  let A = toPx(d.from), B = toPx(d.to), V: P | null = d.via ? toPx(d.via) : null
  let cur: P = V ? (p < 0.5 ? mix(A, V, p * 2) : mix(V, B, (p - 0.5) * 2)) : mix(A, B, p)
  const leg = d.limb === 'pierna'
  let armTarget: P | null = null
  let armPick = d.elbow === 'arriba' ? higher : lower
  if (d.pose === 'colgado') {
    const pull = d.motion === 'tiron'
    const H: P = pull ? [B[0], Math.min(A[1], B[1])] : [A[0], Math.max(A[1], B[1])]
    const bodyAt = (q: number): P => [pull ? H[0] - 12 : H[0], pull ? H[1] + pullStart - rise * q : H[1] + dipStart - rise * q]
    const chest = (q: number): P => add(bodyAt(q), [13, 14])
    const sh = bodyAt(p)
    const hip: P = [sh[0], sh[1] + SEG.torso]
    const ankle: P = [hip[0] - 10, Math.min(hip[1] + 34, CANVAS.floor - 4)]
    s = { shoulder: sh, hip, ankle, knee: ik(hip, ankle, SEG.thigh, SEG.shin, anterior(hip, ankle)).mid, up: [0, -1] }
    A = chest(0); B = chest(1); V = null; cur = chest(p)
    armTarget = H
    if (!pull) armPick = (a, b) => (a[0] < b[0] ? a : b)
  }
  if (d.pose === 'tumbado' && d.motion === 'bisagra' && !leg) {
    const S0 = base.shoulder
    const l = Math.hypot(cur[0] - S0[0], cur[1] - S0[1]) || 1
    const hip: P = [S0[0] + ((cur[0] - S0[0]) / l) * SEG.torso, S0[1] + ((cur[1] - S0[1]) / l) * SEG.torso]
    const k = ik(hip, base.ankle, SEG.thigh, SEG.shin, anterior(hip, base.ankle))
    s = { shoulder: S0, hip, ankle: k.end, knee: k.mid, up: [(S0[0] - hip[0]) / SEG.torso, (S0[1] - hip[1]) / SEG.torso] }
  }
  const squat = leg && d.motion === 'sentadilla'
  if (squat) {
    const A0 = A, hipOf = (c: P): P => [base.hip[0] + (A0[0] - c[0]), base.hip[1] + (A0[1] - c[1])]
    const hip = hipOf(cur)
    const pathAt = (q: number): P => (V ? (q < 0.5 ? mix(A0, V, q * 2) : mix(V, B, (q - 0.5) * 2)) : mix(A0, B, q))
    A = hipOf(pathAt(0)); B = hipOf(pathAt(1)); cur = hip; V = null
    const shift: P = [hip[0] - base.hip[0], hip[1] - base.hip[1]]
    const k = ik(hip, base.ankle, SEG.thigh, SEG.shin, anterior(hip, base.ankle), REACH.leg)
    s = { shoulder: add(base.shoulder, shift), hip, ankle: k.end, knee: k.mid, up: base.up }
  }
  const calf = leg && d.motion === 'elevacion'
  const rot = (v: P, a: number): P => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]
  let footVec: P | null = null
  let calfLeg: { mid: P; end: P } | null = null
  let pedal: [P, P] | null = null
  if (calf) {
    const reclined = d.pose === 'sentado-reclinado'
    let rest: { mid: P; end: P }
    if (reclined) {
      const dl = Math.hypot(A[0] - s.hip[0], A[1] - s.hip[1]) || 1
      const L2 = SEG.thigh + SEG.shin
      const tgt: P = [s.hip[0] + ((A[0] - s.hip[0]) / dl) * L2, s.hip[1] + ((A[1] - s.hip[1]) / dl) * L2]
      rest = ik(s.hip, tgt, SEG.thigh, SEG.shin, anterior(s.hip, tgt), REACH.legRigid)
    } else {
      const tgt: P = [A[0], CANVAS.floor - 9]
      rest = ik(s.hip, tgt, SEG.thigh, SEG.shin, anterior(s.hip, tgt), REACH.leg)
    }
    const l0 = Math.hypot(rest.end[0] - rest.mid[0], rest.end[1] - rest.mid[1]) || 1
    const f0: P = [(rest.end[1] - rest.mid[1]) / l0, -(rest.end[0] - rest.mid[0]) / l0]
    const fvAt = (q: number) => rot(f0, (SPECIAL.calf.maxPlantarflexionDeg * Math.PI * q) / 180)
    const toe = SPECIAL.calf.toeLength
    const toeAt = (q: number): P => add(rest.end, [fvAt(q)[0] * toe, fvAt(q)[1] * toe])
    footVec = fvAt(p)
    calfLeg = rest
    const sole: P = [-footVec[1], footVec[0]]
    pedal = [
      add(rest.end, [sole[0] * 8 - footVec[0] * 7, sole[1] * 8 - footVec[1] * 7]),
      add(rest.end, [sole[0] * 8 + footVec[0] * 21, sole[1] * 8 + footVec[1] * 21]),
    ]
    A = toeAt(0); B = toeAt(1); V = null; cur = toeAt(p)
  }
  const sa = SPECIAL.staticArm
  const staticArm: P = d.pose === 'prono' ? [sa.prono[0], sa.prono[1]] : squat ? [sa.squat[0], sa.squat[1]]
    : d.pose === 'sentado-reclinado' ? [sa.reclined[0], sa.reclined[1]] : [sa.default[0], Math.min(sa.default[1], CANVAS.floor - 4 - s.shoulder[1])]
  const arm = leg
    ? ik(s.shoulder, add(s.shoulder, staticArm), SEG.uarm, SEG.farm, lower)
    : ik(s.shoulder, armTarget ?? cur, SEG.uarm, SEG.farm, armPick, REACH.arm)
  const lg = calfLeg ?? (squat ? { mid: s.knee, end: s.ankle } : leg ? ik(s.hip, cur, SEG.thigh, SEG.shin, anterior(s.hip, cur), REACH.leg) : { mid: s.knee, end: s.ankle })
  s = { ...s, knee: lg.mid, ankle: lg.end }

  const pullF = !leg && d.view === 'frontal' && d.motion === 'tiron'
  const armsFront = !leg && (d.motion === 'apertura' || d.motion === 'elevacion' || pullF)
  const lift = d.motion === 'elevacion' || pullF
  const closing = B[0] > A[0]
  const th0 = pullF ? 45 : lift ? 12 : closing ? 92 : 14, th1 = pullF ? 90 : lift ? 86 : closing ? 14 : 92
  const theta = ((th0 + (th1 - th0) * p) * Math.PI) / 180
  const th2 = pullF ? ((-70 + 240 * p) * Math.PI) / 180 : theta - (lift ? 0.18 : 0.32 + 0.5 * (closing ? p : 1 - p))
  const frontalLegs = leg && (d.pose === 'sentado' || d.pose === 'sentado-reclinado') && Math.abs(B[1] - A[1]) < 2 && Math.abs(B[0] - A[0]) > 3
  const opening = B[0] > A[0]
  const kx = (opening ? 22 : 46) + ((opening ? 46 : 22) - (opening ? 22 : 46)) * p
  const frontal: Frontal = frontalLegs ? { kind: 'legs', kx, opening } : armsFront ? { kind: 'arms', theta, th2, lift, closing, pull: pullF } : null

  // ángulos articulares (+ = sentido natural de flexión)
  const thighV = sub(s.knee, s.hip), shinV = sub(s.ankle, s.knee)
  const uarmV = sub(arm.mid, s.shoulder), farmV = sub(arm.end, arm.mid)
  const torsoDown = sub(s.hip, s.shoulder)
  const fv = !!frontal
  const knee = fv ? 0 : signedAngle(thighV, shinV)
  const elbow = fv ? Math.abs(signedAngle(uarmV, farmV)) : -signedAngle(uarmV, farmV)
  const hipA = fv ? 0 : -signedAngle(torsoDown, thighV)
  const shoulderA = fv ? 0 : -signedAngle(torsoDown, uarmV)
  const ankleA = calf ? SPECIAL.calf.maxPlantarflexionDeg * p : 0
  return {
    s, arm, leg: lg, footVec, pedal, A, B, V, cur, limbLeg: leg, squat, calf,
    seated: d.pose === 'sentado' || d.pose === 'sentado-reclinado',
    horizontal: d.pose === 'tumbado' || d.pose === 'prono',
    vertical: Math.abs(B[1] - A[1]) > Math.abs(B[0] - A[0]),
    frontal, armsFront,
    plane: frontal ? 'frontal' : 'lateral', shoulder: s.shoulder, elbow: arm.mid, wrist: arm.end, hip: s.hip, knee: s.knee, ankle: s.ankle, torsoUp: s.up,
    headTop: s.shoulder[1] + s.up[1] * (SEG.neckVisible + SEG.head), target: armTarget, plantarDeg: ankleA,
    frontalElbowDeg: fv ? Math.abs(signedAngle(uarmV, farmV)) : undefined,
    joints: { knee: reading(knee), elbow: reading(elbow), hip: reading(hipA), shoulder: reading(shoulderA), ankle: reading(ankleA) },
  }
}

export interface JointViolation { joint: JointName; p: number; deg: number; reason: 'hiperextension' | 'fuera-de-rango' | 'salto' }
/** Muestrea el ciclo (p de 0 a 1) y devuelve los movimientos imposibles: fuera de rango, hiperextensión de rodilla/codo o saltos bruscos entre fotogramas. */
export function jointViolations(d: MovementDiagram, steps = 60, maxJump = 25): JointViolation[] {
  const out: JointViolation[] = []
  let prev: RigPose | null = null
  const names: JointName[] = ['knee', 'elbow', 'hip', 'shoulder', 'ankle']
  for (let i = 0; i <= steps; i++) {
    const p = i / steps, pose = poseAt(d, p)
    for (const j of names) {
      const deg = pose.joints[j].deg, [lo, hi] = JOINT_RANGE[j]
      if (deg < lo || deg > hi) out.push({ joint: j, p, deg, reason: (j === 'knee' || j === 'elbow') && deg < lo ? 'hiperextension' : 'fuera-de-rango' })
      if (prev && Math.abs(deg - prev.joints[j].deg) > maxJump) out.push({ joint: j, p, deg, reason: 'salto' })
    }
    prev = pose
  }
  return out
}
