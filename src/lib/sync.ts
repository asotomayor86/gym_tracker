import { useSyncExternalStore } from 'react'
import { db } from '../db/db'
import { ensureSeed } from './ensureSeed'
import { createSyncEngine, type KeyValueStore } from './syncEngine'

export type { SyncState, SyncStatus } from './syncEngine'

const store: KeyValueStore = {
  get: (k) => {
    try { return localStorage.getItem(k) } catch { return null }
  },
  set: (k, v) => {
    try { localStorage.setItem(k, v) } catch { /* ignorar */ }
  },
  del: (k) => {
    try { localStorage.removeItem(k) } catch { /* ignorar */ }
  },
}

const engine = createSyncEngine({
  db,
  storage: store,
  fetch: (...a) => fetch(...a),
  isOnline: () => navigator.onLine,
  afterSync: (ok) => ensureSeed({ merge: ok }),
})

export const useSyncState = () => useSyncExternalStore(engine.subscribe, engine.getState)
export const { hasToken, awaitsFirstSync, login, logout, syncNow } = engine
export const startAutoSync = () => void engine.start()
