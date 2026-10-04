import type { GymDB } from '../db/db'
import { AuthError, type AuthClient, type AuthUser, type ServerSession } from './authClient'
import { SYNC_TABLES } from './syncTables'
import type { KeyValueStore } from './syncEngine'

export type AuthNotice =
  | null
  | { kind: 'legacy-device' }
  | { kind: 'other-account'; pending: number }
  | { kind: 'session-expired' }

export interface AccountState {
  status: 'loading' | 'anonymous' | 'authenticated' | 'expired'
  user: AuthUser | null
  role: 'admin' | 'user' | null
  isAdmin: boolean
  mustChangePassword: boolean
  notice: AuthNotice
}

const OWNER_KEY = 'gym-owner'
const CURSOR_KEY = 'gym-cursor'
const LAST_SYNC_KEY = 'gym-last-sync'

export interface AccountDeps {
  db: GymDB
  storage: KeyValueStore
  auth: AuthClient
  /** Arranca una sincronización (tras entrar). */
  syncNow: () => Promise<void>
  /** Cancela el estado del motor de sync (al cerrar sesión). */
  resetSync: () => void
  /** Vuelve a sembrar el catálogo tras vaciar la base local. */
  afterWipe?: () => Promise<unknown>
  hadLegacyToken?: boolean
}

/**
 * Orquesta cuenta + datos locales: de quién son los datos del dispositivo, cambio de cuenta (avisar y vaciar),
 * reclamación de los datos de la versión anterior por la cuenta admin y avisos para la UI.
 */
export function createAccount(deps: AccountDeps) {
  const { db, storage, auth } = deps
  const listeners = new Set<() => void>()
  let loading = true
  let legacyDevice = !!deps.hadLegacyToken
  let held: { session: ServerSession; pending: number } | null = null // login correcto pendiente de confirmar el cambio de cuenta
  let state = compute()

  function compute(): AccountState {
    const snap = auth.getSnapshot()
    const user = snap.session?.user ?? null
    const status = loading ? 'loading' : user ? 'authenticated' : snap.expired ? 'expired' : 'anonymous'
    const notice: AuthNotice = held
      ? { kind: 'other-account', pending: held.pending }
      : !user && snap.expired
        ? { kind: 'session-expired' }
        : !user && legacyDevice
          ? { kind: 'legacy-device' }
          : null
    return {
      status, user, role: user?.role ?? null, isAdmin: user?.role === 'admin',
      mustChangePassword: snap.session?.mustChangePassword ?? false, notice,
    }
  }
  const publish = () => {
    state = compute()
    listeners.forEach((l) => l())
  }
  auth.subscribe(publish)

  /** ¿Hay datos propios en el dispositivo (más allá de las semillas sin editar)? */
  async function localHasData() {
    if ((await db.outbox.count()) > 0) return true
    for (const t of SYNC_TABLES) {
      if ((await db[t].filter((r: { updatedAt: number }) => r.updatedAt > 1).count()) > 0) return true
    }
    return false
  }

  async function wipeLocal() {
    await db.transaction('rw', [...SYNC_TABLES.map((t) => db[t]), db.outbox], async () => {
      for (const t of SYNC_TABLES) await db[t].clear()
      await db.outbox.clear()
    })
    storage.del(CURSOR_KEY)
    storage.del(LAST_SYNC_KEY)
    await deps.afterWipe?.()
  }

  async function adopt(session: ServerSession) {
    storage.set(OWNER_KEY, session.user.id)
    legacyDevice = false
    held = null
    auth.setSession(session)
    void deps.syncNow()
  }

  /** Decide si la sesión recién obtenida puede usar los datos de este dispositivo. */
  async function complete(session: ServerSession, discardLocal: boolean) {
    const owner = storage.get(OWNER_KEY)
    const data = await localHasData()
    const foreign = owner ? owner !== session.user.id : data && session.user.role !== 'admin'
    if (foreign && !discardLocal) {
      held = { session, pending: await db.outbox.count() }
      publish()
      return
    }
    if (foreign) await wipeLocal()
    // Dispositivo "heredado" reclamado por el admin: se rehace el pull completo (cursor de la versión anterior).
    if (!owner) storage.del(CURSOR_KEY)
    await adopt(session)
  }

  return {
    getState: () => state,
    subscribe: (cb: () => void) => {
      listeners.add(cb)
      return () => void listeners.delete(cb)
    },

    async init() {
      if (!storage.get(OWNER_KEY) && !auth.hasSession() && (await localHasData())) legacyDevice = true
      // Una sesión guardada sin propietario registrado (p. ej. primera versión con cuentas) fija el propietario.
      const current = auth.currentUser()
      if (current && !storage.get(OWNER_KEY)) storage.set(OWNER_KEY, current.id)
      loading = false
      publish()
    },

    async login(email: string, password: string) {
      await complete(await auth.requestLogin(email, password), false)
    },
    async registerWithInvite(code: string, email: string, password: string, displayName?: string) {
      await complete(await auth.requestRegister(code, email, password, displayName), false)
    },
    /** Tras el aviso 'other-account': vacía lo local y completa el login. */
    async confirmAccountSwitch() {
      if (!held) throw new AuthError('unknown', 'No hay ningún cambio de cuenta pendiente')
      const { session } = held
      held = null
      await complete(session, true)
    },
    async changePassword(current: string, next: string) {
      await auth.changePassword(current, next)
    },
    async logout() {
      held = null
      // Último intento de subir lo pendiente antes de soltar la sesión (si no hay red, se conserva en el outbox).
      if (auth.hasSession() && (await db.outbox.count()) > 0) {
        await Promise.race([deps.syncNow(), new Promise((r) => setTimeout(r, 5000))]).catch(() => {})
      }
      deps.resetSync()
      await auth.logout() // los datos locales y el outbox se conservan (misma cuenta al volver)
      publish()
    },
    async logoutAll() {
      await auth.logoutAll()
      deps.resetSync()
      publish()
    },
    checkInvite: auth.checkInvite,
  }
}

export type Account = ReturnType<typeof createAccount>
