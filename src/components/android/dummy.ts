import { add, dot, f1, mix, mul, nrm, type P, sub, unit } from './geom'

/**
 * Maniquí articulado facetado: cada pieza es un prisma biselado de tres franjas (luz, centro, sombra) en blanco,
 * con articulaciones en gris oscuro. Las franjas son además las zonas del músculo: relleno ámbar = principal,
 * borde ámbar = secundario. Los colores salen de variables CSS (--a-*), así que sirve en tema claro y oscuro.
 */
export type Zone = 'p' | 's' | null
export type Mat = 'white' | 'dark'
export interface Ctx {
  /** Prefijo único de la figura (ids de recortes). */
  id: string
  /** 0..1: intensidad del ámbar en las zonas principales. */
  hot: number
  /** Luz (vector hacia la fuente) para el sombreado de las caras. */
  lt: P
  out: string[]
  n: number
}
export const newCtx = (id: string, hot: number, lt: P): Ctx => ({ id, hot, lt, out: [], n: 0 })

const MAT: Record<Mat, string[]> = {
  white: ['var(--a-w0)', 'var(--a-w1)', 'var(--a-w2)'],
  dark: ['var(--a-d0)', 'var(--a-d1)', 'var(--a-d2)'],
}
const AMBER = ['#ffe08a', '#ffb000', '#b36b00']
const pts = (a: P[]) => a.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ')

function toneOf(n: P, lt: P): number {
  const t = dot(n, lt) / (Math.hypot(lt[0], lt[1]) || 1)
  return t > 0.28 ? 0 : t < -0.28 ? 2 : 1
}
function interp(arr: [number, number][], t: number): number {
  if (t <= arr[0][0]) return arr[0][1]
  for (let i = 1; i < arr.length; i++) if (t <= arr[i][0]) { const p0 = arr[i - 1], p1 = arr[i]; return p0[1] + ((p1[1] - p0[1]) * (t - p0[0])) / (p1[0] - p0[0] || 1) }
  return arr[arr.length - 1][1]
}

export interface BlockOpts {
  a: P; b: P
  /** Semianchos en a y en b. */
  wa: number; wb?: number
  /** Chaflán de los extremos. */
  c?: number
  /** Normal del lado «A» (el que recibe la luz de frente). */
  n?: P
  mat?: Mat
  /** Zonas musculares: 2, 3 o 4 franjas, empezando por el lado +n. */
  zones?: Zone[]
  /** Reparto del ancho de la franja central. */
  k?: number
  /** Tonos forzados (simétrico) en vez de calcularlos con la luz. */
  sym?: boolean
  tn?: number[]
  /** Perfil de semiancho por lado: [lado +n, lado −n] como [t, w][]. */
  prof?: [[number, number][], [number, number][]]
  /** Bisel diagonal en un extremo. */
  cut?: 'a' | 'b'
}

export function block(cx: Ctx, o: BlockOpts): void {
  const { a, b, wa } = o
  const wb = o.wb ?? wa, c = o.c ?? 2, k = o.k ?? 0.38
  const d = unit(sub(b, a)), n = o.n ?? nrm(d), lt = cx.lt
  const ea = add(a, mul(d, c)), eb = sub(b, mul(d, c))
  const q = (p: P, w: number, s: number): P => add(p, mul(n, w * s))
  let out: P[] = [q(a, wa - c * 0.9, 1), q(ea, wa, 1), q(eb, wb, 1), q(b, wb - c * 0.9, 1), q(b, wb - c * 0.9, -1), q(eb, wb, -1), q(ea, wa, -1), q(a, wa - c * 0.9, -1)]
  const prof = o.prof
  const TS = prof ? [...new Set([...prof[0].map((p) => p[0]), ...prof[1].map((p) => p[0])])].sort((x, y) => x - y) : null
  const qq = (t: number, off: number): P => add(mix(a, b, t), mul(n, off * interp(off >= 0 ? prof![0] : prof![1], t)))
  if (prof && TS) out = TS.map((t) => qq(t, 1)).concat(TS.slice().reverse().map((t) => qq(t, -1)))
  const id = `${cx.id}c${cx.n++}`
  const z = o.zones ?? [null, null, null]
  const mat = o.mat ?? 'white'
  const parts: string[] = []
  const band = (o1: number, o2: number, zone: Zone, nn: P, forced: number | undefined) => {
    const poly = prof && TS ? TS.map((t) => qq(t, o1)).concat(TS.slice().reverse().map((t) => qq(t, o2))) : [q(a, wa, o1), q(b, wb, o1), q(b, wb, o2), q(a, wa, o2)]
    const ti = forced === undefined ? toneOf(nn, lt) : zone === 'p' ? 1 : forced
    if (zone === 'p') {
      parts.push(`<polygon points="${pts(poly)}" style="fill:${MAT[mat][ti]}"/><polygon points="${pts(poly)}" fill="${AMBER[ti]}" fill-opacity="${(0.55 + 0.45 * cx.hot).toFixed(2)}"/>`)
      parts.push(`<polygon points="${pts(poly)}" fill-opacity="${(0.4 * cx.hot).toFixed(2)}" style="fill:var(--a-amb-rim)"/>`)
    } else {
      parts.push(`<polygon points="${pts(poly)}" style="fill:${MAT[mat][ti]}"/>`)
      if (zone === 's') parts.push(`<polygon points="${pts(poly)}" fill="#ffb000" fill-opacity=".38"/><polygon points="${pts(poly)}" fill="none" stroke="#ffb000" stroke-width="1.3"/>`)
    }
  }
  const s0 = o.sym ? 1 : undefined, s1 = o.sym ? 0 : undefined
  if (z.length === 2) {
    const tn = o.tn ?? [1, 1]
    band(1.2, 0, z[0], n, tn[0]); band(0, -1.2, z[1], mul(n, -1), tn[1])
  } else if (z.length === 4) {
    band(1.2, k, z[0], n, s0); band(k, 0, z[1], mul(n, 0.2), s1); band(0, -k, z[2], mul(n, -0.2), s1); band(-k, -1.2, z[3], mul(n, -1), s0)
  } else {
    band(1.2, k, z[0], n, s0); band(k, -k, z[1], mul(n, 0.15), s1); band(-k, -1.2, z[2], mul(n, -1), s0)
  }
  if (o.cut) {
    const e = o.cut === 'a' ? a : b, sg = o.cut === 'a' ? 1 : -1, w = o.cut === 'a' ? wa : wb
    parts.push(`<polygon points="${pts([q(add(e, mul(d, sg * c * 2.4)), w, 1), q(add(e, mul(d, sg * c * 2.4)), w, -1), q(e, w, -1), q(e, w, 1)])}" fill="#fff" fill-opacity=".18"/>`)
  }
  cx.out.push(`<clipPath id="${id}"><polygon points="${pts(out)}"/></clipPath><g clip-path="url(#${id})">${parts.join('')}</g><polygon points="${pts(out)}" fill="none" stroke-width=".4" stroke-linejoin="round" style="stroke:var(--a-edge)"/>`)
}

