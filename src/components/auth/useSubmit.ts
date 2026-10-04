import { useState, type FormEvent } from 'react'
import { authMessage } from './authShim'

/** Envoltorio de formulario con estado: ocupado, error y reintento. */
export function useSubmit(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (e?: FormEvent) => {
    e?.preventDefault()
    setError(''); setBusy(true)
    try { await action() } catch (err) { setError(authMessage(err)) } finally { setBusy(false) }
  }
  return { busy, error, run, setError }
}

