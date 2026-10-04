import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import { saveTo, type GymDB } from '../db/db'

export interface Prefs {
  /** La app trabaja SOLO en kilogramos: siempre 'kg' (se conserva el campo por compatibilidad con clientes y datos antiguos). */
  unit: 'kg'
  incrementKg: number
  /** Gimnasio habitual (catálogo global); null = ninguno (no se filtra). */
  gymId: string | null
}

const KEY = 'gym-prefs'
const DEFAULTS: Prefs = { unit: 'kg', incrementKg: 2.5, gymId: null }
let bound: GymDB | null = null
const listeners = new Set<() => void>()
let cache: Prefs | null = null

/**
 * Normaliza unas preferencias de cualquier origen (localStorage, sync, clientes antiguos): la unidad es SIEMPRE 'kg'
 * (un 'lb' guardado o recibido se ignora; el incremento ya está en kg), el incremento debe ser positivo y gymId texto o null.
 */
export function normalizePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const inc = typeof r.incrementKg === 'number' && Number.isFinite(r.incrementKg) && r.incrementKg > 0 ? r.incrementKg : DEFAULTS.incrementKg
  return { unit: 'kg', incrementKg: inc, gymId: typeof r.gymId === 'string' && r.gymId ? r.gymId : null }
}

function read(): Prefs {
  if (cache) return cache
  try {
    cache = normalizePrefs(JSON.parse(localStorage.getItem(KEY) ?? '{}'))
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache
}

export const getPrefs = read

const PREFS_ID = 'prefs'

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* sin almacenamiento: se mantiene en memoria */
  }
  listeners.forEach((l) => l())
}

export function setPrefs(patch: Partial<Prefs>) {
  cache = normalizePrefs({ ...read(), ...patch }) // 'unit' nunca cambia: siempre kg
  persist()
  // Con la base enlazada, las preferencias también viajan por sync (tabla user_prefs, una fila 'prefs').
  if (bound) {
    const { unit, incrementKg, gymId } = cache
    void saveTo(bound, 'userPrefs', { id: PREFS_ID, unit, incrementKg, gymId }).catch(() => {})
  }
}

/** Crea la fila de preferencias si no existe (solo debe llamarse tras un pull: evita pisar las de otro dispositivo). */
export async function ensurePrefsRow(d: GymDB) {
  if (await d.userPrefs.get(PREFS_ID)) return
  const { unit, incrementKg, gymId } = read()
  await saveTo(d, 'userPrefs', { id: PREFS_ID, unit, incrementKg, gymId })
}

/** Enlaza las preferencias con la tabla sincronizada: los cambios que llegan de otro dispositivo actualizan la caché. */
export function bindPrefsToDb(d: GymDB) {
  bound = d
  if (typeof indexedDB === 'undefined') return
  liveQuery(() => d.userPrefs.get(PREFS_ID)).subscribe({
    next: (row) => {
      if (!row || row.deletedAt) return
      const next = normalizePrefs(row) // un 'lb' recibido de un cliente antiguo se ignora
      const cur = read()
      if (cur.unit === next.unit && cur.incrementKg === next.incrementKg && cur.gymId === next.gymId) return
      cache = next
      persist()
    },
    error: () => {},
  })
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    read,
  )
}
