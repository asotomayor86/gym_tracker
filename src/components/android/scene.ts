import { ANDROID, CANVAS, SEG, standingHipY } from '../../lib/rigSpec'
import { MUSCLE_ID_GROUP, MUSCLE_IDS, type MuscleId } from '../../lib/guideTypes'
import type { MuscleGroup } from '../../lib/types'
import {
  add, ellipse, type P, place, seg, type Seg, unit, mix,
} from './geom'
import * as S from './shapes'

/**
 * Descripción de la escena del androide: masas interiores, placas (carcasa + músculos) y articulaciones.
 * Es independiente del estilo de dibujo; el renderizador (render.ts) la convierte en SVG.
 */
export type Lvl = 'p' | 's' | 'n'
export type PlateKind = 'shell' | 'plate' | 'helmet' | 'visor' | 'fist' | 'foot'
export interface Plate { id: string; k: PlateKind; pts: P[]; fib: P[][]; lvl: Lvl }
export interface Scene {
  /** viewBox: x, y, w, h */
  box: [number, number, number, number]
  masses: P[][]
  plates: Plate[]
  joints: { p: P; r: number }[]
  axes: [P, P][]
  /** Fragmentos SVG: `back` va bajo la figura (utillaje, trayectoria), `front` encima (marcas). */
  back: string[]
  front: string[]
}

export interface Levels { prim: ReadonlySet<string>; sec: ReadonlySet<string> }

/** Ids concretos a partir de grupos (respaldo cuando la ficha no trae muscleIds). */
export function idsFromGroups(groups: readonly MuscleGroup[]): string[] {
  const out: string[] = []
  for (const id of MUSCLE_IDS) {
    const g = MUSCLE_ID_GROUP[id as MuscleId]
    if (g && groups.includes(g)) out.push(id)
  }
  return out
}

/** En vista lateral algunos músculos no tienen placa propia: se ilumina la más cercana. */
const LATERAL_ALIAS: Record<string, string[]> = {
  trapM: ['rhomb'], teres: ['infra'], brachrad: ['fflex'], vmed: ['add'], ham: ['hamS'], gastroc: ['gastrocM'],
}
const FAMILY = (id: string): string | null =>
  /^(rectus|serr)\d$/.test(id) ? id.slice(0, -1) : id === 'hamS' ? 'ham' : id === 'gastrocM' ? 'gastroc' : null

export function lvlOf(L: Levels, id: string, lateral = false): Lvl {
  const c = [id]
  const fam = FAMILY(id)
  if (fam) c.push(fam)
  if (lateral && LATERAL_ALIAS[id]) c.push(...LATERAL_ALIAS[id])
  if (c.some((x) => L.prim.has(x))) return 'p'
  if (c.some((x) => L.sec.has(x))) return 's'
  return 'n'
}

const empty = (box: Scene['box']): Scene => ({ box, masses: [], plates: [], joints: [], axes: [], back: [], front: [] })
const CANVAS_BOX: Scene['box'] = [0, 0, CANVAS.w, CANVAS.h]

/** Región muscular: banda entre dos posiciones relativas (-1 cara posterior … +1 cara anterior) a lo largo de un segmento. */
export function region(sg: Seg, t0: number, t1: number, s0: number, s1: number, o: { pk?: number; pw?: number; floor?: number } = {}) {
  const N = 9, pk = o.pk ?? 0.5, pw = o.pw ?? 0.75, fl = o.floor ?? 0
  const e = Math.log(0.5) / Math.log(pk)
  const bul = (k: number) => fl + (1 - fl) * Math.pow(Math.sin(Math.PI * Math.pow(k, e)), pw)
  const mid = (s0 + s1) / 2, half = (s1 - s0) / 2
  const A: P[] = [], B: P[] = []
  for (let i = 0; i <= N; i++) {
    const k = i / N, t = t0 + (t1 - t0) * k, b = bul(k)
    A.push(sg.edge(t, mid + half * b)); B.push(sg.edge(t, mid - half * b))
  }
  const fib = [0.22, 0.5, 0.78].map((q) => {
    const L: P[] = []
    for (let i = 0; i <= N; i++) {
      const k = i / N, t = t0 + (t1 - t0) * k
      L.push(sg.edge(t, mid + half * bul(k) * (2 * q - 1)))
    }
    return L
  })
  return { pts: [...A, ...B.reverse()], fib }
}
type Built = { pts: P[]; fib?: P[][] }
/** Abanico: fibras que convergen desde varios orígenes a un punto de inserción. */
function fan(origins: P[], ins: P, bow: number): P[][] {
  return origins.map((o) => {
    const m = mix(o, ins, 0.5), d = unit([ins[0] - o[0], ins[1] - o[1]])
    return [o, [m[0] - d[1] * bow, m[1] + d[0] * bow] as P, ins]
  })
}

