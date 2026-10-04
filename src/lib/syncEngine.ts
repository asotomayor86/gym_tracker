import { liveQuery, type Table } from 'dexie'
import type { GymDB } from '../db/db'
import { AuthError as ClientAuthError } from './authClient'
import { SYNC_TABLES, type SyncTable } from './syncTables'

const CURSOR_KEY = 'gym-cursor'
const LAST_SYNC_KEY = 'gym-last-sync'

/** unauth = sin sesión (los datos solo están en este dispositivo); offline = sin red, se subirá solo al volver. */
export type SyncStatus = 'unauth' | 'idle' | 'syncing' | 'ok' | 'offline' | 'error'

export interface SyncState {
  status: SyncStatus
  loggedIn: boolean
  /** Entradas del outbox: cambios locales aún sin subir. */
  pending: number
  lastSync: number | null
  online: boolean
  error: string | null
}

export interface KeyValueStore {
  get(key: string): string | null
  set(key: string, value: string): void
  del(key: string): void
}

/** Lo que el motor necesita de la sesión (la implementa authClient). */
export interface AuthPort {
  hasSession(): boolean
  /** Token de acceso vigente; lanza AuthError('network') sin red o un AuthError distinto si la sesión terminó. */
  getAccessToken(): Promise<string>
  /** Fuerza renovar el token (tras un 401 del servidor). */
  refresh(): Promise<void>
  /** Expulsa la sesión (el servidor la rechaza pese a renovar). */
  expire(): void
  subscribe(cb: () => void): () => void
}

export interface SyncDeps {
  db: GymDB
  storage: KeyValueStore
  auth: AuthPort
  fetch: typeof fetch
  isOnline: () => boolean
  /** Se ejecuta tras cada intento de sync (ok = pull correcto): reconcilia semilla/datos con lo descargado. */
  afterSync?: (ok: boolean) => Promise<unknown>
  /** Espera tras un cambio local antes de subirlo (agrupa ráfagas de guardados). */
  debounceMs?: number
  /** Esperas de reintento tras un fallo; la última se repite. */
  retryMs?: number[]
}

type Row = { id: string; updatedAt: number }
const PUSH_CHUNK = 50

class AuthError extends Error {}
class NetworkError extends Error {}

