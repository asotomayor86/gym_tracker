import { useSyncExternalStore } from 'react'
import type { Unit } from './units'

export interface Prefs {
  unit: Unit
  incrementKg: number
}

const KEY = 'gym-prefs'
const DEFAULTS: Prefs = { unit: 'kg', incrementKg: 2.5 }
const listeners = new Set<() => void>()
let cache: Prefs | null = null

function read(): Prefs {
  if (cache) return cache
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    cache = DEFAULTS
  }
  return cache!
}

export const getPrefs = read

export function setPrefs(patch: Partial<Prefs>) {
  cache = { ...read(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* sin almacenamiento: se mantiene en memoria */
  }
  listeners.forEach((l) => l())
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
