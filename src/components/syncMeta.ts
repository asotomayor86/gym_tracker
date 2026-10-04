import { pendingText, type SyncKind } from '../lib/syncView'

/* ---------- Iconos ---------- */
export const ICON: Record<SyncKind, string> = {
  synced: 'M5 12.5l4.5 4.5L19 7.5',
  pending: 'M12 5v7l4 2.5M12 21a9 9 0 100-18 9 9 0 000 18z',
  syncing: 'M20 12a8 8 0 11-2.3-5.6M20 4v4h-4',
  offline: 'M3 3l18 18M8.5 8.5A6 6 0 006 13h-.5a3.5 3.5 0 000 7H17M10 5.2A6 6 0 0118 11h.5a3.5 3.5 0 011.9 6.4',
  error: 'M12 8v5M12 17h.01M12 3l10 18H2z',
  nosession: 'M4 4l16 16M12 12a4 4 0 10-4-4M5 20a7 7 0 0111-5.6',
}
export const LABEL: Record<SyncKind, (n: number) => string> = {
  synced: () => 'Sincronizado',
  pending: (n) => `${n} pendiente${n === 1 ? '' : 's'}`,
  syncing: () => 'Sincronizando…',
  offline: () => 'Sin conexión',
  error: () => 'Error de sync',
  nosession: () => 'Sin sesión',
}
export const DESC: Record<SyncKind, (n: number) => string> = {
  synced: () => 'Todo sincronizado con la nube',
  pending: (n) => `${pendingText(n)} de subir`,
  syncing: () => 'Sincronizando con la nube',
  offline: (n) => `Sin conexión${n ? `: ${pendingText(n)}, se subirán solos al volver la red` : '; se sincronizará solo al volver la red'}`,
  error: () => 'No se pudo sincronizar; se reintentará solo',
  nosession: (n) => `Sin sesión: tus entrenos solo están en este dispositivo${n ? ` (${pendingText(n)})` : ''}`,
}
export const TONE: Record<SyncKind, string> = {
  synced: 'border-hair text-mute',
  pending: 'border-signal/60 text-signal-text',
  syncing: 'border-hair text-ink',
  offline: 'border-hair text-cold',
  error: 'border-e-fail/60 text-e-fail',
  nosession: 'border-signal bg-signal text-on-signal',
}

export const kindTone = TONE
export const kindLabel = (k: SyncKind, n: number) => LABEL[k](n)
export const kindDesc = (k: SyncKind, n: number) => DESC[k](n)
