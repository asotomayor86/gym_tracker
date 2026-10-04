import { useEffect, useState } from 'react'
import { beep, unlockAudio } from '../lib/restAudio'

export interface Rest { id: number; until: number; total: number; label: string }

const MUTE_KEY = 'gt.restMute'
const readMuted = () => { try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false } }

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * Cronómetro de descanso: panel fijo arriba (≈50 % de la pantalla) con cifras enormes y anillo de progreso. Cambia de color
 * a menos de 10 s y al llegar a 0 (vibración + pitido corto opcional), mantiene la pantalla encendida mientras corre y se
 * pliega a un contador pequeño al tocarlo o unos segundos después de llegar a 0. El contenido de la sesión queda debajo.
 */
export function RestTimer({ rest, onAdjust, onClose }: { rest: Rest; onAdjust: (deltaS: number) => void; onClose: () => void }) {
  const { until, total, label } = rest
  const [now, setNow] = useState(() => Date.now())
  const [collapsed, setCollapsed] = useState(false)
  const [muted, setMuted] = useState(readMuted)
  const left = Math.max(0, Math.ceil((until - now) / 1000))
  const done = left === 0
  const soon = !done && left < 10

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [until])

  // avisos: pitidos en 3-2-1 y al llegar a 0 (más largo + vibración)
  useEffect(() => {
    if (left >= 1 && left <= 3 && !muted) beep(660, 90)
    if (left === 0) {
      navigator.vibrate?.([300, 120, 300, 120, 300])
      if (!muted) { beep(880, 160); beep(1175, 260, 210) }
    }
  }, [left]) // eslint-disable-line react-hooks/exhaustive-deps -- solo suena al cambiar el segundo

  // al llegar a 0 se pliega solo a los pocos segundos
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setCollapsed(true), 6000)
    return () => clearTimeout(t)
  }, [done])

  // pantalla encendida mientras cuenta
  useEffect(() => {
    if (done || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const take = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then((l) => { if (cancelled) void l.release(); else lock = l }).catch(() => { /* denegado: no pasa nada */ })
    }
    take()
    document.addEventListener('visibilitychange', take)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', take); void lock?.release() }
  }, [done])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    try { localStorage.setItem(MUTE_KEY, next ? '1' : '0') } catch { /* sin almacenamiento */ }
    if (!next) { unlockAudio(); beep(660, 90) }
  }

  const tone = done ? 'text-e-easy' : soon ? 'text-e-close' : 'text-signal-text'
  const stroke = done ? 'var(--e-easy)' : soon ? 'var(--e-close)' : 'var(--signal)'
  const frac = done ? 1 : Math.min(1, Math.max(0, 1 - (until - now) / (Math.max(1, total) * 1000)))
  const R = 46
  const C = 2 * Math.PI * R

  if (collapsed) {
    return (
      <div className="fixed right-3 top-[calc(0.75rem+env(safe-area-inset-top,0px))] z-40 flex items-center gap-1 rounded-full border border-hair bg-surface/95 p-1 shadow-[0_8px_24px_rgb(0_0_0/0.35)]" style={{ borderColor: stroke }}>
        <button onClick={() => setCollapsed(false)} aria-label={`Descanso: ${done ? 'terminado' : fmt(left)}. Ampliar`} className="press flex min-h-11 items-center gap-2 rounded-full px-4">
          <span aria-hidden className={`size-2.5 rounded-full ${done ? 'bg-e-easy' : soon ? 'bg-e-close' : 'bg-signal'}`} />
          <span className={`display text-xl tabular-nums ${tone}`}>{done ? '¡Ya!' : fmt(left)}</span>
        </button>
        <button onClick={onClose} aria-label="Cerrar descanso" className="press grid size-11 place-items-center rounded-full text-mute hover:text-ink">✕</button>
      </div>
    )
  }

  const btn = 'press min-h-14 flex-1 rounded-2xl border border-hair bg-ink/5 px-2 text-lg font-semibold hover:bg-ink/10 sm:text-xl'
  return (
    <>
      <div aria-hidden className="h-[50dvh]" />
      <section
        role="timer" aria-label="Descanso"
        className={`fixed inset-x-0 top-0 z-40 flex h-[50dvh] flex-col gap-2 border-b bg-surface/97 px-4 pb-3 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] shadow-[0_12px_40px_rgb(0_0_0/0.45)] backdrop-blur-xl [@media(orientation:landscape)_and_(max-height:500px)]:flex-row [@media(orientation:landscape)_and_(max-height:500px)]:items-center [@media(orientation:landscape)_and_(max-height:500px)]:gap-4 ${done ? 'rest-done' : soon ? 'rest-soon' : ''}`}
        style={{ borderColor: stroke }}
      >
        <div className="flex min-w-0 items-center gap-2 [@media(orientation:landscape)_and_(max-height:500px)]:hidden">
          <span className={`eyebrow min-w-0 flex-1 truncate ${done ? '!text-e-easy' : ''}`}>{done ? '¡Siguiente serie!' : 'Descanso'} · {label}</span>
          <button onClick={toggleMute} aria-pressed={!muted} aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'} className="press grid size-10 place-items-center rounded-full border border-hair text-base">{muted ? '🔇' : '🔊'}</button>
          <button onClick={() => setCollapsed(true)} aria-label="Plegar a contador pequeño" className="press grid size-10 place-items-center rounded-full border border-hair text-mute hover:text-ink">▲</button>
        </div>

        <div className="relative mx-auto grid min-h-0 w-full flex-1 place-items-center [@media(orientation:landscape)_and_(max-height:500px)]:h-full [@media(orientation:landscape)_and_(max-height:500px)]:w-48 [@media(orientation:landscape)_and_(max-height:500px)]:flex-none">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--hair)" strokeWidth="3" />
            <circle cx="50" cy="50" r={R} fill="none" stroke={stroke} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 50 50)" style={{ transition: 'stroke-dashoffset 0.3s linear, stroke 0.3s' }} />
          </svg>
          <div className={`rest-digits display relative tabular-nums leading-none ${tone} ${done ? 'rest-pulse' : ''}`} style={{ fontSize: done ? 'min(16vw, 8dvh)' : 'min(21vw, 10dvh)' }}>
            {done ? '¡YA!' : fmt(left)}
          </div>
        </div>

        <div className="flex gap-2 [@media(orientation:landscape)_and_(max-height:500px)]:w-72 [@media(orientation:landscape)_and_(max-height:500px)]:flex-col">
          <div className="hidden min-w-0 [@media(orientation:landscape)_and_(max-height:500px)]:block">
            <div className={`eyebrow truncate ${done ? '!text-e-easy' : ''}`}>{done ? '¡Siguiente serie!' : 'Descanso'}</div>
            <div className="truncate text-sm">{label}</div>
          </div>
          <div className="flex flex-1 gap-2">
            <button onClick={() => onAdjust(-15)} className={btn} aria-label="Restar 15 segundos">−15 s</button>
            <button onClick={() => onAdjust(15)} className={btn} aria-label="Sumar 15 segundos">+15 s</button>
            <button onClick={onClose} className={`${btn} !border-signal !bg-signal !text-on-signal`}>Saltar</button>
          </div>
        </div>
      </section>
    </>
  )
}
