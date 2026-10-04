import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { METRIC_BY_KEY, METRICS, type MetricKey } from '../body/metrics'
import MetricChart from '../body/MetricChart'
import { availableMetrics, useMeasurements, useMetricSeries } from '../body/bodyShim'
import { LatestMeasurement } from '../body/LatestMeasurement'
import { EmptyState } from '../ui'
import { fmtNum } from './weightFormat'
import { addDays, isoDate, movingAverage, useBodyWeights, weightTrend } from './weightData'

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
function TrendBar({ deltaKg, unit }: { deltaKg: number; unit: string }) {
  const pct = Math.min(1, Math.abs(deltaKg) / 3) * 50
  return (
    <div className="space-y-1.5">
      <div className="relative h-2 rounded-full" style={{ background: 'var(--hair)' }} role="img" aria-label={`Variación de ${deltaKg > 0 ? '+' : ''}${fmtNum(deltaKg)} ${unit}`}>
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
 * Evolución de la composición corporal: selector de métrica (peso, grasa %, músculo kg…) y de periodo, gráfica con puntos
 * diarios y media móvil de 7 días, tarjetas Último / Media 7 d / Variación y, debajo, el resumen de la última medición.
 * Compartido por /peso y Stats. Con `registerLink` añade el enlace a /peso.
 */
export function WeightEvolution({ registerLink }: { registerLink?: boolean }) {
  const weights = useBodyWeights()
  const [metric, setMetric] = useState<MetricKey>('weightKg')
  const [range, setRange] = useState<(typeof RANGES)[number]['k']>('90')
  const rowsAll = useMeasurements()
  const avail = useMemo(() => availableMetrics(rowsAll), [rowsAll])
  const other = useMetricSeries(metric)
  const def = METRIC_BY_KEY[metric]
  const dUnit = def.unit
  const series = other
  const today = isoDate()
  const days = RANGES.find((r) => r.k === range)!.days
  const from = days ? addDays(today, -days) : series[0]?.date ?? today
  const view = useMemo(() => series.filter((p) => p.date >= from), [series, from])
  const avg = useMemo(() => movingAverage(series.map((p) => ({ date: p.date, weightKg: p.value }))), [series])
  const trend = useMemo(() => weightTrend(series.map((p) => ({ date: p.date, weightKg: p.value })), Math.max(7, days || 90)), [series, days])
  const last = series[series.length - 1]
  const lastAvg = avg[avg.length - 1]
  const fmt = (v: number) => fmtNum(v, def.decimals)

  if (weights.length === 0 && metric === 'weightKg') {
    return (
      <div className="space-y-3">
        <EmptyState>Aún no has registrado tu peso.</EmptyState>
        {registerLink && <Link to="/peso" className="press inline-flex min-h-11 items-center rounded-full bg-gradient-to-br from-signal to-signal-2 px-5 text-sm font-semibold text-on-signal glow">Registrar peso</Link>}
        <Link to="/importar" className="press ml-2 inline-flex min-h-11 items-center rounded-full border border-hair bg-ink/5 px-5 text-sm font-semibold hover:bg-ink/10">Importar de la báscula</Link>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="glass space-y-4 p-4">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="group" aria-label="Métrica">
          {METRICS.filter((m) => m.key === 'weightKg' || avail.includes(m.key)).map((m) => (
            <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}
              className={`press min-h-9 shrink-0 rounded-full border px-3.5 text-xs font-semibold ${metric === m.key ? 'border-signal bg-signal text-on-signal' : 'border-hair text-mute hover:text-ink'}`}>{m.short}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Periodo">
          {RANGES.map((r) => (
            <button key={r.k} type="button" aria-pressed={range === r.k} onClick={() => setRange(r.k)}
              className={`press min-h-9 rounded-full border px-3.5 text-xs font-semibold ${range === r.k ? 'border-signal bg-signal text-on-signal' : 'border-hair text-mute hover:text-ink'}`}>{r.label}</button>
          ))}
        </div>
        {series.length === 0 ? (
          <p className="rounded-xl bg-ink/5 px-4 py-6 text-center text-sm text-mute">Aún no hay datos de «{def.label}». Importa una medición de la báscula para verlos.</p>
        ) : view.length >= 2 ? (
          <MetricChart points={view} unit={dUnit} label={def.label} decimals={def.decimals} minSpan={def.minSpan} from={days ? from : view[0].date} to={today} />
        ) : (
          <p className="rounded-xl bg-ink/5 px-4 py-6 text-center text-sm text-mute">Necesitas al menos dos medidas en este periodo para dibujar la curva.</p>
        )}
        {series.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <Fact k="Último" v={fmt(last.value)} sub={dUnit} />
            <Fact k="Media 7 d" v={fmt(lastAvg.avg)} sub={dUnit} />
            <Fact k="Variación" v={trend ? `${trend.deltaKg > 0 ? '+' : ''}${fmt(trend.deltaKg)}` : '—'} sub={trend ? `${trend.perWeekKg > 0 ? '+' : ''}${fmt(trend.perWeekKg)} ${dUnit}/sem` : 'faltan datos'} />
          </div>
        )}
        {trend && metric === 'weightKg' && <TrendBar deltaKg={trend.deltaKg} unit={dUnit} />}
      </div>
      <LatestMeasurement />
      <div className="flex flex-wrap gap-2">
        {registerLink && <Link to="/peso" className="press inline-flex min-h-11 items-center rounded-full border border-hair bg-ink/5 px-5 text-sm font-semibold hover:bg-ink/10">Registrar peso</Link>}
        <Link to="/importar" className="press inline-flex min-h-11 items-center rounded-full border border-hair bg-ink/5 px-5 text-sm font-semibold hover:bg-ink/10">Importar de la báscula</Link>
      </div>
    </div>
  )
}
