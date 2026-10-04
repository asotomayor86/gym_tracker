import { useId, useMemo, useState } from 'react'
import { fmtDay, fmtDayLong, fmtNum } from '../weight/weightFormat'
import { dayIndex, movingAverage } from '../weight/weightData'

export interface MetricPoint { date: string; value: number }


const W = 360, H = 200, L = 36, R = 12, T = 14, B = 26

/**
 * Gráfico de una métrica corporal (peso, grasa %, músculo kg…): puntos diarios, media móvil de 7 días en ámbar con brillo
 * y relleno en degradado. Los valores ya vienen en la unidad que se muestra. `minSpan` = rango mínimo del eje Y.
 */
export default function MetricChart({ points, unit, label, from, to, minSpan = 1.5, decimals = 1 }: { points: MetricPoint[]; unit: string; label: string; from: string; to: string; minSpan?: number; decimals?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [sel, setSel] = useState<number | null>(null)
  const data = useMemo(() => {
    const avg = movingAverage(points.map((p) => ({ date: p.date, weightKg: p.value })))
    const vals = points.map((p) => p.value).concat(avg.map((a) => a.avg))
    const lo = Math.min(...vals), hi = Math.max(...vals)
    const span = Math.max(hi - lo, minSpan)
    const pad = span * 0.18
    const y0 = lo - pad, y1 = hi + pad
    const step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => (y1 - y0) / s <= 4) ?? 500
    const ticks: number[] = []
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) ticks.push(v)
    return { avg, y0, y1, ticks }
  }, [points, minSpan])

  const d0 = dayIndex(from), d1 = Math.max(dayIndex(to), d0 + 1)
  const x = (date: string) => L + ((dayIndex(date) - d0) / (d1 - d0)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - data.y0) / (data.y1 - data.y0)) * (H - T - B)
  const line = data.avg.map((a, i) => `${i ? 'L' : 'M'}${x(a.date).toFixed(1)},${y(a.avg).toFixed(1)}`).join(' ')
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
        role="img" aria-label={`${label} entre el ${fmtDay(from)} y el ${fmtDay(to)}: ${points.length} medidas, la última ${fmtNum(points[points.length - 1].value, decimals)} ${unit}. Usa las flechas para recorrer las medidas.`}
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
            <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="8.5" style={{ fill: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(v, Math.abs(v % 1) > 1e-6 ? Math.min(decimals, 1) || 0 : 0)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={t + i} x={i === 0 ? L : i === 2 ? W - R : x(t)} y={H - 8} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize="8.5" style={{ fill: 'var(--mute)' }}>{fmtDay(t)}</text>
        ))}
        <path d={area} fill={`url(#${uid}a)`} />
        <path d={line} fill="none" stroke="#ffb000" strokeWidth="5" strokeOpacity=".55" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${uid}g)`} />
        <path d={line} fill="none" stroke="#ffb000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={i === idx ? 3.6 : 2.2} style={{ fill: i === idx ? 'var(--ink)' : 'var(--cold)', stroke: 'var(--surface)' }} strokeWidth={i === idx ? 1.6 : 0.8} opacity={i === idx ? 1 : 0.85} />
        ))}
        {cur && <line x1={x(cur.date)} x2={x(cur.date)} y1={T} y2={H - B} strokeWidth=".8" style={{ stroke: 'var(--signal)' }} opacity=".7" />}
      </svg>
      {cur && curAvg && (
        <p className="flex flex-wrap items-baseline gap-x-3 text-xs" aria-live="polite">
          <b className="text-ink">{fmtDayLong(cur.date)}</b>
          <span className="num">{fmtNum(cur.value, decimals)} {unit}</span>
          <span className="text-signal-text">media 7 d · <span className="num">{fmtNum(curAvg.avg, decimals)} {unit}</span></span>
        </p>
      )}
    </div>
  )
}
