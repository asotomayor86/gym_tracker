import { f1, openPath, type P, roundPoly, scaleAround, smoothPath } from './geom'
import type { Plate, Scene } from './scene'

/**
 * Renderizado "P · placas biseladas": capa interior oscura con cables, carcasa por segmento, placas con
 * borde biselado y brillo, discos concéntricos en las articulaciones y brillo ámbar bajo las placas trabajadas.
 * Los colores salen de variables CSS (--a-*), así que sirve igual en tema oscuro y claro.
 * Los degradados son compartidos (objectBoundingBox): un solo juego por figura.
 */
const v = (n: string) => `var(--a-${n})`
const sc = (c: string) => `style="stop-color:${c}"`

/** Definiciones comunes de una figura; `id` debe ser único en el documento. */
export function androidDefs(id: string): string {
  const lin = (name: string, stops: [number, string][]) =>
    `<linearGradient id="${id}-${name}" x1="0" y1="0" x2="1" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" ${sc(c)}/>`).join('')}</linearGradient>`
  const rad = (name: string, op: number) =>
    `<radialGradient id="${id}-${name}" cx=".32" cy=".26" r=".55"><stop offset="0" stop-color="#fff" stop-opacity="${op}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
  return (
    lin('s', [[0, v('m0')], [0.3, v('m1')], [0.68, v('m2')], [1, v('m3')]]) +
    lin('si', [[0, v('m1')], [0.55, v('m2')], [1, v('m2')]]) +
    lin('sl', [[0, v('m1')], [0.3, v('m2')], [0.68, v('m2')], [1, v('m3')]]) +
    lin('sli', [[0, v('m2')], [1, v('m2')]]) +
    lin('a', [[0, v('amb-rim')], [0.3, v('amb-hi')], [0.68, v('amb-mid')], [1, v('amb-lo')]]) +
    lin('ai', [[0, v('amb-hi')], [0.55, v('amb-mid')], [1, v('amb-mid')]]) +
    rad('h', 0.55) + rad('ha', 0.7) +
    `<radialGradient id="${id}-j" cx=".34" cy=".3" r=".8"><stop offset="0" ${sc(v('m0'))}/><stop offset=".45" ${sc(v('m2'))}/><stop offset="1" ${sc(v('m3'))}/></radialGradient>` +
    `<radialGradient id="${id}-sh"><stop offset="0" ${sc(v('shadow'))}/><stop offset="1" ${sc(v('shadow'))} stop-opacity="0"/></radialGradient>`
  )
}

export interface RenderOpts {
  id: string
  /** 0..1: intensidad del ámbar en las placas trabajadas (latido por esfuerzo y fase concéntrica). */
  hot: number
  /** Sin brillos ni sombras por placa (reduced-data / equipos lentos). */
  lite?: boolean
}

