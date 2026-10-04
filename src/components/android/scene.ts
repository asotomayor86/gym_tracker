import { ANDROID, CANVAS, SEG, standingHipY } from '../../lib/rigSpec'
import { MUSCLE_ID_GROUP, MUSCLE_IDS, type MuscleId } from '../../lib/guideTypes'
import type { MuscleGroup } from '../../lib/types'
import { add, mul, nrm, type P, sub, unit } from './geom'
import { band, block, hand, handJ, kneecap, newCtx, type Ctx, type Zone } from './dummy'

/**
 * Escena del maniquí: monta las piezas facetadas (dummy.ts) según la pose del rig y los músculos a resaltar.
 * Devuelve fragmentos SVG: `back` (utillaje y recorrido), `body` (la figura) y `front` (marcas).
 */
export interface Scene { back: string[]; body: string[]; front: string[] }
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

/** Nivel de una zona: principal si alguno de sus ids lo es, secundario si no, ninguno en otro caso. */
const zn = (L: Levels, ids: string[]): Zone => (ids.some((i) => L.prim.has(i)) ? 'p' : ids.some((i) => L.sec.has(i)) ? 's' : null)

const empty = (): Scene => ({ back: [], body: [], front: [] })
const HEAD = 22 // alto visual del casco (el rig usa SEG.head para el límite del lienzo)
const LT_SIDE: P = [0.55, -0.8]
const LT_FRONT: P = [-0.55, -0.8]

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
  id: string; hot: number; levels: Levels
  hip: P; shoulder: P; /** vector unitario hombro→cabeza */ up: P
  knee: P; ankle: P; armMid: P; armEnd: P
  /** dirección de la punta del pie (por defecto, perpendicular a la espinilla) */
  footVec?: P
}
/** Normal «delantera» de un miembro que va hacia abajo (muslo, espinilla, brazo, antebrazo). */
const fnLimb = (a: P, b: P): P => { const t = unit(sub(b, a)); return [t[1], -t[0]] }
/** Normal delantera del tronco (de la cadera al hombro). */
const fnTrunk = (a: P, b: P): P => { const t = unit(sub(b, a)); return [-t[1], t[0]] }

const THS: { fr: [number, number][]; bk: [number, number][] } = {
  fr: [[0, 3.6], [0.08, 5.2], [0.25, 7.8], [0.5, 9.4], [0.8, 8], [1, 7]],
  bk: [[0, 9], [0.1, 9.6], [0.4, 9.4], [0.8, 8], [1, 7]],
}

