import { useSyncExternalStore } from 'react'
import { db } from '../db/db'
import { createAccount } from './account'
import { createAuthClient } from './authClient'
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

const realFetch: typeof fetch = (...a) => fetch(...a)

export const authClient = createAuthClient({ storage: store, fetch: realFetch })
// La sesión de la versión anterior (contraseña compartida) ya no vale: se descarta y el dispositivo queda como "heredado".
const hadLegacyToken = authClient.dropLegacyToken()

const engine = createSyncEngine({
  db,
  storage: store,
  fetch: realFetch,
  isOnline: () => navigator.onLine,
  auth: {
    hasSession: authClient.hasSession,
    getAccessToken: authClient.getAccessToken,
    refresh: authClient.refresh,
    expire: () => authClient.clear('session_expired'),
    subscribe: authClient.subscribe,
  },
  afterSync: (ok) => ensureSeed({ merge: ok }),
})

export const account = createAccount({
  db,
  storage: store,
  auth: authClient,
  syncNow: engine.syncNow,
  resetSync: engine.reset,
  afterWipe: () => ensureSeed({ merge: false }),
  hadLegacyToken,
})
void account.init()

export const useSyncState = () => useSyncExternalStore(engine.subscribe, engine.getState)
export const { hasToken, awaitsFirstSync, syncNow } = engine
export const startAutoSync = () => void engine.start()

/** @deprecated Solo para compilar las pantallas antiguas hasta que la UI use useAuth(): la contraseña compartida ya no existe. */
export const login = (_password: string): Promise<void> => Promise.reject(new Error('Inicio de sesión obsoleto: usa useAuth().login(correo, contraseña)'))
/** @deprecated Usa useAuth().logout(). */
export const logout = () => void account.logout()
