import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Button, inputCls } from './ui'
import { createTemplateFromSession, defaultTemplateName } from '../lib/templateFromSession'

/** Botón «Crear rutina» + hoja con el nombre. Copia la sesión a una rutina nueva y abre su editor. */
export function CreateRoutineButton({ sessionId, startedAt, className = '', label = 'Crear rutina' }: { sessionId: string; startedAt: number; className?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" className={`!min-h-10 px-4 text-xs ${className}`} onClick={() => setOpen(true)}>{label}</Button>
      {open && <CreateRoutineSheet sessionId={sessionId} startedAt={startedAt} onClose={() => setOpen(false)} />}
    </>
  )
}

function CreateRoutineSheet({ sessionId, startedAt, onClose }: { sessionId: string; startedAt: number; onClose: () => void }) {
  const navigate = useNavigate()
  const placeholder = defaultTemplateName(startedAt)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const id = useId()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const tid = await createTemplateFromSession(sessionId, name.trim() || placeholder)
      navigate(`/templates/${tid}`, { state: { created: true } })
    } catch (e) {
      setError(e instanceof RangeError ? e.message : 'No se pudo crear la rutina. Inténtalo de nuevo.')
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
      <form
        role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}
        className="glass w-full max-w-md space-y-4 rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:rounded-b-[20px]"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); void submit() }}
      >
        <div>
          <h2 id={`${id}-t`} className="display text-xl">Crear rutina</h2>
          <p className="mt-1 text-sm text-mute">Copia los ejercicios de esta sesión, en su orden, con las series, repeticiones y peso que hiciste.</p>
        </div>
        <label className="block">
          <span className="eyebrow">Nombre</span>
          <input ref={input} className={`${inputCls} mt-1 text-base`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={placeholder} />
        </label>
        {error && <p role="alert" className="text-sm text-e-fail">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={busy}>{busy ? 'Creando…' : 'Crear rutina'}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
