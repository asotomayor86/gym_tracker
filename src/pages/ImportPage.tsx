import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ImportError, getMeasurement, importImage, saveMeasurement, takeSharedImage, type ImportReview, type OcrProgress } from '../components/body/bodyShim'
import { METRICS, type MetricKey } from '../components/body/metrics'
import { Button, Page, SectionTitle, inputCls } from '../components/ui'
import { fmtDayLong } from '../components/weight/weightFormat'
import type { BodyMeasurement } from '../lib/bodyMeasurement'
import { todayLocal } from '../lib/bodyWeight'
import { hasErrors, validate } from '../lib/measurementRules'
import type { BodyWeight } from '../lib/types'

type Status = 'detected' | 'doubtful' | 'missing'
type Draft = Record<MetricKey, { text: string; status: Status; raw?: string; reason?: string }>
type Phase = { k: 'pick' } | { k: 'reading'; progress: OcrProgress } | { k: 'review' } | { k: 'saved'; date: string }
type Choice = 'replace' | 'merge' | 'keep'

const STATUS_UI: Record<Status, { icon: string; label: string; cls: string }> = {
  detected: { icon: '✓', label: 'Detectado', cls: 'text-e-easy' },
  doubtful: { icon: '⚠', label: 'Dudoso', cls: 'text-e-close' },
  missing: { icon: '✕', label: 'No encontrado', cls: 'text-e-fail' },
}

const show = (v: number, decimals: number) => v.toFixed(decimals).replace('.', ',')
const parse = (t: string) => { const n = parseFloat(t.replace(',', '.')); return Number.isFinite(n) ? n : null }

const toDraft = (r: ImportReview): Draft =>
  Object.fromEntries(METRICS.map((m) => {
    const f = r.fields[m.key]
    return [m.key, { text: f.value == null ? '' : show(f.value, m.decimals), status: f.status, raw: f.raw, reason: f.reason }]
  })) as Draft

const ERROR_TEXT: Record<string, string> = {
  'not-recognized': 'La imagen no parece una captura de Fitdays. Prueba con la pantalla del informe de la báscula.',
  unreadable: 'No se pudo leer la imagen. Usa una captura nítida y completa.',
}

