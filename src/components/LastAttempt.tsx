import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, NameEn } from './ui'
import { alive, db } from '../db/db'
import { exerciseAttempts, type AttemptSuggestion, type EffortSummary } from '../lib/attempts'
import { usePrefs } from '../lib/prefs'
import { EFFORT_LABELS, type Effort } from '../lib/types'
import { fmtKg, roundHalf } from './weight/weightFormat'

const EFFORTS: Effort[] = ['easy_done', 'hard_done', 'failed_close', 'failed']
/** Icono + color por esfuerzo (igual que en la sesión): la información no depende solo del color. */
const ICON: Record<Effort, string> = { easy_done: '✓', hard_done: '●', failed_close: '▲', failed: '✕' }
const DOT: Record<Effort, string> = { easy_done: 'bg-e-easy', hard_done: 'bg-e-hard', failed_close: 'bg-e-close', failed: 'bg-e-fail' }
const TEXT: Record<Effort, string> = { easy_done: 'text-e-easy', hard_done: 'text-signal-text', failed_close: 'text-e-close', failed: 'text-e-fail' }
const ACTION: Record<AttemptSuggestion['action'], string> = { subir: 'Subir', mantener: 'Mantener', bajar: 'Bajar', repetir: 'Repetir' }
const ACTION_ICON: Record<AttemptSuggestion['action'], string> = { subir: '↑', mantener: '＝', bajar: '↓', repetir: '↻' }

