/** Geometría 2D del androide: puntos, cinemática de 2 huesos y segmentos con perfil de grosor asimétrico. */
export type P = [number, number]
export type Prof = [t: number, w: number][]
export type AsymProf = { f: Prof; b: Prof }

export const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]]
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
