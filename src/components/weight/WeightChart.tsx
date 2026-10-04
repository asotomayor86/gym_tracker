import { useId, useMemo, useState } from 'react'
import type { Unit } from '../../lib/units'
import { fromKg } from '../../lib/units'
import { fmtDay, fmtDayLong, fmtNum } from './weightFormat'
import { dayIndex, movingAverage, type Point } from './weightData'


const W = 360, H = 200, L = 36, R = 12, T = 14, B = 26

/** Gráfico de peso: puntos diarios, media móvil de 7 días en ámbar con brillo y relleno en degradado. */
export default function WeightChart({ points, unit, from, to }: { points: Point[]; unit: Unit; from: string; to: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [sel, setSel] = useState<number | null>(null)
  const data = useMemo(() => {
    const avg = movingAverage(points)
    const vals = points.map((p) => fromKg(p.weightKg, unit)).concat(avg.map((a) => fromKg(a.avg, unit)))
    const lo = Math.min(...vals), hi = Math.max(...vals)
    const span = Math.max(hi - lo, unit === 'kg' ? 1.5 : 3)
    const pad = span * 0.18
    const y0 = lo - pad, y1 = hi + pad
    const step = [0.5, 1, 2, 5, 10].find((s) => (y1 - y0) / s <= 4) ?? 10
    const ticks: number[] = []
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) ticks.push(v)
    return { avg, y0, y1, ticks }
  }, [points, unit])

  const d0 = dayIndex(from), d1 = Math.max(dayIndex(to), d0 + 1)
  const x = (date: string) => L + ((dayIndex(date) - d0) / (d1 - d0)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - data.y0) / (data.y1 - data.y0)) * (H - T - B)
  const line = data.avg.map((a, i) => `${i ? 'L' : 'M'}${x(a.date).toFixed(1)},${y(fromKg(a.avg, unit)).toFixed(1)}`).join(' ')
  const last = data.avg[data.avg.length - 1]
  const area = `${line} L${x(last.date).toFixed(1)},${H - B} L${x(data.avg[0].date).toFixed(1)},${H - B} Z`
  const idx = sel ?? points.length - 1
  const cur = points[idx], curAvg = data.avg[idx]

  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect()
    const vx = ((clientX - r.left) / r.width) * W
    let best = 0, bd = Infinity
    points.forEach((p, i) => { const dd = Math.abs(x(p.date) - vx); if (dd < bd) { bd = dd; best = i } })
    setSel(best)
  }
  const xTicks = [from, new Date((d0 + (d1 - d0) / 2) * 86_400_000).toISOString().slice(0, 10), to]

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-pan-y select-none rounded-xl" tabIndex={0}
        role="img" aria-label={`Peso entre el ${fmtDay(from)} y el ${fmtDay(to)}: ${points.length} medidas, la última ${fmtNum(fromKg(points[points.length - 1].weightKg, unit))} ${unit}. Usa las flechas para recorrer las medidas.`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)} onPointerDown={(e) => pick(e.clientX, e.currentTarget)} onPointerLeave={() => setSel(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); setSel(Math.max(0, idx - 1)) }
          if (e.key === 'ArrowRight') { e.preventDefault(); setSel(Math.min(points.length - 1, idx + 1)) }
          if (e.key === 'Escape') setSel(null)
        }}
      >
        <defs>
          <linearGradient id={`${uid}a`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb000" stopOpacity=".34" /><stop offset="1" stopColor="#ffb000" stopOpacity="0" />
          </linearGradient>
          <filter id={`${uid}g`} x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="2.6" /></filter>
        </defs>
        {data.ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} strokeWidth=".6" strokeDasharray="2 3" style={{ stroke: 'var(--hair)' }} />
            <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="8.5" style={{ fill: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(v, v % 1 ? 1 : 0)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={t + i} x={i === 0 ? L : i === 2 ? W - R : x(t)} y={H - 8} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize="8.5" style={{ fill: 'var(--mute)' }}>{fmtDay(t)}</text>
        ))}
        <path d={area} fill={`url(#${uid}a)`} />
        <path d={line} fill="none" stroke="#ffb000" strokeWidth="5" strokeOpacity=".55" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${uid}g)`} />
        <path d={line} fill="none" stroke="#ffb000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(p.date)} cy={y(fromKg(p.weightKg, unit))} r={i === idx ? 3.6 : 2.2} style={{ fill: i === idx ? 'var(--ink)' : 'var(--cold)', stroke: 'var(--surface)' }} strokeWidth={i === idx ? 1.6 : 0.8} opacity={i === idx ? 1 : 0.85} />
        ))}
        {cur && <line x1={x(cur.date)} x2={x(cur.date)} y1={T} y2={H - B} strokeWidth=".8" style={{ stroke: 'var(--signal)' }} opacity=".7" />}
      </svg>
      {cur && curAvg && (
        <p className="flex flex-wrap items-baseline gap-x-3 text-xs" aria-live="polite">
          <b className="text-ink">{fmtDayLong(cur.date)}</b>
          <span className="num">{fmtNum(fromKg(cur.weightKg, unit))} {unit}</span>
          <span className="text-signal-text">media 7 d · <span className="num">{fmtNum(fromKg(curAvg.avg, unit))} {unit}</span></span>
        </p>
      )}
    </div>
  )
}
