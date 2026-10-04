import { fmtDayLong, fmtNum } from '../weight/weightFormat'
import { useMeasurements } from './bodyShim'
import { METRICS } from './metrics'

/** Resumen de la última medición de la báscula: los indicadores principales destacados y el resto en una rejilla. */
export function LatestMeasurement() {
  const rows = useMeasurements()
  // la última medición CON composición (un día con solo el peso manual no sirve de resumen)
  const m = [...rows].reverse().find((r) => METRICS.some((d) => d.key !== 'weightKg' && typeof r[d.key] === 'number'))
  if (!m) return null
  const cell = (def: (typeof METRICS)[number], big: boolean) => {
    const v = m[def.key]
    return (
      <div key={def.key} className={`rounded-2xl border border-hair px-3 py-2.5 ${big ? 'bg-signal/10' : 'bg-ink/5'}`}>
        <div className="eyebrow !text-[0.6rem]">{def.short}</div>
        <div className={`num mt-0.5 font-semibold ${big ? 'text-xl text-signal-text' : 'text-base'}`}>
          {typeof v === 'number' ? fmtNum(v, def.decimals) : '—'}
          <span className="ml-1 text-[0.68rem] font-normal text-mute">{def.unit}</span>
        </div>
      </div>
    )
  }
  return (
    <section className="glass space-y-3 p-4" aria-label="Última medición de la báscula">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="display text-base">Última medición</h3>
        <span className="text-xs text-mute">{fmtDayLong(m.date)}{m.measuredAt ? ` · ${m.measuredAt}` : ''}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{METRICS.filter((d) => d.main).map((d) => cell(d, true))}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{METRICS.filter((d) => !d.main).map((d) => cell(d, false))}</div>
    </section>
  )
}
