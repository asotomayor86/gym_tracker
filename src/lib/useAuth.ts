import { useMemo, useSyncExternalStore } from 'react'
import { account, authClient, useSyncState } from './sync'
import type { AccountState } from './account'

export { AuthError, validatePassword } from './authClient'
export type { AuthErrorCode, AuthUser, Role } from './authClient'
export type { AuthNotice } from './account'
export type InviteCheck = { valid: true } | { valid: false; reason: 'expired' | 'used' | 'invalid' }

export interface Auth extends AccountState {
  /** Nº de cambios locales sin subir (outbox), para el aviso de cambio de cuenta. */
  pendingChanges: number
  login(email: string, password: string): Promise<void>
  registerWithInvite(code: string, email: string, password: string, displayName?: string): Promise<void>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  logout(): Promise<void>
  logoutAll(): Promise<void>
  /** Tras notice 'other-account': vacía lo local, completa el login y empieza a sincronizar. Para cancelar: logout(). */
  confirmAccountSwitch(): Promise<void>
}

/** Comprueba una invitación antes de registrarse (sin red devuelve error 'network'). */
export const checkInvite = (code: string): Promise<InviteCheck> => account.checkInvite(code)

const actions = {
  login: account.login,
  registerWithInvite: account.registerWithInvite,
  changePassword: account.changePassword,
  logout: account.logout,
  logoutAll: account.logoutAll,
  confirmAccountSwitch: account.confirmAccountSwitch,
}

export function useAuth(): Auth {
  const state = useSyncExternalStore(account.subscribe, account.getState)
  const { pending } = useSyncState()
  return useMemo(() => ({ ...state, pendingChanges: pending, ...actions }), [state, pending])
}

/** Token de acceso para clientes de la API que no son el sync (p. ej. administración). */
export const getAccessToken = () => authClient.getAccessToken()
