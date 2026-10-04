import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, Page, SectionTitle, inputCls } from '../components/ui'
import WeightChart from '../components/weight/WeightChart'
import { fmtDayLong, fmtNum } from '../components/weight/weightFormat'
import {
  WEIGHT_MAX_KG, WEIGHT_MIN_KG, addDays, isoDate, movingAverage, removeBodyWeight, setBodyWeight, useBodyWeights, weightTrend,
} from '../components/weight/weightData'
import { usePrefs } from '../lib/prefs'
import { fromKg, toKg } from '../lib/units'

const RANGES = [{ k: '30', label: '30 d', days: 30 }, { k: '90', label: '90 d', days: 90 }, { k: '365', label: '1 año', days: 365 }, { k: 'all', label: 'Todo', days: 0 }] as const

/** Entrada de peso reutilizable (página y tarjeta de Hoy). */
export function WeightEntry({ compact, date, onSaved }: { compact?: boolean; date?: string; onSaved?: () => void }) {
  const { unit } = usePrefs()
  const rows = useBodyWeights()
  const today = isoDate()
  const [day, setDay] = useState(date ?? today)
  const existing = rows.find((r) => r.date === day)
  const lastKg = rows.length ? rows[rows.length - 1].weightKg : undefined
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const shown = text !== '' ? text : existing ? fromKg(existing.weightKg, unit).toFixed(1).replace(".", ",") : ''
  const placeholder = lastKg ? fmtNum(fromKg(lastKg, unit)) : unit === 'kg' ? '75,0' : '165'

  const save = async () => {
    const v = parseFloat(shown.replace(',', '.'))
    if (!Number.isFinite(v)) return setError('Escribe tu peso, por ejemplo 75,4.')
    const kg = Math.round(toKg(v, unit) * 10) / 10
    if (kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG) return setError(`El peso debe estar entre ${Math.round(fromKg(WEIGHT_MIN_KG, unit))} y ${Math.round(fromKg(WEIGHT_MAX_KG, unit))} ${unit}.`)
    setError('')
    try { await setBodyWeight(day, kg, (note || existing?.note || '').trim() || undefined) } catch { return setError('No se pudo guardar. Inténtalo de nuevo.') }
    setText(''); setNote(''); setSaved(true); setTimeout(() => setSaved(false), 2200)
    onSaved?.()
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="eyebrow">{compact ? 'Peso de hoy' : 'Peso'} ({unit})</span>
          <input
            className={`${inputCls} num mt-1 text-center text-2xl`} inputMode="decimal" autoComplete="off" value={shown} placeholder={placeholder}
            onChange={(e) => { setText(e.target.value); setSaved(false) }} aria-invalid={!!error || undefined} aria-describedby="bw-err"
          />
        </label>
        <Button type="submit" className="shrink-0">{existing ? 'Actualizar' : 'Guardar'}</Button>
      </div>
      {!compact && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="eyebrow">Día</span>
            <input className={`${inputCls} mt-1 text-base`} type="date" max={today} value={day} onChange={(e) => { setDay(e.target.value || today); setText(''); setSaved(false) }} />
          </label>
          <label>
            <span className="eyebrow">Nota (opcional)</span>
            <input className={`${inputCls} mt-1 text-base`} maxLength={80} placeholder="En ayunas, tras entrenar…" value={note || existing?.note || ''} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
      )}
      <p id="bw-err" role="alert" className={`text-sm text-e-fail ${error ? '' : 'hidden'}`}>{error}</p>
      {saved && <p role="status" className="text-sm font-semibold text-signal-text">✓ Guardado</p>}
    </form>
  )
}

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

