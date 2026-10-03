import { f1, openPath, roundPoly, scaleAround, smoothPath } from './geom'
import type { Plate, Scene } from './scene'

/**
 * Renderizado del androide: capa interior oscura, pocas placas grandes con bisel suave y discos concéntricos
 * en las articulaciones principales. Los músculos trabajados se iluminan en ámbar encima de la carcasa.
 * Los colores salen de variables CSS (--a-*), así que sirve igual en tema oscuro y claro.
 * Los degradados son compartidos (objectBoundingBox): un solo juego por figura.
 */
const v = (n: string) => `var(--a-${n})`
const sc = (c: string) => `style="stop-color:${c}"`

/** Definiciones comunes de una figura; `id` debe ser único en el documento. */
export function androidDefs(id: string): string {
  const lin = (name: string, stops: [number, string][]) =>
    `<linearGradient id="${id}-${name}" x1="0" y1="0" x2="1" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" ${sc(c)}/>`).join('')}</linearGradient>`
  return (
    lin('s', [[0, v('m0')], [0.3, v('m1')], [0.68, v('m2')], [1, v('m3')]]) +
    lin('si', [[0, v('m1')], [0.55, v('m2')], [1, v('m2')]]) +
    lin('k', [[0, v('m1')], [0.5, v('m2')], [1, v('m3')]]) +
    lin('ki', [[0, v('m2')], [1, v('m3')]]) +
    lin('a', [[0, v('amb-rim')], [0.3, v('amb-hi')], [0.68, v('amb-mid')], [1, v('amb-lo')]]) +
    lin('ai', [[0, v('amb-hi')], [0.55, v('amb-mid')], [1, v('amb-mid')]]) +
    `<radialGradient id="${id}-h" cx=".32" cy=".26" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id}-j" cx=".34" cy=".3" r=".8"><stop offset="0" ${sc(v('m0'))}/><stop offset=".45" ${sc(v('m2'))}/><stop offset="1" ${sc(v('m3'))}/></radialGradient>` +
    `<radialGradient id="${id}-sh"><stop offset="0" ${sc(v('shadow'))}/><stop offset="1" ${sc(v('shadow'))} stop-opacity="0"/></radialGradient>`
  )
}

export interface RenderOpts {
  id: string
  /** 0..1: intensidad del ámbar en las placas trabajadas (latido por esfuerzo y fase concéntrica). */
  hot: number
  /** Sin brillos por placa (reduced-data / equipos lentos). */
  lite?: boolean
}

export function renderAndroid(s: Scene, o: RenderOpts): string {
  const { id, hot, lite } = o
  const out: string[] = [...s.back]
  const mp = s.masses.map((m) => `<path d="${smoothPath(m)}"/>`).join('')
  out.push(`<g style="fill:${v('inner')}">${mp}</g>`)
  const glowOp = (0.3 + 0.7 * hot).toFixed(2)
  for (const p of s.plates) {
    if (p.lvl === 'p') out.push(`<path d="${roundPoly(p.pts, 1.6)}" fill="none" stroke-linejoin="round" stroke-width="${f1(4.5 + 2.5 * hot)}" stroke-opacity="${glowOp}" style="stroke:${v('glow')}"/>`)
  }
  const worked: string[] = [], base: string[] = []
  const draw = (p: Plate, into: string[]) => {
    if (p.pts.length < 3) return
    if (p.k === 'visor') {
      into.push(`<path d="${roundPoly(p.pts, 1.2)}" fill-opacity=".85" style="fill:${v('inner')}"/>`)
      return
    }
    const rr = p.k === 'helmet' ? 3.4 : 1.8
    const d = roundPoly(p.pts, rr), di = roundPoly(scaleAround(p.pts, p.k === 'helmet' ? 0.9 : 0.84), rr)
    const w = p.lvl === 'p', se = p.lvl === 's', dark = p.k === 'mask'
    const g1 = w ? 'a' : dark ? 'k' : 's', g2 = w ? 'ai' : dark ? 'ki' : 'si'
    into.push(`<path d="${d}" fill="url(#${id}-${g1})" stroke-width=".6" stroke-linejoin="round" style="stroke:${v('line')}"/>`)
    // el bisel interior y el brillo solo en placas grandes, músculos y casco; los segmentos largos van lisos
    const bevel = p.big || p.k !== 'shell'
    if (bevel) into.push(`<path d="${di}" fill="url(#${id}-${g2})"/>`)
    if (!lite && bevel && p.k !== 'mask') into.push(`<path d="${di}" fill="url(#${id}-h)"/>`)
    if (w) into.push(`<path d="${di}" fill-opacity="${(0.55 * hot).toFixed(2)}" style="fill:${v('amb-rim')}"/>`)
    if (se) into.push(`<path d="${d}" fill="none" stroke-width="1.5" stroke-linejoin="round" opacity=".9" style="stroke:${v('amb-hi')}"/><path d="${di}" opacity=".22" style="fill:${v('amb-mid')}"/>`)
    if (p.k === 'plate' && (w || se)) for (const l of p.fib) into.push(`<path d="${openPath(l)}" fill="none" stroke-opacity=".4" stroke-width=".4" style="stroke:${v('amb-rim')}"/>`)
  }
  for (const p of s.plates) draw(p, p.lvl === 'p' ? worked : base)
  out.push(...base)
  for (const l of s.lines) out.push(`<path d="${openPath(l)}" fill="none" stroke-width=".7" stroke-linecap="round" style="stroke:${v('line')}"/>`)
  // articulaciones: discos concéntricos (las pequeñas, un solo punto)
  for (const j of s.joints) {
    const x = f1(j.p[0]), y = f1(j.p[1])
    if (j.r < 2.6) {
      out.push(`<circle cx="${x}" cy="${y}" r="${j.r}" stroke-width=".5" style="fill:${v('inner')};stroke:${v('m1')}"/>`)
      continue
    }
    out.push(
      `<circle cx="${x}" cy="${y}" r="${j.r}" fill="url(#${id}-j)" stroke-width=".6" style="stroke:${v('line')}"/>` +
      `<circle cx="${x}" cy="${y}" r="${f1(j.r * 0.62)}" stroke-width=".5" style="fill:${v('inner')};stroke:${v('m1')}"/>` +
      `<circle cx="${x}" cy="${y}" r="${f1(j.r * 0.3)}" fill="url(#${id}-j)"/>`,
    )
  }
  out.push(...worked)
  out.push(...s.front)
  return out.join('')
}
