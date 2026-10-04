import { useSyncExternalStore } from 'react'
import { liveQuery } from 'dexie'
import { alive, db } from '../db/db'

/**
 * Actualización de la PWA. El service worker generado se activa solo (skipWaiting + clientsClaim), así que cualquier
 * versión nueva toma el control en cuanto se descarga; lo que gestionamos aquí es CUÁNDO recargar la página:
 *  - sin entrenamiento en curso → se recarga al momento (la versión nueva aparece sola);
 *  - con un entrenamiento en curso → aviso «Nueva versión lista» y se recarga al terminar o cuando el usuario quiera.
 * También se busca actualización al abrir, al volver a primer plano, al recuperar la red y cada 20 minutos.
 */
export const APP_VERSION = { commit: __APP_COMMIT__, builtAt: __APP_BUILT_AT__ }

type State = { ready: boolean }
let state: State = { ready: false }
const subs = new Set<() => void>()
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((l) => l()) }
export const useUpdateReady = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => state).ready

let registration: ServiceWorkerRegistration | null = null
let workoutActive = false
let reloading = false

/** Recarga la página para estrenar la versión nueva (una sola vez). */
export function reloadNow() {
  if (reloading) return
  reloading = true
  location.reload()
}

function onNewVersion() {
  if (workoutActive) set({ ready: true })
  else reloadNow()
}

/** Busca una versión nueva. 'latest' = ya estás en la última; 'updating' = hay una nueva y se aplicará; 'error' = no se pudo comprobar. */
export async function checkForUpdate(): Promise<'latest' | 'updating' | 'error'> {
  if (!registration) return 'error'
  try {
    await registration.update()
    if (registration.waiting) { registration.waiting.postMessage({ type: 'SKIP_WAITING' }); return 'updating' }
    if (registration.installing) return 'updating'
    return 'latest'
  } catch {
    return 'error'
  }
}

export function startUpdates() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  // ¿hay un entrenamiento en curso? (sesión sin cerrar)
  liveQuery(() => db.sessions.filter((s) => alive(s) && !s.endedAt).count()).subscribe({
    next: (n) => {
      workoutActive = n > 0
      if (!workoutActive && state.ready) reloadNow() // terminó el entreno y había una versión esperando
    },
    error: () => { workoutActive = false },
  })
  const hadController = !!navigator.serviceWorker.controller
  let first = !hadController // el primer control tras instalar por primera vez no es una actualización
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (first) { first = false; return }
    onNewVersion()
  })
  const register = () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      registration = reg
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }) // un worker en espera de una versión anterior
      void checkForUpdate()
    }).catch(() => { /* sin SW la app sigue funcionando en línea */ })
  }
  // el módulo puede ejecutarse después de 'load': se registra ya si la página está cargada
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register)
  const again = () => { if (document.visibilityState === 'visible') void checkForUpdate() }
  document.addEventListener('visibilitychange', again)
  window.addEventListener('online', again)
  setInterval(again, 20 * 60_000)
}
