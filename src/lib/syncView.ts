import { useEffect, useState } from 'react'
import { useSyncState } from './sync'

/**
 * Estado de sincronización listo para pintar, derivado de useSyncState (sesión, cola pendiente, red, estado).
 */
export type SyncKind = 'nosession' | 'syncing' | 'offline' | 'error' | 'pending' | 'synced'

export function useSyncView() {
  const { loggedIn, pending, online, status, lastSync, error } = useSyncState()
  const kind: SyncKind = !loggedIn ? 'nosession'
    : status === 'syncing' ? 'syncing'
      : !online ? 'offline'
        : status === 'error' ? 'error'
          : pending > 0 ? 'pending'
            : 'synced'
  return { kind, loggedIn, pending, online, status, lastSync, error }
}

/** "hace 3 min" que se refresca solo. */
export function useAgo(ts: number | null): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000)
    return () => clearInterval(t)
  }, [])
  if (!ts) return 'aún no'
  const m = Math.max(0, Math.round((now - ts) / 60000))
  if (m < 1) return 'hace un momento'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  return h < 24 ? `hace ${h} h` : new Date(ts).toLocaleDateString()
}

export const pendingText = (n: number) => (n === 1 ? '1 cambio pendiente' : `${n} cambios pendientes`)