export default function BodyWeightPage() {
  const { unit } = usePrefs()
  const rows = useBodyWeights()
  const [range, setRange] = useState<(typeof RANGES)[number]['k']>('90')
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const today = isoDate()
  const days = RANGES.find((r) => r.k === range)!.days
  const from = days ? addDays(today, -days) : rows[0]?.date ?? today

  const view = useMemo(() => rows.filter((r) => r.date >= from), [rows, from])
  const avg = useMemo(() => movingAverage(rows), [rows])
  const trend = useMemo(() => weightTrend(rows, Math.max(7, days || 90)), [rows, days])
  const last = rows[rows.length - 1]
  const lastAvg = avg[avg.length - 1]
  const hist = [...rows].reverse().slice(0, 30)

  return (
    <Page title="Peso" eyebrow="Peso corporal" actions={<Link to="/stats" className="press inline-block rounded-full border border-hair px-4 py-2 text-sm font-semibold text-mute hover:text-ink">Stats</Link>}>
      <section>
        <SectionTitle n="01">Registro</SectionTitle>
        <div className="glass p-4"><WeightEntry key={editing ?? 'new'} date={editing ?? undefined} onSaved={() => setEditing(null)} /></div>
      </section>

      <section>
        <SectionTitle n="02" aside="media móvil de 7 días">Evolución</SectionTitle>
        {rows.length === 0 ? (
          <EmptyState>Aún no hay medidas. Registra tu peso y aquí verás cómo evoluciona.</EmptyState>
        ) : (
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
              <Fact k={`Variación`} v={trend ? `${trend.deltaKg > 0 ? '+' : ''}${fmtNum(fromKg(trend.deltaKg, unit))}` : '—'} sub={trend ? `${trend.perWeekKg > 0 ? '+' : ''}${fmtNum(fromKg(trend.perWeekKg, unit))} ${unit}/sem` : 'faltan datos'} />
            </div>
            {trend && <TrendBar deltaKg={trend.deltaKg} />}
          </div>
        )}
      </section>

      {hist.length > 0 && (
        <section>
          <SectionTitle n="03" aside={`${hist.length} últimas`}>Historial</SectionTitle>
          <ul className="glass-flat divide-y divide-hair overflow-hidden">
            {hist.map((r, i) => {
              const prev = hist[i + 1]
              const dk = prev ? r.weightKg - prev.weightKg : null
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{fmtDayLong(r.date)}</div>
                    {r.note && <div className="truncate text-xs text-mute">{r.note}</div>}
                  </div>
                  <div className="text-right">
                    <div className="num text-base">{fmtNum(fromKg(r.weightKg, unit))} <span className="text-xs text-mute">{unit}</span></div>
                    {dk !== null && Math.abs(dk) >= 0.05 && <div className={`num text-xs ${dk > 0 ? 'text-signal-text' : 'text-cold'}`}>{dk > 0 ? '▲' : '▼'} {fmtNum(Math.abs(fromKg(dk, unit)))}</div>}
                  </div>
                  <button type="button" onClick={() => { setEditing(r.date); window.scrollTo({ top: 0, behavior: 'smooth' }) }} aria-label={`Editar ${fmtDayLong(r.date)}`} className="press grid size-9 place-items-center rounded-lg border border-hair text-mute hover:text-ink">✎</button>
                  {confirmDel === r.date ? (
                    <button type="button" onClick={() => { void removeBodyWeight(r.date); setConfirmDel(null) }} onBlur={() => setConfirmDel(null)} autoFocus className="press min-h-9 rounded-lg border border-e-fail/60 px-2.5 text-xs font-semibold text-e-fail">¿Borrar?</button>
                  ) : (
                    <button type="button" onClick={() => setConfirmDel(r.date)} aria-label={`Borrar ${fmtDayLong(r.date)}`} className="press grid size-9 place-items-center rounded-lg border border-hair text-mute hover:text-e-fail">✕</button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </Page>
  )
}

/** Tarjeta de «Hoy»: peso del día (si ya está) o entrada rápida, con enlace a la evolución. */
export function WeightCard() {
  const { unit } = usePrefs()
  const rows = useBodyWeights()
  const [editing, setEditing] = useState(false)
  const todayRow = rows.find((r) => r.date === isoDate())
  const trend = useMemo(() => weightTrend(rows, 30), [rows])
  return (
    <section className="glass space-y-3 p-4" aria-label="Peso corporal">
      {todayRow && !editing ? (
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Peso de hoy</div>
            <div className="num text-3xl leading-tight">{fmtNum(fromKg(todayRow.weightKg, unit))} <span className="text-base text-mute">{unit}</span></div>
            {trend && <div className={`num text-xs ${trend.deltaKg > 0 ? 'text-signal-text' : 'text-cold'}`}>{trend.deltaKg > 0 ? '▲' : '▼'} {fmtNum(Math.abs(fromKg(trend.deltaKg, unit)))} {unit} en 30 d</div>}
          </div>
          <Button variant="ghost" onClick={() => setEditing(true)}>Cambiar</Button>
        </div>
      ) : (
        <WeightEntry compact onSaved={() => setEditing(false)} />
      )}
      <Link to="/peso" className="press inline-block text-sm font-semibold text-signal-text underline decoration-signal decoration-2 underline-offset-4">Ver evolución →</Link>
    </section>
  )
}