function plateAdder(sc: Scene, L: Levels, lateral: boolean) {
  return (id: string, b: Built) => { sc.plates.push({ id, k: 'plate', pts: b.pts, fib: b.fib ?? [], lvl: lvlOf(L, id, lateral) }) }
}
const shellOf = (sg: Seg, t0: number, t1: number, pw = 0.3): Plate => ({ id: 'shell', k: 'shell', pts: region(sg, t0, t1, -0.96, 0.96, { pk: 0.5, pw }).pts, fib: [], lvl: 'n' })
const extra = (id: string, k: PlateKind, pts: P[]): Plate => ({ id, k, pts, fib: [], lvl: 'n' })

/** Utillaje: líneas redondeadas, anillos, cuerdas y sombra, con colores del tema por variables CSS. */
export const bits = {
  shadow: (x: number, y: number, w: number, gid: string) => `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="5.5" fill="url(#${gid}-sh)"/>`,
  line: (a: P, b: P, w: number) => {
    const c = (n: number) => n.toFixed(1)
    return `<line x1="${c(a[0])}" y1="${c(a[1])}" x2="${c(b[0])}" y2="${c(b[1])}" stroke-width="${w}" stroke-linecap="round" style="stroke:var(--a-pad)"/>` +
      `<line x1="${c(a[0])}" y1="${c(a[1])}" x2="${c(b[0])}" y2="${c(b[1])}" stroke-opacity=".5" stroke-width="${(w * 0.3).toFixed(1)}" stroke-linecap="round" transform="translate(-1.3,-1.3)" style="stroke:var(--a-pad-hi)"/>`
  },
  ring: (c: P, r: number) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${r}" fill="none" stroke-width="2" style="stroke:var(--a-guide)"/>`,
  rope: (a: P, b: P) => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke-width="1" stroke-dasharray="3 2" style="stroke:var(--a-guide)"/>`,
  dot: (c: P, r: number) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${r}" style="fill:var(--a-pad-hi)"/>`,
}