export function buildSide(o: SideIn): Scene {
  const sc = empty(), cx: Ctx = newCtx(o.id, o.hot, LT_SIDE), L = o.levels
  const { hip, shoulder: sh, up, knee, ankle: A } = o
  const sp = sub(sh, hip), T = (t: number): P => add(hip, mul(sp, t))
  const nT = fnTrunk(hip, sh), nTh = fnLimb(hip, knee), nSh = fnLimb(knee, A)
  const nU = fnLimb(sh, o.armMid), nF = fnLimb(o.armMid, o.armEnd)
  // pie: talón, empeine y puntera sobre una suela oscura; sigue a la espinilla (o al pedal en gemelos)
  const ex = o.footVec ?? unit([A[1] - knee[1], -(A[0] - knee[0])]), ey: P = [-ex[1], ex[0]], nUp: P = mul(ey, -1)
  const F = (x: number, y: number): P => add(A, add(mul(ex, x), mul(ey, y)))
  block(cx, { a: knee, b: A, wa: 6.6, wb: 4.2, n: nSh, zones: [zn(L, ['tib']), null, zn(L, ['gastroc', 'gastrocM', 'soleus'])], cut: 'b' })
  // pie: caña alta (12 px, igual que de frente) que cubre el tobillo, empeine y puntera más bajos, y suela oscura
  block(cx, { a: F(-6, 0), b: F(4.4, 0), wa: 6, c: 1.8, n: nUp, k: 0.3 })
  block(cx, { a: F(3.4, 1.4), b: F(11.4, 1.9), wa: 4.7, wb: 4.2, c: 1.5, n: nUp, k: 0.3 })
  block(cx, { a: F(10.4, 3), b: F(19.8, 3.6), wa: 3.1, wb: 2.6, c: 1.6, n: nUp, k: 0.3 })
  block(cx, { a: F(-5.8, 6.1), b: F(19.6, 6.1), wa: 0.5, c: 0.3, n: nUp, mat: 'dark' })
  band(cx, F(-1, -5.6), ex, 1.4, 4.4)
  // tronco: núcleo oscuro + pelvis, abdomen y pecho
  block(cx, { a: T(-0.02), b: T(1), wa: 3.4, c: 0.6, mat: 'dark', n: nT })
  block(cx, { a: T(-0.16), b: T(0.2), wa: 10.6, wb: 10.8, n: nT, zones: [zn(L, ['tfl']), null, zn(L, ['glute', 'gmed'])], c: 2.6 })
  block(cx, { a: T(0.25), b: T(0.48), wa: 8, wb: 8.4, n: nT, zones: [zn(L, ['rectus', 'oblique']), null, zn(L, ['erector'])], c: 2 })
  block(cx, { a: T(0.52), b: T(1.04), wa: 11.6, wb: 12.4, n: nT, zones: [zn(L, ['pec', 'pecC']), null, zn(L, ['lat', 'trap', 'trapM', 'rhomb', 'teres', 'infra'])], c: 3, cut: 'b' })
  block(cx, { prof: [THS.fr, THS.bk], a: hip, b: add(knee, mul(unit(sub(knee, hip)), 1.6)), wa: 9.2, wb: 7, n: nTh, zones: [zn(L, ['rfem', 'vlat', 'vmed', 'add']), null, zn(L, ['ham', 'hamS'])], c: 2.2 })
  // cuello y casco liso
  block(cx, { a: add(sh, mul(up, 3)), b: add(sh, mul(up, 9.6)), wa: 3.4, c: 0.9, mat: 'dark', n: nT })
  block(cx, { a: add(sh, mul(up, 8)), b: add(sh, mul(up, 8 + HEAD)), wa: 9, c: 2.8, n: nT })
  // brazo: hombrera sobre el brazo, antebrazo y mano
  block(cx, { a: sh, b: o.armMid, wa: 7, wb: 5.6, n: nU, zones: [zn(L, ['biceps', 'brachialis']), null, zn(L, ['triceps'])], c: 1.8 })
  const dz = zn(L, ['dant', 'dlat', 'dpost'])
  block(cx, { a: add(sh, mul(unit(sub(o.armMid, sh)), -2)), b: add(sh, mul(sub(o.armMid, sh), 0.42)), wa: 8, wb: 7.2, n: nU, zones: [dz, dz, dz], c: 2 })
  block(cx, { a: sub(o.armMid, mul(unit(sub(o.armEnd, o.armMid)), 2.2)), b: o.armEnd, wa: 5.2, wb: 3.8, n: nF, zones: [zn(L, ['brachrad', 'fflex']), null, zn(L, ['fext'])], c: 1.6 })
  hand(cx, sub(o.armEnd, unit(sub(o.armEnd, o.armMid))), sub(o.armEnd, o.armMid))
  sc.body = cx.out
  return sc
}

/** Silueta fantasma (pose inicial) de la vista lateral. */
export function ghostSide(o: Pick<SideIn, 'hip' | 'shoulder' | 'up' | 'knee' | 'ankle' | 'armMid' | 'armEnd'>): string {
  const seg = (a: P, b: P, w0: number, w1: number) => {
    const d = unit(sub(b, a)), n = nrm(d)
    return `<polygon points="${[add(a, mul(n, w0)), add(b, mul(n, w1)), sub(b, mul(n, w1)), sub(a, mul(n, w0))].map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke-width=".9" stroke-dasharray="2.2 2.2" stroke-linejoin="round" style="stroke:var(--a-ghost)"/>`
  }
  return seg(o.hip, o.shoulder, 9, 10.5) + seg(o.hip, o.knee, 8, 6) + seg(o.knee, o.ankle, 5.6, 3.4) + seg(o.shoulder, o.armMid, 6, 4.8) + seg(o.armMid, o.armEnd, 4.4, 3.2) +
    seg(add(o.shoulder, mul(o.up, 8)), add(o.shoulder, mul(o.up, 8 + HEAD)), 9, 9)
}

/* ===== Vistas frontal y posterior ===== */
export interface FrontArm { sd: -1 | 1; sh: P; el: P; hand: P }
export interface FrontIn {
  id: string; hot: number; levels: Levels
  back?: boolean
  /** altura de la cadera; el hombro queda TORSO por encima */
  hy: number
  /** separación de la rodilla respecto al eje (sentado/abducción) o undefined = de pie con piernas rectas */
  kneeX?: number
  arms: (sy: number) => FrontArm[]
  cx?: number
}
export const FRONT_CX = 110
export const frontLayout = (seated: boolean) => {
  const hy = seated ? CANVAS.floor - SEG.ankleHeight - SEG.shin : standingHipY()
  return { hy, sy: hy - SEG.torso }
}

