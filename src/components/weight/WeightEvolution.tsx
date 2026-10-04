import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../ui'
import WeightChart from './WeightChart'
import { fmtNum } from './weightFormat'
import { addDays, isoDate, movingAverage, useBodyWeights, weightTrend } from './weightData'
import { usePrefs } from '../../lib/prefs'
import { fromKg } from '../../lib/units'

const RANGES = [{ k: '30', label: '30 d', days: 30 }, { k: '90', label: '90 d', days: 90 }, { k: '365', label: '1 año', days: 365 }, { k: 'all', label: 'Todo', days: 0 }] as const

function Fact({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-hair bg-ink/5 px-3 py-3 text-center">
      <div className="eyebrow !text-[0.62rem]">{k}</div>
      <div className="num mt-1 text-lg font-semibold">{v}</div>
      {sub && <div className="text-[0.68rem] text-mute">{sub}</div>}
    </div>
  )
}

/** Barra de calor de la variación: parte del centro; hacia la izquierda en acero frío (baja), hacia la derecha en ámbar (sube). */
function TrendBar({ deltaKg }: { deltaKg: number }) {
  const pct = Math.min(1, Math.abs(deltaKg) / 3) * 50
  return (
    <div className="space-y-1.5">
      <div className="relative h-2 rounded-full" style={{ background: 'var(--hair)' }} role="img" aria-label={`Variación de ${deltaKg > 0 ? '+' : ''}${fmtNum(deltaKg)} kg`}>
        <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: 'var(--mute)' }} />
        <div
          className="absolute inset-y-0 rounded-full"
          style={deltaKg >= 0
            ? { left: '50%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--ink), #ffb000)' }
            : { right: '50%', width: `${pct}%`, background: 'linear-gradient(270deg, var(--cold), var(--ink))' }}
        />
      </div>
      <div className="flex justify-between text-[0.65rem] uppercase tracking-widest text-mute"><span>Baja</span><span>Sin cambio</span><span>Sube</span></div>
    </div>
  )
}

/**
 * Evolución del peso corporal: selector de periodo, gráfica con puntos diarios y media móvil de 7 días, tarjetas
 * Último / Media 7 d / Variación y barra de tendencia. Compartido por /peso y Stats. Con `registerLink` añade el enlace a /peso.
 */
export function WeightEvolution({ registerLink }: { registerLink?: boolean }) {
  const { unit } = usePrefs()
  const rows = useBodyWeights()
  const [range, setRange] = useState<(typeof RANGES)[number]['k']>('90')
  const today = isoDate()
  const days = RANGES.find((r) => r.k === range)!.days
  const from = days ? addDays(today, -days) : rows[0]?.date ?? today
  const view = useMemo(() => rows.filter((r) => r.date >= from), [rows, from])
  const avg = useMemo(() => movingAverage(rows), [rows])
  const trend = useMemo(() => weightTrend(rows, Math.max(7, days || 90)), [rows, days])
  const last = rows[rows.length - 1]
  const lastAvg = avg[avg.length - 1]

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState>Aún no has registrado tu peso.</EmptyState>
        {registerLink && <Link to="/peso" className="press inline-flex min-h-11 items-center rounded-full bg-gradient-to-br from-signal to-signal-2 px-5 text-sm font-semibold text-on-signal glow">Registrar peso</Link>}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="glass space-y-4 p-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Periodo">
          {RANGES.map((r) => (
            <button key={r.k} type="button" aria-pressed={range === r.k} onClick={() => setRange(r.k)}
              className={`press min-h-9 rounded-full border px-3.5 text-xs font-semibold ${range === r.k ? 'border-signal bg-signal text-on-signal' : 'border-hair text-mute hover:text-ink'}`}>{r.label}</button>
          ))}
        </div>
        {view.length >= 2 ? (
          <WeightChart points={view} unit={unit} from={days ? from : view[0].date} to={today} />
        ) : (
          <p className="rounded-xl bg-ink/5 px-4 py-6 text-center text-sm text-mute">Necesitas al menos dos medidas en este periodo para dibujar la curva.</p>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Fact k="Último" v={`${fmtNum(fromKg(last.weightKg, unit))}`} sub={unit} />
          <Fact k="Media 7 d" v={`${fmtNum(fromKg(lastAvg.avg, unit))}`} sub={unit} />
          <Fact k="Variación" v={trend ? `${trend.deltaKg > 0 ? '+' : ''}${fmtNum(fromKg(trend.deltaKg, unit))}` : '—'} sub={trend ? `${trend.perWeekKg > 0 ? '+' : ''}${fmtNum(fromKg(trend.perWeekKg, unit))} ${unit}/sem` : 'faltan datos'} />
        </div>
        {trend && <TrendBar deltaKg={trend.deltaKg} />}
      </div>
      {registerLink && <Link to="/peso" className="press inline-flex min-h-11 items-center rounded-full border border-hair bg-ink/5 px-5 text-sm font-semibold hover:bg-ink/10">Registrar peso</Link>}
    </div>
  )
}