/* ===== Vista lateral ===== */
export interface SideIn {
  hip: P; shoulder: P; /** vector unitario hombro→cabeza */ up: P
  knee: P; ankle: P; armMid: P; armEnd: P
  /** dirección de la punta del pie (por defecto, perpendicular a la espinilla) */
  footVec?: P
  levels: Levels
}
export function buildSide(o: SideIn): Scene {
  const sc = empty(CANVAS_BOX)
  const { hip, shoulder, up, knee, ankle } = o
  const torso = seg(hip, shoulder, S.NP.torso, -1)
  const neck = seg(shoulder, add(shoulder, [up[0] * ANDROID.neck, up[1] * ANDROID.neck]), S.NP.neck, -1)
  const thigh = seg(hip, knee, S.NP.thigh), shin = seg(knee, ankle, S.NP.shin)
  const uarm = seg(shoulder, o.armMid, S.NP.uarm), farm = seg(o.armMid, o.armEnd, S.NP.farm)
  const hc = add(shoulder, [up[0] * ANDROID.headCenter, up[1] * ANDROID.headCenter])
  for (const s of [thigh, shin, torso, neck, uarm, farm]) sc.masses.push(s.outline)
  sc.plates.push(shellOf(torso, -0.2, 1.0, 0.28), shellOf(uarm, 0.12, 0.9), shellOf(farm, 0.1, 0.92), shellOf(thigh, 0.08, 0.92), shellOf(shin, 0.08, 0.92))
  const f0 = o.footVec ?? shin.f, sole: P = [-f0[1], f0[0]]
  const hd = unit([o.armEnd[0] - o.armMid[0], o.armEnd[1] - o.armMid[1]])
  const foot = place(ankle, f0, sole, S.FOOT_P), fist = place(o.armEnd, hd, farm.f, S.FIST_P), helmet = place(hc, neck.f, up, S.HELMET_P)
  sc.masses.push(foot, fist, place(o.armEnd, hd, farm.f, S.THUMB_P), helmet,
    ellipse(shoulder[0], shoulder[1], S.SHOULDER.rx, S.SHOULDER.ry), ellipse(o.armMid[0], o.armMid[1], 3.9, 3.9), ellipse(o.armEnd[0], o.armEnd[1], 2.7, 2.7),
    ellipse(hip[0], hip[1], S.HIP.rx, S.HIP.ry, 0), ellipse(knee[0], knee[1], 5.2, 5.2), ellipse(ankle[0], ankle[1], 3.4, 3.4))
  sc.joints.push({ p: shoulder, r: 6.6 }, { p: o.armMid, r: 4.8 }, { p: o.armEnd, r: 3.2 }, { p: hip, r: 7.6 }, { p: knee, r: 6 }, { p: ankle, r: 4 })
  sc.axes.push([hip, shoulder], [shoulder, o.armMid], [o.armMid, o.armEnd], [hip, knee], [knee, ankle])

  const m = plateAdder(sc, o.levels, true)
  const t = torso, u = uarm, fa = farm, th = thigh, sh = shin
  const ins = u.edge(0.34, 0.5)
  m('pec', { pts: [t.edge(0.6, 0.92), t.edge(0.78, 1), t.edge(0.88, 0.95), u.edge(0.34, 0.6), u.edge(0.4, 0.7), u.edge(0.4, 0.05), t.edge(0.7, 0.15)], fib: fan([t.edge(0.6, 0.85), t.edge(0.68, 0.9), t.edge(0.76, 0.92)], ins, 1.4) })
  m('pecC', { pts: [t.edge(0.86, 0.92), t.edge(0.97, 0.9), u.edge(0.28, 0.9), u.edge(0.34, 0.6)], fib: fan([t.edge(0.88, 0.88), t.edge(0.94, 0.86)], ins, 0.8) })
  m('trap', region(t, 0.8, 1.1, -1, -0.2, { pk: 0.5 }))
  m('trapM', region(t, 0.28, 0.66, -0.95, -0.5, { pk: 0.45 }))
  m('lat', { pts: [t.edge(0.06, -0.9), t.edge(0.3, -1), t.edge(0.6, -0.95), t.edge(0.82, -0.6), u.edge(0.2, -0.1), u.edge(0.32, -0.1), u.edge(0.32, -0.7), t.edge(0.62, -0.35), t.edge(0.3, -0.4)], fib: fan([t.edge(0.1, -0.8), t.edge(0.3, -0.9), t.edge(0.55, -0.85)], u.edge(0.26, -0.3), 1.0) })
  m('teres', region(t, 0.74, 0.92, -0.9, -0.5, { pk: 0.5 }))
  m('erector', region(t, 0.0, 0.7, -0.95, -0.45, { pk: 0.5 }))
  m('glute', region(t, -0.2, 0.16, -1, -0.02, { pk: 0.4 }))
  m('gmed', region(t, -0.16, 0.16, -0.4, 0.25, { pk: 0.5 }))
  m('oblique', region(t, 0.1, 0.56, -0.25, 0.6, { pk: 0.55 }))
  m('rectus', region(t, 0.05, 0.56, 0.55, 1.0, { pk: 0.5, pw: 0.5 }))
  for (let j = 0; j < 3; j++) m('serr' + j, region(t, 0.5 + 0.08 * j, 0.59 + 0.08 * j, 0.3, 1.0, { pk: 0.5 }))
  m('dant', region(u, -0.05, 0.5, 0.1, 1, { pk: 0.35 }))
  m('dlat', region(u, -0.05, 0.55, -0.45, 0.45, { pk: 0.4 }))
  m('dpost', region(u, -0.05, 0.5, -1, -0.15, { pk: 0.35 }))
  m('biceps', region(u, 0.22, 0.85, 0.1, 0.95, { pk: 0.55 }))
  m('triceps', region(u, 0.15, 0.92, -0.95, -0.1, { pk: 0.5 }))
  m('brachialis', region(u, 0.45, 0.92, -0.35, 0.4, { pk: 0.5 }))
  m('brachrad', region(fa, -0.02, 0.55, 0.1, 0.95, { pk: 0.3 }))
  m('fext', region(fa, 0, 0.55, -0.95, -0.1, { pk: 0.3 }))
  m('rfem', region(th, 0.1, 0.95, 0.15, 0.95, { pk: 0.45 }))
  m('tfl', region(th, -0.05, 0.3, 0.1, 0.8, { pk: 0.4 }))
  m('vlat', region(th, 0.28, 0.98, -0.55, 0.35, { pk: 0.55 }))
  m('vmed', region(th, 0.6, 1.0, 0.2, 0.85, { pk: 0.72 }))
  m('ham', region(th, 0.18, 0.9, -0.95, -0.1, { pk: 0.45 }))
  m('gastroc', region(sh, 0.03, 0.52, -0.95, -0.1, { pk: 0.28 }))
  m('soleus', region(sh, 0.38, 0.82, -0.8, -0.2, { pk: 0.45 }))
  m('tib', region(sh, 0.12, 0.82, 0.15, 0.9, { pk: 0.4 }))
  sc.plates.push(
    extra('helmet', 'helmet', helmet), extra('visor', 'visor', place(hc, neck.f, up, S.VISOR_P)), extra('fist', 'fist', fist), extra('foot', 'foot', foot),
    extra('pelvis', 'plate', region(torso, -0.3, 0.14, -0.92, 0.9, { pk: 0.5, pw: 0.4 }).pts), extra('collar', 'plate', region(torso, 0.92, 1.12, -0.8, 0.8, { pk: 0.5, pw: 0.5 }).pts),
  )
  return sc
}