/** Importar la composición corporal desde una captura de la báscula (Fitdays): se lee en el móvil y se confirma antes de guardar. */
export default function ImportPage() {
  const [params] = useSearchParams()
  const [phase, setPhase] = useState<Phase>({ k: 'pick' })
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [existing, setExisting] = useState<BodyWeight | null>(null)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [saving, setSaving] = useState(false)
  const engineLoaded = useRef(false)
  const gal = useRef<HTMLInputElement>(null)
  const cam = useRef<HTMLInputElement>(null)
  const uid = useId()

  const run = async (file: Blob) => {
    setError('')
    setPreview((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(file) })
    setPhase({ k: 'reading', progress: { stage: engineLoaded.current ? 'reading' : 'engine', fraction: 0 } })
    try {
      const r = await importImage(file, (progress) => { if (progress.stage === 'reading') engineLoaded.current = true; setPhase({ k: 'reading', progress }) })
      engineLoaded.current = true
      setDraft(toDraft(r)); setWarnings(r.warnings); setDate(r.date ?? todayLocal()); setTime(r.time ?? ''); setChoice(null)
      setPhase({ k: 'review' })
    } catch (e) {
      setError(e instanceof ImportError ? (ERROR_TEXT[e.code] ?? e.message) : 'No se pudo leer la imagen.')
      setPhase({ k: 'pick' })
    }
  }

  // imagen recibida por «Compartir» (Share Target)
  const shared = params.get('compartido') === '1'
  useEffect(() => {
    if (!shared) return
    let live = true
    void takeSharedImage().then((f) => {
      if (!live) return
      if (f) void run(f)
      else setError('No llegó ninguna imagen compartida. Elígela desde aquí.')
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al llegar compartido
  }, [shared])

  // ¿ya hay una medición ese día?
  useEffect(() => {
    if (phase.k !== 'review' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    let live = true
    void getMeasurement(date).then((m) => { if (live) { setExisting(m ?? null); setChoice(null) } })
    return () => { live = false }
  }, [phase.k, date])

  const reset = () => { setPhase({ k: 'pick' }); setDraft(null); setError(''); setPreview((p) => { if (p) URL.revokeObjectURL(p); return null }) }

  const values = useMemo(() => {
    const v: BodyMeasurement = {}
    if (draft) for (const m of METRICS) { const n = parse(draft[m.key].text); if (n != null) v[m.key] = n }
    return v
  }, [draft])
  const issues = useMemo(() => validate(values), [values])
  const issueOf = (k: MetricKey) => issues.find((i) => i.campo === k)
  const needsWeight = values.weightKg == null && !(existing && choice === 'merge')
  const blocked = hasErrors(issues) || needsWeight
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const needsChoice = !!existing && choice === null

  const save = async () => {
    if (blocked || saving || !dateOk) return
    if (existing && choice === 'keep') { setPhase({ k: 'saved', date: existing.date }); return }
    setSaving(true); setError('')
    try {
      await saveMeasurement(date, values, { time: time || null, source: 'fitdays', mode: choice === 'replace' ? 'replace' : 'merge' })
      setPhase({ k: 'saved', date })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Inténtalo de nuevo.')
    } finally { setSaving(false) }
  }

  return (
    <Page title="Importar" eyebrow="Composición corporal" actions={<Link to="/peso" className="press inline-block rounded-full border border-hair px-4 py-2 text-sm font-semibold text-mute hover:text-ink">Peso</Link>}>
      {(phase.k === 'pick' || phase.k === 'reading') && (
        <section className="space-y-3">
          <SectionTitle n="01">Captura de la báscula</SectionTitle>
          <div className="glass space-y-4 p-4">
            <p className="text-sm text-mute">Elige la captura del informe de Fitdays. La imagen se lee en tu móvil y no se envía a ningún sitio; antes de guardar podrás revisar y corregir cada valor.</p>
            <input ref={gal} type="file" accept="image/*" className="sr-only" aria-label="Elegir imagen de la galería" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(f) }} />
            <input ref={cam} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Hacer una foto" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(f) }} />
            <div className="flex flex-wrap gap-2">
              <Button disabled={phase.k === 'reading'} onClick={() => gal.current?.click()}>Elegir imagen</Button>
              <Button variant="ghost" disabled={phase.k === 'reading'} onClick={() => cam.current?.click()}>Hacer foto</Button>
            </div>
            {phase.k === 'reading' && (
              <div role="status" className="space-y-2">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold">{phase.progress.stage === 'engine' ? 'Descargando motor (~10 MB)…' : 'Leyendo imagen…'}</span>
                  <span className="num text-xs text-mute">{Math.round(phase.progress.fraction * 100)} %</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--hair)' }}>
                  <div className="h-full rounded-full bg-gradient-to-r from-signal-2 to-signal transition-[width] duration-200" style={{ width: `${Math.max(4, phase.progress.fraction * 100)}%` }} />
                </div>
                {phase.progress.stage === 'engine' && <p className="text-xs text-mute">Solo la primera vez; luego queda guardado en el móvil.</p>}
              </div>
            )}
            {error && <p role="alert" className="rounded-xl border border-e-fail/50 bg-e-fail/10 px-3 py-2 text-sm text-e-fail">{error}</p>}
          </div>
        </section>
      )}

      {phase.k === 'review' && draft && (
        <>
          <section className="space-y-3">
            <SectionTitle n="01" aside="revisa antes de guardar">Valores leídos</SectionTitle>
            <div className="glass space-y-3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <label><span className="eyebrow">Fecha</span><input type="date" className={`${inputCls} mt-1 text-base`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
                <label><span className="eyebrow">Hora</span><input type="time" className={`${inputCls} mt-1 text-base`} value={time} onChange={(e) => setTime(e.target.value)} /></label>
              </div>
              {!dateOk && <p role="alert" className="text-sm text-e-fail">Indica una fecha válida.</p>}
              {warnings.map((w) => <p key={w} className="rounded-xl bg-e-close/10 px-3 py-2 text-xs text-e-close">⚠ {w}</p>)}
              {existing && dateOk && (
                <div role="group" aria-label="Ya existe una medición ese día" className="space-y-2 rounded-xl border border-e-close/60 bg-e-close/10 p-3">
                  <p className="text-sm"><b>Ya existe una medición del {fmtDayLong(date)}.</b> Solo se guarda una por día.</p>
                  <div className="flex flex-wrap gap-2">
                    {([['replace', 'Sustituir'], ['merge', 'Completar'], ['keep', 'Mantener la actual']] as const).map(([c, label]) => (
                      <button key={c} type="button" aria-pressed={choice === c} onClick={() => setChoice(c)}
                        className={`press min-h-10 flex-1 rounded-full border px-3 text-sm font-semibold ${choice === c ? 'border-signal bg-signal text-on-signal' : 'border-hair text-mute hover:text-ink'}`}>{label}</button>
                    ))}
                  </div>
                  <p className="text-xs text-mute">«Completar» conserva lo ya guardado y solo cambia los valores que traes.</p>
                </div>
              )}
              <ul className="divide-y divide-hair" aria-label="Indicadores">
                {METRICS.map((m) => {
                  const f = draft[m.key]
                  const issue = issueOf(m.key)
                  const weightMissing = m.key === 'weightKg' && needsWeight
                  const err = issue?.nivel === 'error' ? issue.mensaje : weightMissing ? 'El peso es obligatorio' : ''
                  const warn = issue?.nivel === 'aviso' ? issue.mensaje : ''
                  const ui = STATUS_UI[f.status]
                  const hot = f.status !== 'detected' || !!err || !!warn
                  const note = err || warn || (f.status === 'detected' ? '' : [f.reason, f.raw ? `Leí «${f.raw}»` : ''].filter(Boolean).join(' · '))
                  return (
                    <li key={m.key} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 ${hot ? '-mx-2 rounded-xl px-2 ' + (f.status === 'missing' || err ? 'bg-e-fail/5' : 'bg-e-close/10') : ''}`}>
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`${uid}-${m.key}`} className="block text-sm font-semibold leading-snug">{m.label}</label>
                        <span className={`inline-flex items-center gap-1 text-[0.7rem] font-semibold ${ui.cls}`}><span aria-hidden>{ui.icon}</span>{ui.label}</span>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <input
                          id={`${uid}-${m.key}`} inputMode="decimal" aria-invalid={!!err} aria-describedby={note ? `${uid}-${m.key}-e` : undefined}
                          className={`${inputCls} num !min-h-10 !w-28 text-right text-base ${err ? '!border-e-fail' : ''}`} value={f.text} placeholder="—"
                          onChange={(e) => setDraft({ ...draft, [m.key]: { ...f, text: e.target.value, status: e.target.value.trim() ? 'detected' : f.status === 'detected' ? 'missing' : f.status } })}
                        />
                        <span className="w-9 text-xs text-mute">{m.unit}</span>
                      </span>
                      {note && <p id={`${uid}-${m.key}-e`} role={err ? 'alert' : undefined} className={`basis-full text-xs ${err ? 'text-e-fail' : 'text-mute'}`}>{note}</p>}
                    </li>
                  )
                })}
              </ul>
              {error && <p role="alert" className="text-sm text-e-fail">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button className="flex-1" disabled={blocked || needsChoice || saving || !dateOk} onClick={() => void save()}>
                  {saving ? 'Guardando…' : existing && choice === 'keep' ? 'Descartar y mantener' : 'Guardar'}
                </Button>
                <Button variant="ghost" onClick={reset}>Cancelar</Button>
              </div>
              {needsChoice && <p className="text-xs text-mute">Elige «Sustituir», «Completar» o «Mantener la actual» para continuar.</p>}
            </div>
          </section>
          {preview && (
            <section>
              <SectionTitle n="02">Imagen</SectionTitle>
              <img src={preview} alt="Captura elegida" className="max-h-96 w-auto max-w-full rounded-2xl border border-hair" />
            </section>
          )}
        </>
      )}

      {phase.k === 'saved' && (
        <section className="glass space-y-3 p-5" role="status">
          <h2 className="display text-xl text-signal-text">✓ Medición guardada</h2>
          <p className="text-sm text-mute">{fmtDayLong(phase.date)}. Ya la tienes en las gráficas de Peso y Stats.</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/peso" className="press inline-flex min-h-11 items-center rounded-full bg-gradient-to-br from-signal to-signal-2 px-5 text-sm font-semibold text-on-signal glow">Ver evolución</Link>
            <Button variant="ghost" onClick={reset}>Importar otra</Button>
          </div>
        </section>
      )}
    </Page>
  )
}