export function createSyncEngine(deps: SyncDeps) {
  const { db, storage, afterSync } = deps
  const debounceMs = deps.debounceMs ?? 3000
  const retryMs = deps.retryMs ?? [5_000, 15_000, 45_000, 120_000, 300_000]

  let phase: 'idle' | 'syncing' | 'ok' | 'offline' | 'error' = 'idle'
  let error: string | null = null
  let state: SyncState = {
    status: 'unauth', loggedIn: false, pending: 0,
    lastSync: Number(storage.get(LAST_SYNC_KEY)) || null,
    online: deps.isOnline(), error: null,
  }
  const listeners = new Set<() => void>()

  const hasToken = () => deps.auth.hasSession()
  const publish = (patch: Partial<SyncState> = {}) => {
    const loggedIn = hasToken()
    state = { ...state, ...patch, loggedIn, status: loggedIn ? phase : 'unauth', error }
    listeners.forEach((l) => l())
  }
  publish()

  const refreshPending = async () => publish({ pending: await db.outbox.count() })

  // ── programación: debounce tras cambios locales y reintentos con backoff ──
  let timer: ReturnType<typeof setTimeout> | undefined
  let failures = 0
  const schedule = (ms: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => void syncNow(), ms)
  }

  async function api(path: string, init?: RequestInit, retried = false): Promise<any> {
    let token: string
    try {
      token = await deps.auth.getAccessToken()
    } catch (e) {
      if (e instanceof ClientAuthError && e.code === 'network') throw new NetworkError('Sin conexión')
      throw new AuthError()
    }
    let res: Response
    try {
      res = await deps.fetch(path, { ...init, headers: { ...init?.headers, authorization: `Bearer ${token}`, 'content-type': 'application/json' } })
    } catch {
      throw new NetworkError('Sin conexión')
    }
    if (res.status === 401) {
      // Token de acceso caducado o revocado: se intenta renovar una vez; si el servidor sigue rechazando, la sesión terminó.
      if (!retried) {
        try {
          await deps.auth.refresh()
        } catch (e) {
          if (e instanceof ClientAuthError && e.code === 'network') throw new NetworkError('Sin conexión')
          throw new AuthError()
        }
        return api(path, init, true)
      }
      deps.auth.expire()
      throw new AuthError()
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  /** En el primer sync de este dispositivo se encola TODO lo local propio (salvo semillas sin editar). */
  async function requeueAllIfFirstSync() {
    if (storage.get(CURSOR_KEY)) return
    for (const table of SYNC_TABLES) {
      const keys = await (db[table] as Table<Row, string>).filter((r) => r.updatedAt > 1).primaryKeys()
      await db.outbox.bulkPut(keys.map((id) => ({ key: `${table}:${id}`, table, id })))
    }
  }

  async function push() {
    const outbox = await db.outbox.toArray()
    for (let i = 0; i < outbox.length; i += PUSH_CHUNK) {
      const chunk = outbox.slice(i, i + PUSH_CHUNK)
      const changes: Record<string, Row[]> = {}
      const sent = new Map<string, number>()
      for (const entry of chunk) {
        const row = await (db[entry.table] as Table<Row, string>).get(entry.id)
        if (!row) {
          await db.outbox.delete(entry.key)
          continue
        }
        const list = (changes[entry.table] ??= [])
        list.push(row)
        sent.set(entry.key, row.updatedAt)
      }
      if (!sent.size) continue
      await api('/api/sync/push', { method: 'POST', body: JSON.stringify({ changes }) })
      // Solo se descarta lo que no cambió mientras se enviaba.
      for (const entry of chunk) {
        if (!sent.has(entry.key)) continue
        const row = await (db[entry.table] as Table<Row, string>).get(entry.id)
        if (!row || row.updatedAt === sent.get(entry.key)) await db.outbox.delete(entry.key)
      }
      await refreshPending()
    }
  }

  async function pull() {
    const since = Number(storage.get(CURSOR_KEY)) || 0
    const { changes, cursor } = (await api(`/api/sync/pull?since=${since}`)) as {
      changes: Record<SyncTable, Row[]>
      cursor: number
    }
    for (const name of SYNC_TABLES) {
      const table = db[name] as Table<Row, string>
      for (const remote of changes[name] ?? []) {
        const local = await table.get(remote.id)
        if (!local || local.updatedAt < remote.updatedAt) await table.put(remote)
      }
    }
    storage.set(CURSOR_KEY, String(cursor))
  }

  let running: Promise<void> | null = null

  /** Push de la cola local y pull de cambios remotos (last-write-wins por updatedAt). */
  function syncNow(): Promise<void> {
    if (!hasToken()) return Promise.resolve()
    running ??= doSync().finally(() => (running = null))
    return running
  }

  async function doSync() {
    clearTimeout(timer)
    phase = 'syncing'
    error = null
    publish()
    try {
      await requeueAllIfFirstSync()
      await push()
      await pull()
      failures = 0
      phase = 'ok'
      const lastSync = Date.now()
      storage.set(LAST_SYNC_KEY, String(lastSync))
      publish({ lastSync })
    } catch (e) {
      if (e instanceof AuthError) {
        phase = 'idle' // sin sesión: el estado pasa a 'unauth' y el outbox se conserva
        error = null
      } else {
        const offline = e instanceof NetworkError || !deps.isOnline()
        phase = offline ? 'offline' : 'error'
        error = offline ? null : e instanceof Error ? e.message : 'Error de sincronización'
        schedule(retryMs[Math.min(failures++, retryMs.length - 1)])
      }
      publish({ online: deps.isOnline() })
    } finally {
      await afterSync?.(phase === 'ok').catch(() => {})
      await refreshPending()
      // Cambios hechos mientras se sincronizaba: se suben en la siguiente tanda.
      if (phase === 'ok' && state.pending > 0) schedule(debounceMs)
    }
  }

  /** Tras cerrar sesión o cambiar de cuenta: cancela temporizadores y limpia el estado. */
  function reset() {
    clearTimeout(timer)
    failures = 0
    phase = 'idle'
    error = null
    storage.del(LAST_SYNC_KEY)
    publish({ lastSync: null })
  }

  deps.auth.subscribe(() => {
    if (!hasToken()) clearTimeout(timer)
    publish()
  })

  // ── arranque: triggers automáticos ──
  let stop: (() => void) | undefined
  function start() {
    if (stop) return stop
    const run = () => void syncNow()
    const onOnline = () => {
      publish({ online: true })
      failures = 0
      run()
    }
    const onOffline = () => publish({ online: false })
    const onVisible = () => document.visibilityState === 'visible' && run()
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    // Cada cambio local (save() escribe en el outbox) dispara un sync con debounce.
    const sub = liveQuery(() => db.outbox.count()).subscribe({
      next: (pending) => {
        publish({ pending })
        if (pending > 0 && hasToken() && phase !== 'syncing') schedule(debounceMs)
      },
      error: () => {},
    })
    const interval = setInterval(() => document.visibilityState === 'visible' && state.pending > 0 && run(), 60_000)
    run()
    stop = () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      sub.unsubscribe()
      clearInterval(interval)
      clearTimeout(timer)
      stop = undefined
    }
    return stop
  }

  return {
    getState: () => state,
    subscribe: (cb: () => void) => {
      listeners.add(cb)
      return () => void listeners.delete(cb)
    },
    hasToken,
    /** Con sesión iniciada pero sin ningún pull aún, conviene esperar al servidor antes de sembrar (evita duplicados). */
    awaitsFirstSync: () => hasToken() && !storage.get(CURSOR_KEY),
    syncNow, start, reset,
  }
}