/** Articulación: disco octogonal gris oscuro con cubo central (solo hombro frontal, codo y rodilla de frente/espalda). */
export function joint(cx: Ctx, p: P, r: number): void {
  const poly: P[] = []
  for (let i = 0; i < 8; i++) { const an = ((22.5 + i * 45) * Math.PI) / 180; poly.push([p[0] + Math.cos(an) * r, p[1] + Math.sin(an) * r]) }
  const hi: P[] = [poly[5], poly[6], poly[7], poly[0], add(p, mul(unit(cx.lt), -r * 0.2))]
  cx.out.push(`<polygon points="${pts(poly)}" stroke-width=".4" stroke-linejoin="round" style="fill:var(--a-d1);stroke:var(--a-edge)"/><polygon points="${pts(hi)}" fill-opacity=".9" style="fill:var(--a-d0)"/><circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1(r * 0.38)}" style="fill:var(--a-d2)"/>`)
}

/** Mano: bloque oscuro alargado de una pieza (sin dedos). */
export function hand(cx: Ctx, wrist: P, dir: P): void {
  const d = unit(dir)
  block(cx, { a: add(wrist, mul(d, 0.4)), b: add(wrist, mul(d, 12.5)), wa: 3.8, wb: 4.8, c: 2.4, mat: 'dark', n: nrm(d) })
}

/** Banda oscura de articulación (tobillo, codo, rodilla trasera). */
export function band(cx: Ctx, p: P, axis: P, w: number, h: number, sym = false): void {
  const d = unit(axis)
  block(cx, { a: add(p, mul(d, -h)), b: add(p, mul(d, h)), wa: w, wb: w, c: Math.min(1.1, h * 0.7), mat: 'dark', n: nrm(d), sym })
}

/** Rótula: placa hexagonal sobre una ranura oscura. */
export function kneecap(cx: Ctx, knee: P, axis: P, off = 0, n?: P): void {
  const d = unit(axis), nn = n ?? nrm(d), c = add(knee, mul(unit(nn), off))
  block(cx, { a: add(c, mul(d, -4.6)), b: add(c, mul(d, 5.2)), wa: 4.2, wb: 4.2, c: 1.3, mat: 'dark', n: nrm(d), sym: true })
  block(cx, { a: add(c, mul(d, -5.4)), b: add(c, mul(d, 3.4)), wa: 4.7, wb: 3.2, c: 2.2, n: nrm(d), k: 0.3, sym: true })
}

/**
 * Estilo de la articulación trasera de codos y rodillas (vista de espalda): 'thin' = línea oscura muy fina,
 * 'none' = sin articulación. En desarrollo se puede forzar con ?bj=none.
 */
export const STYLE: { backJoint: 'thin' | 'none' } = { backJoint: 'thin' }
if (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('bj') === 'none') STYLE.backJoint = 'none'

/**
 * Mano en J para las vistas frontal y de espalda: el tallo es el dorso de la mano y el gancho, los dedos,
 * que se curvan hacia el cuerpo. `toward` es el punto (eje del cuerpo) hacia el que se curvan.
 */
export function handJ(cx: Ctx, wrist: P, dir: P, toward: P, hook: number): void {
  const d = unit(dir)
  const perp = nrm(d)
  const want = sub(toward, wrist)
  const s = dot(perp, [want[0], want[1] + 40]) >= 0 ? 1 : -1
  const inward = mul(perp, s)
  const end = add(wrist, mul(d, 8.8))
  block(cx, { a: add(wrist, mul(d, 0.4)), b: end, wa: 3.5, wb: 4, c: 1.7, mat: 'dark', n: perp, sym: true })
  const ang = 0.85 // ~50° hacia el cuerpo
  const dh = unit(add(mul(d, Math.cos(ang)), mul(inward, Math.sin(ang))))
  block(cx, { a: sub(end, mul(d, 2)), b: add(end, mul(dh, hook)), wa: 3.2, wb: 2.4, c: 1.5, mat: 'dark', n: nrm(dh), sym: true })
}