export function renderAndroid(s: Scene, o: RenderOpts): string {
  const { id, hot, lite } = o
  const out: string[] = [...s.back]
  const paths = s.masses.map((m) => `<path d="${smoothPath(m)}"/>`).join('')
  out.push(`<g stroke-width="1.6" stroke-linejoin="round" style="fill:${v('inner')};stroke:${v('inner-rim')}">${paths}</g><g style="fill:${v('inner')}">${paths}</g>`)
  // cables entre las placas
  const offs = lite ? [-3, 0, 3] : [-3.4, -1.6, 0, 1.6, 3.4]
  for (const [a, b] of s.axes) {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n: P = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]
    offs.forEach((off, i) => {
      const hi = !lite && i % 2 === 1
      out.push(`<path d="M${f1(a[0] + n[0] * off)},${f1(a[1] + n[1] * off)} L${f1(b[0] + n[0] * off * 0.8)},${f1(b[1] + n[1] * off * 0.8)}" fill="none" stroke-width="${hi ? 0.5 : 0.9}"${hi ? ' stroke-dasharray="1.2 1.6"' : ''} style="stroke:${hi ? v('cable-hi') : v('cable')}"/>`)
    })
  }
  const dr: string[] = []
  const worked: string[] = []
  // brillo térmico que sale por las juntas
  const glowOp = (0.35 + 0.65 * hot).toFixed(2)
  for (const p of s.plates) {
    if (p.lvl === 'p') out.push(`<path d="${roundPoly(p.pts, 1.6)}" fill="none" stroke-linejoin="round" stroke-width="${f1(5 + 2.5 * hot)}" stroke-opacity="${glowOp}" style="stroke:${v('glow')}"/>`)
  }
  const draw = (p: Plate, into: string[]) => {
    if (p.pts.length < 3) return
    if (p.k === 'visor') {
      into.push(`<path d="${roundPoly(p.pts, 1.4)}" fill-opacity=".82" stroke-width=".5" style="fill:${v('inner')};stroke:${v('m2')}"/><path d="${roundPoly(scaleAround(p.pts, 0.7), 1)}" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".5"/>`)
      return
    }
    const rr = p.k === 'helmet' ? 3.2 : 1.7
    const d = roundPoly(p.pts, rr), di = roundPoly(scaleAround(p.pts, p.k === 'helmet' ? 0.9 : 0.82), rr)
    const w = p.lvl === 'p', se = p.lvl === 's', shell = p.k === 'shell'
    const g1 = w ? 'a' : shell ? 'sl' : 's', g2 = w ? 'ai' : shell ? 'sli' : 'si'
    // las placas neutras de músculo y la carcasa van sin sombra ni brillo propios: son la mayoría de los nodos
    const rich = !lite && (p.lvl !== 'n' || (p.k !== 'plate' && p.k !== 'shell') || p.id === 'pelvis' || p.id === 'collar')
    if (rich) into.push(`<path d="${d}" fill="#000" fill-opacity=".5" transform="translate(.8,1.1)"/>`)
    into.push(`<path d="${d}" fill="url(#${id}-${g1})" stroke-width=".6" stroke-linejoin="round" style="stroke:${v('line')}"/>`)
    into.push(`<path d="${di}" fill="url(#${id}-${g2})"/>`)
    if (!shell && rich) into.push(`<path d="${di}" fill="url(#${id}-${w ? 'ha' : 'h'})"/>`)
    if (w) into.push(`<path d="${di}" fill-opacity="${(0.55 * hot).toFixed(2)}" style="fill:${v('amb-rim')}"/>`)
    if (se) into.push(`<path d="${d}" fill="none" stroke-width="1.5" stroke-linejoin="round" opacity=".9" style="stroke:${v('amb-hi')}"/><path d="${di}" opacity=".22" style="fill:${v('amb-mid')}"/>`)
    if (p.k === 'plate' && (w || se)) for (const l of p.fib) into.push(`<path d="${openPath(l)}" fill="none" stroke-opacity=".45" stroke-width=".4" style="stroke:${v('amb-rim')}"/>`)
    if (rich) into.push(`<path d="${d}" fill="none" stroke-width=".45" transform="translate(-.35,-.4)" opacity=".7" style="stroke:${v('spec')}"/>`)
  }
  for (const p of s.plates) draw(p, p.lvl === 'p' ? worked : dr)
  out.push(...dr)
  // articulaciones: discos concéntricos que marcan el giro del rig
  for (const j of s.joints) {
    const x = f1(j.p[0]), y = f1(j.p[1])
    out.push(
      `<circle cx="${x}" cy="${y}" r="${j.r + 0.8}" fill="#000" fill-opacity=".5"/><circle cx="${x}" cy="${y}" r="${j.r}" fill="url(#${id}-j)" stroke-width=".6" style="stroke:${v('line')}"/>` +
      `<circle cx="${x}" cy="${y}" r="${f1(j.r * 0.66)}" stroke-width=".5" style="fill:${v('inner')};stroke:${v('m1')}"/>` +
      `<circle cx="${x}" cy="${y}" r="${f1(j.r * 0.36)}" fill="url(#${id}-j)"/><circle cx="${x}" cy="${y}" r="${f1(j.r * 0.13)}" style="fill:${v('m3')}"/>`,
    )
  }
  out.push(...worked)
  out.push(...s.front)
  return out.join('')
}