const THF: { out: [number, number][]; inn: [number, number][] } = {
  out: [[0, 3.4], [0.07, 5], [0.2, 7.2], [0.42, 9.2], [0.7, 8.4], [1, 7]],
  inn: [[0, 7.2], [0.08, 8.6], [0.3, 9.2], [0.6, 8.4], [1, 7]],
}

export function buildFront(o: FrontIn): Scene {
  const sc = empty(), cx = newCtx(o.id, o.hot, LT_FRONT), L = o.levels
  const mx = o.cx ?? FRONT_CX, back = !!o.back
  const sy = o.hy - SEG.torso
  const P = (x: number, y: number): P => [mx + x, sy + y]
  const N: P = [-1, 0]
  const z3 = (a: Zone, b: Zone, c: Zone): Zone[] => [a, b, c]
  const arms = o.arms(sy)
  // brazos (por debajo del tronco): la articulación del hombro entra por el lateral del pecho
  for (const a of arms) {
    const sd = a.sd, dA = unit(sub(a.el, a.sh)), n1 = nrm(dA), outerIsA = n1[0] * sd > 0
    const zz = (outer: Zone, centre: Zone, inner: Zone): Zone[] => (outerIsA ? [outer, centre, inner] : [inner, centre, outer])
    const tri = zn(L, ['triceps']), bic = zn(L, ['biceps', 'brachialis'])
    block(cx, { a: a.sh, b: a.el, wa: 6.2, wb: 5.2, n: n1, sym: true, zones: back ? zz(tri, tri, null) : zz(null, bic, null), c: 1.8 })
    const fd = unit(sub(a.hand, a.el)), n2 = nrm(fd)
    block(cx, { a: a.el, b: a.hand, wa: 5, wb: 3.8, n: n2, sym: true, c: 1.6, zones: back ? [null, zn(L, ['fext']), null] : [null, zn(L, ['brachrad', 'fflex']), null] })
    if (!back) band(cx, a.el, dA, 4.6, 3.4, true)
    else band(cx, a.el, dA, 4.4, 0.7, true) // articulación trasera: línea oscura muy fina
    handJ(cx, a.hand, sub(a.hand, a.el), [mx, a.hand[1]], back ? 6.4 : 9.4)
  }
  for (const sd of [-1, 1] as const) block(cx, { a: P(sd * 18.4, 0.5), b: P(sd * 18.4, 14.5), wa: 3.4, c: 1.1, mat: 'dark', n: N, sym: true })
  // piernas
  for (const sd of [-1, 1] as const) {
    const hip = P(sd * 8.6, SEG.torso)
    const seated = o.kneeX !== undefined
    const knee: P = seated ? [mx + sd * o.kneeX!, o.hy + 3] : P(sd * 10.8, SEG.torso + SEG.thigh)
    const ank: P = seated ? [mx + sd * (o.kneeX! + 2), CANVAS.floor - SEG.ankleHeight] : [mx + sd * 11.2, CANVAS.floor - SEG.ankleHeight]
    const nT = nrm(unit(sub(knee, hip))), nS = nrm(unit(sub(ank, knee)))
    const outerT = nT[0] * sd > 0, outerS = nS[0] * sd > 0
    const zt = (outer: Zone, centre: Zone, inner: Zone): Zone[] => (outerT ? [outer, centre, inner] : [inner, centre, outer])
    const zs = (outer: Zone, centre: Zone, inner: Zone): Zone[] => (outerS ? [outer, centre, inner] : [inner, centre, outer])
    const fx = ank[0] + sd * 0.9, fy = ank[1]
    block(cx, { a: knee, b: ank, wa: 6.6, wb: 4.2, n: nS, sym: true, c: 2, zones: back ? zs(zn(L, ['gastroc']), zn(L, ['soleus']), zn(L, ['gastrocM'])) : zs(zn(L, ['tib']), zn(L, ['tib']), null) })
    // pie de 12 px de alto, nunca más ancho que la pantorrilla (±6,6)
    block(cx, { a: [ank[0], fy - 12], b: [fx, fy - 1], wa: 4.6, wb: 5.8, c: 2.4, n: N, sym: true, k: 0.34 })
    block(cx, { a: [fx, fy - 0.6], b: [fx, fy + 0.3], wa: 5.9, c: 0.4, n: N, mat: 'dark', sym: true })
    band(cx, [ank[0], fy - 11], [0, 1], 4.5, 0.8, true)
    block(cx, {
      prof: outerT ? [THF.out, THF.inn] : [THF.inn, THF.out], a: hip, b: knee, wa: 9.2, wb: 7, n: nT, sym: true, c: 2.2,
      zones: back ? zt(zn(L, ['ham']), zn(L, ['ham', 'hamS']), zn(L, ['hamS'])) : zt(zn(L, ['vlat']), zn(L, ['rfem']), zn(L, ['vmed', 'add'])),
    })
    if (!back) kneecap(cx, knee, sub(ank, hip), 0, N)
    else band(cx, knee, sub(ank, hip), 5.4, 0.7, true)
  }
  // tronco
  const gm = zn(L, ['gmed']), gl = zn(L, ['glute']), tf = zn(L, ['tfl', 'gmed'])
  block(cx, { a: P(0, 51), b: P(0, 33), wa: 9.6, wb: 13.4, n: N, sym: true, c: 2.6, zones: back ? z3(gm, gl, gm) : z3(tf, null, tf) })
  const obl = zn(L, ['oblique', 'serr', 'serr0', 'serr1', 'serr2', 'serr3']), er = zn(L, ['erector'])
  block(cx, { a: P(0, 33.4), b: P(0, 23.4), wa: 7.8, wb: 8.8, n: N, sym: true, c: 1.6, zones: back ? z3(null, er, null) : z3(obl, zn(L, ['rectus', 'rectus0', 'rectus1']), obl) })
  if (!back) block(cx, { a: P(0, 46.2), b: P(0, 34), wa: 6.6, wb: 7.8, n: N, sym: true, c: 1.8, zones: z3(obl, zn(L, ['rectus', 'rectus2', 'rectus3']), obl) })
  // pecho: dos mitades separadas por un canal oscuro (frente, con franja exterior e interior); una pieza de dos zonas en la espalda
  const pO = zn(L, ['pec']), pI = zn(L, ['pec', 'pecC'])
  const sc2 = zn(L, ['trap', 'trapM', 'rhomb', 'teres', 'infra', 'lat'])
  if (back) {
    block(cx, { a: P(0, 23), b: P(0, -2), wa: 12.4, wb: 16.2, n: N, sym: true, c: 3, zones: [sc2, sc2], tn: [1, 1] })
  } else {
    block(cx, { a: P(0, 24), b: P(0, -3), wa: 1.7, c: 0.6, mat: 'dark', n: N, sym: true })
    for (const sd of [-1, 1] as const) block(cx, { a: P(sd * 6.7, 23), b: P(sd * 8.6, -2), wa: 5.8, wb: 7.7, n: N, sym: true, c: 3, zones: sd < 0 ? [pO, pI] : [pI, pO], tn: sd < 0 ? [1, 0] : [0, 1] })
  }
  // cuello y casco liso (de frente, con dos ojos)
  block(cx, { a: P(0, -3), b: P(0, -9), wa: 3.4, c: 0.9, mat: 'dark', n: N, sym: true })
  block(cx, { a: P(0, -6), b: P(0, -(6 + HEAD)), wa: 8.2, c: 2.6, n: N, sym: true, k: 0.5 })
  if (!back) for (const sd of [-1, 1]) cx.out.push(`<rect x="${(mx + sd * 3.6 - 1.3).toFixed(1)}" y="${(sy - 6 - HEAD * 0.62).toFixed(1)}" width="2.6" height="3.4" rx=".6" style="fill:var(--a-d2)"/>`)
  // hombreras: bloque exterior sobre la articulación, sin pisar el pecho
  const dz = zn(L, back ? ['dpost', 'dlat'] : ['dant', 'dlat'])
  for (const a of arms) {
    block(cx, { a: add(a.sh, [a.sd * 1, -11]), b: add(a.sh, [a.sd * 1.5, 5.5]), wa: 6, wb: 5.8, n: N, sym: true, c: 2.2, zones: [dz, dz, dz] })
  }
  if (!back) cx.out.push(`<rect x="${(mx - 3).toFixed(1)}" y="${(sy + 5).toFixed(1)}" width="6" height="5" fill="none" stroke-width=".6" stroke-opacity=".6" style="stroke:var(--a-edge)"/>`)
  sc.body = cx.out
  return sc
}

/** Brazos simétricos en vista frontal: `theta` = ángulo del brazo respecto a la vertical, `th2` = del antebrazo (rad). */
export const armsAt = (theta: number, th2: number) => (sy: number): FrontArm[] =>
  ([-1, 1] as const).map((sd) => {
    const sh: P = [FRONT_CX + sd * ANDROID.shoulderHalf, sy + 9]
    const el = add(sh, [sd * Math.sin(theta) * SEG.uarm, Math.cos(theta) * SEG.uarm])
    const hand = add(el, [sd * Math.sin(th2) * SEG.farm, Math.cos(th2) * SEG.farm])
    return { sd, sh, el, hand }
  })
