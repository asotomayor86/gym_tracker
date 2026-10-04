export type Role = 'admin' | 'user'

export interface Invitation {
  id: string; role: Role; createdAt: number; expiresAt: number
  usedAt: number | null
  /** Correo de quien la usó. */
  usedBy: string | null
  revokedAt: number | null
  status: 'active' | 'used' | 'expired' | 'revoked'
}
export interface AdminUser {
  id: string; email: string; displayName: string; role: Role; disabled: boolean
  createdAt: number; lastLoginAt: number | null; sessions: number
}

/** Error de la API de administración: `code` = campo `error` del servidor (forbidden, not_found, cannot_demote_self…) o 'network'. */
export class AdminApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
  }
}

export interface AdminDeps {
  getToken: () => Promise<string>
  refresh: () => Promise<void>
  fetch: typeof fetch
}

export function createAdminApi(deps: AdminDeps) {
  async function call(path: string, init: { method?: string; body?: unknown } = {}, retried = false): Promise<any> {
    let res: Response
    try {
      res = await deps.fetch(path, {
        method: init.method ?? 'GET',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${await deps.getToken()}` },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      })
    } catch {
      throw new AdminApiError(0, 'network')
    }
    if (res.status === 401 && !retried) {
      await deps.refresh().catch(() => {})
      return call(path, init, true)
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null)
    if (!res.ok) throw new AdminApiError(res.status, (data?.error as string | undefined) ?? 'unknown')
    return data
  }
  const q = encodeURIComponent

  return {
    listInvitations: (): Promise<Invitation[]> => call('/api/admin/invitations'),
    /** El código en claro solo se devuelve aquí, una vez. */
    createInvitation: (opts: { role?: Role; days?: number } = {}): Promise<{ id: string; code: string; url: string; expiresAt: number }> =>
      call('/api/admin/invitations', { method: 'POST', body: opts }),
    revokeInvitation: (id: string): Promise<void> => call(`/api/admin/invitations?id=${q(id)}`, { method: 'DELETE' }),
    listUsers: (): Promise<AdminUser[]> => call('/api/admin/users'),
    updateUser: (id: string, patch: { disabled?: boolean; role?: Role; displayName?: string }): Promise<void> =>
      call(`/api/admin/users?id=${q(id)}`, { method: 'PATCH', body: patch }),
    resetPassword: (id: string): Promise<{ temporaryPassword: string }> => call(`/api/admin/users?id=${q(id)}&action=reset-password`, { method: 'POST', body: {} }),
    logoutUser: (id: string): Promise<void> => call(`/api/admin/users?id=${q(id)}&action=logout`, { method: 'POST', body: {} }),
  }
}