const dayStart = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }
const ago = (ms: number) => {
  const n = Math.round((dayStart(Date.now()) - dayStart(ms)) / 86_400_000)
  return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`
}
const longDate = (ms: number) => new Date(ms).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
const shortDate = (ms: number) => new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace(/\./g, '')

const IconHistory = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7.5V12l3 2" />
  </svg>
)

export interface ApplyValues { weightKg: number; reps: number }

/**
 * Botón «Último intento»: abre una ventana con la última vez que se hizo el ejercicio (series, esfuerzo), la sugerencia
 * y el historial corto. `onApply` (opcional) aplica la sugerencia y devuelve cuántas series/filas actualizó.
 */
export function LastAttemptButton({ exerciseId, exerciseName, exerciseNameEn, excludeSessionId, onApply, iconOnly, className = '' }: {
  exerciseId: string; exerciseName: string; exerciseNameEn?: string; excludeSessionId?: string; onApply?: (v: ApplyValues) => Promise<number | void> | number | void; iconOnly?: boolean; className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)} aria-label={`Último intento de ${exerciseName}`}
        className={`press inline-flex items-center justify-center gap-1.5 rounded-full border border-hair text-xs font-semibold text-mute hover:text-ink ${iconOnly ? 'size-10' : 'min-h-10 px-3.5'} ${className}`}
      >
        <IconHistory />{!iconOnly && 'Último intento'}
      </button>
      {open && <AttemptSheet exerciseId={exerciseId} exerciseName={exerciseName} exerciseNameEn={exerciseNameEn} excludeSessionId={excludeSessionId} onApply={onApply} onClose={() => setOpen(false)} />}
    </>
  )
}

function AttemptSheet({ exerciseId, exerciseName, exerciseNameEn, excludeSessionId, onApply, onClose }: {
  exerciseId: string; exerciseName: string; exerciseNameEn?: string; excludeSessionId?: string; onApply?: (v: ApplyValues) => Promise<number | void> | number | void; onClose: () => void
}) {
  const { incrementKg } = usePrefs()
  const id = useId()
  const logs = useLiveQuery(() => db.setLogs.where('exerciseId').equals(exerciseId).filter(alive).toArray(), [exerciseId])
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const [applied, setApplied] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const a = useMemo(() => (logs && sessions ? exerciseAttempts(logs, sessions, exerciseId, { excludeSessionId, incrementKg, limit: 5 }) : null), [logs, sessions, exerciseId, excludeSessionId, incrementKg])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const w = fmtKg
  const apply = async () => {
    if (!a?.suggestion || !onApply || busy) return
    setBusy(true)
    const n = await onApply({ weightKg: a.suggestion.weightKg, reps: a.suggestion.reps })
    setBusy(false)
    setApplied(typeof n === 'number' ? (n === 0 ? 'No había series pendientes que cambiar' : `Aplicado a ${n} ${n === 1 ? 'serie' : 'series'}`) : 'Aplicado')
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}
        className="glass max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:rounded-b-[20px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Último intento</div>
            <h2 id={`${id}-t`} className="display text-lg leading-snug">{exerciseName}</h2>
            <NameEn className="text-sm">{exerciseNameEn}</NameEn>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="press grid size-10 shrink-0 place-items-center rounded-full border border-hair text-mute hover:text-ink">✕</button>
        </div>

        {!a && <p className="py-6 text-center text-sm text-mute">Cargando…</p>}
        {a && !a.last && <p className="rounded-xl bg-ink/5 px-4 py-6 text-center text-sm text-mute">Aún no has hecho este ejercicio.</p>}

        {a?.last && (
          <>
            <div>
              <div className="font-semibold">{ago(a.last.date)} <span className="font-normal text-mute">· {longDate(a.last.date)}</span></div>
              <table className="mt-2 w-full text-sm">
                <thead className="eyebrow text-left"><tr><th className="py-1 font-medium">Serie</th><th className="py-1 text-right font-medium">Peso</th><th className="py-1 text-right font-medium">Reps</th><th className="py-1 pl-4 font-medium">Esfuerzo</th></tr></thead>
                <tbody className="divide-y divide-hair">
                  {a.last.sets.map((s, i) => (
                    <tr key={i}>
                      <td className="num py-2 text-mute">{String(i + 1).padStart(2, '0')}</td>
                      <td className="num py-2 text-right">{w(s.weightKg)}</td>
                      <td className="num py-2 text-right">{s.reps}</td>
                      <td className={`py-2 pl-4 font-semibold ${TEXT[s.effort]}`}>
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden className={`grid size-4 place-items-center rounded-full text-[0.62rem] leading-none text-e-easy-ink ${DOT[s.effort]}`}>{ICON[s.effort]}</span>{EFFORT_LABELS[s.effort]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-mute">
                Mejor: <b className="text-ink">{w(a.last.topWeightKg)} × {a.last.bestReps}</b> · <EffortLine s={a.last.effortSummary} />
              </p>
            </div>

            {a.suggestion && (
              <div className="space-y-3 rounded-2xl border border-signal/50 bg-signal/10 p-4">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-signal text-lg font-bold text-on-signal">{ACTION_ICON[a.suggestion.action]}</span>
                  <div className="min-w-0">
                    <div className="font-semibold">Sugerencia: {ACTION[a.suggestion.action].toLowerCase()} — {w(a.suggestion.weightKg)} × {a.suggestion.reps}</div>
                    <div className="text-xs text-mute">{a.suggestion.reason}</div>
                  </div>
                </div>
                {onApply && (applied
                  ? <p role="status" className="text-sm font-semibold text-signal-text">✓ {applied}</p>
                  : <Button className="w-full" disabled={busy} onClick={() => void apply()}>Aplicar a las series</Button>)}
              </div>
            )}

            {a.history.length > 1 && <Trend history={a.history} />}
          </>
        )}
        <Button variant="ghost" className="w-full" onClick={onClose}>Cerrar</Button>
      </div>
    </div>,
    document.body,
  )
}

function EffortLine({ s }: { s: EffortSummary }) {
  const parts = EFFORTS.filter((e) => s[e] > 0)
  return (
    <>
      {parts.map((e, i) => (
        <span key={e}>{i > 0 && ' · '}<span className={`font-semibold ${TEXT[e]}`}>{s[e]} {EFFORT_LABELS[e].toLowerCase()}</span></span>
      ))}
    </>
  )
}

/** Mejor peso por intento, del más antiguo al más reciente. */
function Trend({ history }: { history: { date: number; topWeightKg: number; bestReps: number }[] }) {
  const items = [...history].reverse()
  const vals = items.map((h) => roundHalf(h.topWeightKg))
  const max = Math.max(...vals, 1)
  return (
    <div>
      <div className="eyebrow">Últimos {items.length} intentos · mejor peso</div>
      <ol className="mt-2 flex items-end gap-2" style={{ height: '6.5rem' }}>
        {items.map((h, i) => (
          <li key={h.date} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1 text-center">
            <span className="num truncate text-xs font-semibold">{vals[i]}</span>
            <span className={`block w-full rounded-t-md ${i === items.length - 1 ? 'bg-signal' : 'bg-ink/25'}`} style={{ height: `${Math.max(8, (vals[i] / max) * 62)}%` }} />
            <span className="truncate text-[0.62rem] text-mute">{shortDate(h.date)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
