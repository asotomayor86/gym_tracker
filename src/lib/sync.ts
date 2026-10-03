import { useSyncExternalStore } from 'react'
import { db } from '../db/db'
import { SYNC_TABLES, type SyncTable } from './syncTables'
import type { Table } from 'dexie'

const TOKEN_KEY = 'gym-token'
const CURSOR_KEY = 'gym-cursor'

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'unauth'
interface State {
  status: SyncStatus
  lastSync: number | null
  error: string | null
}

let state: State = { status: 'idle', lastSync: null, error: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const useSyncState = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )

const store = {
  get: (k: string) => {
    try { return localStorage.getItem(k) } catch { return null }
  },
  set: (k: string, v: string) => {
    try { localStorage.setItem(k, v) } catch { /* ignorar */ }
  },
  del: (k: string) => {
    try { localStorage.removeItem(k) } catch { /* ignorar */ }
  },
}

export const hasToken = () => !!store.get(TOKEN_KEY)

export async function login(password: string): Promise<void> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) throw new Error(res.status === 401 ? 'Contraseña incorrecta' : 'No se pudo conectar')
  store.set(TOKEN_KEY, (await res.json()).token)
  await syncNow()
}

export function logout() {
  store.del(TOKEN_KEY)
  set({ status: 'idle', error: null })
}

class AuthError extends Error {}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { ...init?.headers, authorization: `Bearer ${store.get(TOKEN_KEY)}`, 'content-type': 'application/json' },
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

let running: Promise<void> | null = null

/** Push de la cola local y pull de cambios remotos (last-write-wins por updatedAt). */
export function syncNow(): Promise<void> {
  if (!hasToken()) return Promise.resolve()
  running ??= doSync().finally(() => (running = null))
  return running
}

async function doSync() {
  set({ status: 'syncing', error: null })
  try {
    const outbox = await db.outbox.toArray()
    if (outbox.length) {
      const changes: Record<string, unknown[]> = {}
      const sent = new Map<string, number>()
      for (const entry of outbox) {
        const row = await (db[entry.table] as Table<{ id: string; updatedAt: number }, string>).get(entry.id)
        if (!row) continue
        ;(changes[entry.table] ??= []).push(row)
        sent.set(entry.key, row.updatedAt)
      }
      await api('/api/sync/push', { method: 'POST', body: JSON.stringify({ changes }) })
      // Solo se descarta lo que no cambió mientras se enviaba.
      for (const entry of outbox) {
        const row = await (db[entry.table] as Table<{ updatedAt: number }, string>).get(entry.id)
        if (!row || row.updatedAt === sent.get(entry.key)) await db.outbox.delete(entry.key)
      }
    }

    const since = Number(store.get(CURSOR_KEY)) || 0
    const { changes, cursor } = (await api(`/api/sync/pull?since=${since}`)) as {
      changes: Record<SyncTable, { id: string; updatedAt: number }[]>
      cursor: number
    }
    for (const name of SYNC_TABLES) {
      const table = db[name] as Table<{ id: string; updatedAt: number }, string>
      for (const remote of changes[name] ?? []) {
        const local = await table.get(remote.id)
        if (!local || local.updatedAt < remote.updatedAt) await table.put(remote)
      }
    }
    store.set(CURSOR_KEY, String(cursor))
    set({ status: 'ok', lastSync: Date.now() })
  } catch (e) {
    if (e instanceof AuthError) {
      store.del(TOKEN_KEY)
      set({ status: 'unauth', error: 'Sesión caducada' })
    } else {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Error de sincronización' })
    }
  }
}

/** Sincroniza al arrancar, al volver la red y al volver a la pestaña. */
export function startAutoSync() {
  const run = () => void syncNow()
  window.addEventListener('online', run)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run())
  run()
}