/* ===== Vistas frontal y posterior ===== */
export interface FrontArm { sd: -1 | 1; sh: P; el: P; hand: P }
export interface FrontIn {
  back?: boolean
  /** altura de la cadera; el hombro queda TORSO por encima */
  hy: number
  /** separación de la rodilla respecto al eje (sentado/abducción) o undefined = de pie con piernas rectas */
  kneeX?: number
  arms: (sy: number) => FrontArm[]
  levels: Levels
  cx?: number
}
export const FRONT_CX = 110
export const frontLayout = (seated: boolean) => {
  const hy = seated ? CANVAS.floor - SEG.ankleHeight - SEG.shin : standingHipY()
  return { hy, sy: hy - SEG.torso }
}

export function buildFront(o: FrontIn): Scene {
  const sc = empty(CANVAS_BOX)
  const cx = o.cx ?? FRONT_CX, back = !!o.back
  const ankleY = CANVAS.floor - SEG.ankleHeight, hy = o.hy, sy = hy - SEG.torso
  const R = (dx: number, dy: number): P => [cx + dx * S.kx(dy), sy + dy * S.KY]
  const half = S.TORSO_REL.map((q): P => [q[0], sy + q[1]])
  const torsoPoly: P[] = [...half.map((q): P => [cx + q[0], q[1]]), ...half.slice().reverse().map((q): P => [cx - q[0], q[1]])]
  sc.masses.push(torsoPoly)
  sc.plates.push({ id: 'shell', k: 'shell', fib: [], lvl: 'n', pts: torsoPoly.filter((q) => q[1] > sy - 1).map((q): P => [cx + (q[0] - cx) * 0.94, sy + (q[1] - sy) * 0.96 + 1]) })
  sc.masses.push(seg([cx, sy - 12], [cx, sy + 2], S.NP.neck).outline)
  const hcy = sy - ANDROID.headCenter
  sc.masses.push(place([cx, hcy], [1, 0], [0, 1], S.HELMET_FR))
  for (const sd of [-1, 1]) sc.masses.push(ellipse(cx + sd * 7.6 * S.HS, hcy + 0.5, 1.9 * S.HS, 3 * S.HS, 0, 8))
  const arms = o.arms(sy).map((a) => ({ ...a, ua: seg(a.sh, a.el, S.NP.uarmFr, a.sd), fa: seg(a.el, a.hand, S.NP.farmFr, a.sd) }))
  const fistOf = (a: FrontArm) => {
    const d = unit([a.hand[0] - a.el[0], a.hand[1] - a.el[1]])
    return place(a.hand, d, [-d[1], d[0]], S.FIST_P.map((q): P => [q[0], q[1] * a.sd]))
  }
  for (const a of arms) {
    sc.masses.push(ellipse(a.sh[0], a.sh[1] + 1, S.SHOULDER.rx + 0.2, S.SHOULDER.ry + 1, 0), a.ua.outline, a.fa.outline, ellipse(a.el[0], a.el[1], 3.8, 3.8), fistOf(a))
    sc.plates.push(shellOf(a.ua, 0.14, 0.9), shellOf(a.fa, 0.1, 0.92))
  }
  const kneeX = o.kneeX
  const legs = ([-1, 1] as const).map((sd) => {
    const hipP: P = [cx + sd * S.HIP.x, hy]
    const kneeP: P = kneeX === undefined ? [cx + sd * 8.8, hy + SEG.thigh * 0.995] : [cx + sd * kneeX, hy + 3]
    const ankP: P = kneeX === undefined ? [cx + sd * 8.2, ankleY] : [cx + sd * (kneeX + 2), ankleY]
    const L = { sd, thigh: seg(hipP, kneeP, S.NP.thighFr, sd), shin: seg(kneeP, ankP, S.NP.shinFr, sd), hipP, kneeP, ankP }
    sc.masses.push(L.thigh.outline, L.shin.outline, ellipse(hipP[0], hipP[1], S.HIP.rx - 0.6, S.HIP.ry - 1), ellipse(kneeP[0], kneeP[1], 5, 5.2), ellipse(ankP[0], ankP[1], 3.2, 3.2))
    sc.plates.push(shellOf(L.thigh, 0.08, 0.92), shellOf(L.shin, 0.08, 0.92))
    const ax = ankP[0], fy = CANVAS.floor
    sc.masses.push([[ax - 3.4, ankP[1] - 1], [ax + 3.4, ankP[1] - 1], [ax + 5.4, fy - 3], [ax + 6.2 * sd + 0.8, fy], [ax - 6.2 * sd - 0.8, fy], [ax - 5.4, fy - 3]])
    return L
  })
  for (const a of arms) {
    sc.joints.push({ p: a.sh, r: 7.4 }, { p: a.el, r: 4.8 }, { p: a.hand, r: 3.4 })
    sc.axes.push([a.sh, a.el], [a.el, a.hand])
  }
  for (const L of legs) {
    sc.joints.push({ p: L.hipP, r: 6.8 }, { p: L.kneeP, r: 6 }, { p: L.ankP, r: 4 })
    sc.axes.push([L.hipP, L.kneeP], [L.kneeP, L.ankP])
  }
  sc.axes.push([R(0, -10), R(0, 70)])
  const m = plateAdder(sc, o.levels, false)
  const poly2 = (rel: P[], sd: number): P[] => rel.map((q) => R(sd * q[0], q[1]))
  for (const sd of [-1, 1] as const) {
    const a = arms[sd < 0 ? 0 : 1], L = legs[sd < 0 ? 0 : 1]
    if (!back) {
      m('pec', { pts: poly2([[1.0, 6.5], [5.5, 5.4], [11, 5.6], [15.6, 8], [17, 12.5], [15.4, 18], [10.5, 21.5], [5.5, 21], [1.4, 17.5]], sd), fib: fan([R(sd * 1.5, 8), R(sd * 1.5, 11.5), R(sd * 1.5, 15), R(sd * 1.5, 18.5)], R(sd * 16.6, 11.4), 1.1) })
      m('trap', { pts: poly2([[5.4, -7.5], [11, -2.6], [17.5, 1.2], [15, 4], [9.4, 5.2], [5.8, 2.2]], sd) })
      for (let j = 0; j < 4; j++) {
        const c = R(sd * (14.4 - 0.6 * j), 24 + 5 * j)
        m('serr' + j, { pts: ellipse(c[0], c[1], 2.2 * S.kx(24 + 5 * j), 3.2 * S.KY, 0.3 * sd, 8) })
      }
      for (let j = 0; j < 4; j++) {
        const y0 = 24 + 6 * j, x1 = 6.6 - 0.45 * j
        m('rectus' + j, { pts: poly2([[1.2, y0], [x1 - 0.2, y0 + 0.4], [x1, y0 + 5.2], [1.2, y0 + 5.6]], sd) })
      }
      m('oblique', { pts: poly2([[7.4, 23], [12.6, 21], [13.6, 30], [13.8, 42], [11.6, 52], [7.6, 46], [8.6, 34]], sd), fib: [[R(sd * 8, 26), R(sd * 11, 34), R(sd * 11.6, 46)], [R(sd * 10, 24), R(sd * 12.4, 34), R(sd * 13, 44)]] })
      m('dlat', region(a.ua, -0.1, 0.55, 0.15, 1, { pk: 0.4 }))
      m('dant', region(a.ua, -0.1, 0.5, -0.95, 0.25, { pk: 0.4 }))
      m('biceps', region(a.ua, 0.22, 0.85, -0.5, 0.55, { pk: 0.55 }))
      m('brachrad', region(a.fa, 0.02, 0.55, 0.1, 0.95, { pk: 0.3 }))
      m('fflex', region(a.fa, 0.02, 0.5, -0.9, 0.05, { pk: 0.3 }))
      m('rfem', region(L.thigh, 0.1, 0.92, -0.35, 0.35, { pk: 0.5 }))
      m('vlat', region(L.thigh, 0.2, 0.95, 0.3, 1.0, { pk: 0.5 }))
      m('vmed', region(L.thigh, 0.62, 1.02, -1, -0.15, { pk: 0.78 }))
      m('add', region(L.thigh, 0.05, 0.62, -1, -0.55, { pk: 0.4 }))
      m('tib', region(L.shin, 0.08, 0.8, -0.7, 0.35, { pk: 0.4 }))
      m('tfl', region(L.thigh, 0.0, 0.3, 0.45, 1.0, { pk: 0.4 }))
      m('gmed', { pts: poly2([[13.2, 47], [16.6, 51], [15.8, 58], [12, 56]], sd) })
    } else {
      m('trap', { pts: poly2([[0, -8.5], [5.2, -6.5], [11, -2], [18, 1.8], [12, 5], [6, 3], [0, 2]], sd), fib: [[R(sd * 1, -6), R(sd * 6, 0), R(sd * 14, 1)]] })
      m('trapM', { pts: poly2([[0, 3], [6.4, 3.6], [12, 5.4], [13, 10], [8, 20], [3.6, 32], [0, 38]], sd), fib: [[R(sd * 1, 4), R(sd * 6, 12), R(sd * 12, 6)], [R(sd * 1, 24), R(sd * 4, 18), R(sd * 11, 8)]] })
      m('rhomb', { pts: poly2([[2.2, 12], [8.2, 9.6], [10.4, 19], [4, 23]], sd), fib: [[R(sd * 2.6, 14), R(sd * 6, 14.6), R(sd * 9, 12)]] })
      m('teres', { pts: poly2([[11, 15], [16, 16], [16.4, 21], [12.4, 20.4]], sd) })
      m('infra', { pts: poly2([[8, 6], [15.5, 7], [16.5, 13], [12, 17.5], [8.5, 14]], sd) })
      m('lat', { pts: poly2([[14.8, 16], [15, 26], [12.6, 38], [7, 48], [1.6, 48], [2, 34], [6, 24], [10, 18]], sd), fib: [[R(sd * 2, 46), R(sd * 8, 30), R(sd * 15, 17)], [R(sd * 4, 44), R(sd * 10, 30), R(sd * 14.4, 22)]] })
      m('erector', { pts: poly2([[1.2, 14], [4.8, 14], [5.2, 48], [1.2, 50]], sd) })
      m('dpost', region(a.ua, -0.12, 0.5, -1, 0.5, { pk: 0.35 }))
      m('triceps', region(a.ua, 0.12, 0.9, -0.6, 0.65, { pk: 0.5 }))
      m('fext', region(a.fa, 0.02, 0.5, -0.8, 0.8, { pk: 0.3 }))
      m('glute', { pts: poly2([[0.8, 50], [8, 47], [15.2, 52], [16, 62], [10, 68], [1, 66]], sd), fib: [[R(sd * 1, 62), R(sd * 8, 56), R(sd * 15, 52)]] })
      m('gmed', { pts: poly2([[9, 44], [15.5, 47], [15.8, 52], [10, 52]], sd) })
      m('ham', region(L.thigh, 0.2, 0.9, 0.05, 0.95, { pk: 0.45 }))
      m('hamS', region(L.thigh, 0.2, 0.9, -0.95, -0.05, { pk: 0.45 }))
      m('gastroc', region(L.shin, 0.04, 0.5, 0.0, 0.95, { pk: 0.3 }))
      m('gastrocM', region(L.shin, 0.04, 0.5, -0.95, 0.0, { pk: 0.3 }))
      m('soleus', region(L.shin, 0.38, 0.84, -0.7, 0.7, { pk: 0.5 }))
    }
  }
  sc.plates.push(
    extra('helmet', 'helmet', place([cx, hcy], [1, 0], [0, 1], S.HELMET_FR)),
    extra('visor', 'visor', place([cx, hcy], [1, 0], [0, 1], back ? [] : S.VISOR_FR)),
    extra('collar', 'plate', [R(-9, -3), R(-5, -6), R(5, -6), R(9, -3), R(7, 1), R(0, 3.6), R(-7, 1)]),
    extra('pelvis', 'plate', [R(-12.5, 46), R(12.5, 46), R(13.5, 54), R(8, 63), R(0, 68), R(-8, 63), R(-13.5, 54)]),
  )
  for (const a of arms) sc.plates.push(extra('fist', 'fist', fistOf(a)))
  for (const L of legs) {
    const ax = L.ankP[0], fy = CANVAS.floor
    sc.plates.push(extra('foot', 'foot', [[ax - 3.6, L.ankP[1] - 1], [ax + 3.6, L.ankP[1] - 1], [ax + 5.8, fy - 3], [ax + 6.6 * L.sd + 0.8, fy], [ax - 6.6 * L.sd - 0.8, fy], [ax - 5.8, fy - 3]]))
  }
  return sc
}

/** Brazos simétricos en vista frontal: `theta` = ángulo del brazo respecto a la vertical, `th2` = del antebrazo (rad). */
export const armsAt = (theta: number, th2: number) => (sy: number): FrontArm[] =>
  ([-1, 1] as const).map((sd) => {
    const sh: P = [FRONT_CX + sd * ANDROID.shoulderHalf, sy + 2]
    const el = add(sh, [sd * Math.sin(theta) * SEG.uarm, Math.cos(theta) * SEG.uarm])
    const hand = add(el, [sd * Math.sin(th2) * SEG.farm, Math.cos(th2) * SEG.farm])
    return { sd, sh, el, hand }
  })
