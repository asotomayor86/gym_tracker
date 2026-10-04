/**
 * Cliente de administración que consume la UI, con las firmas de docs/contrato-auth-api.md §2.
 * HOY es una maqueta en memoria; cuando exista src/lib/adminApi.ts basta con `export * from '../../lib/adminApi'`.
 */
export type Role = 'admin' | 'user'
export interface Invitation { id: string; role: Role; createdAt: number; expiresAt: number; usedAt: number | null; usedBy: string | null; revokedAt: number | null; status: 'active' | 'used' | 'expired' | 'revoked' }
export interface AdminUser { id: string; email: string; displayName: string; role: Role; disabled: boolean; createdAt: number; lastLoginAt: number | null; sessions: number }

/** Mientras el cliente real (src/lib/adminApi.ts) no exista, el panel solo se muestra en desarrollo. */
export const adminReady = () => import.meta.env.DEV

const DAY = 86_400_000
const now = Date.now()
let invitations: Invitation[] = [
  { id: 'i1', role: 'user', createdAt: now - 1 * DAY, expiresAt: now + 6 * DAY, usedAt: null, usedBy: null, revokedAt: null, status: 'active' },
  { id: 'i2', role: 'user', createdAt: now - 9 * DAY, expiresAt: now - 2 * DAY, usedAt: null, usedBy: null, revokedAt: null, status: 'expired' },
  { id: 'i3', role: 'user', createdAt: now - 5 * DAY, expiresAt: now + 2 * DAY, usedAt: now - 4 * DAY, usedBy: 'laura@ejemplo.es', revokedAt: null, status: 'used' },
  { id: 'i4', role: 'admin', createdAt: now - 3 * DAY, expiresAt: now + 4 * DAY, usedAt: null, usedBy: null, revokedAt: now - 2 * DAY, status: 'revoked' },
]
let users: AdminUser[] = [
  { id: 'u1', email: 'a.sotomayor.martinez@gmail.com', displayName: 'Antonio', role: 'admin', disabled: false, createdAt: now - 60 * DAY, lastLoginAt: now - 3_600_000, sessions: 2 },
  { id: 'u2', email: 'laura@ejemplo.es', displayName: 'Laura', role: 'user', disabled: false, createdAt: now - 4 * DAY, lastLoginAt: now - 2 * DAY, sessions: 1 },
  { id: 'u3', email: 'marcos@ejemplo.es', displayName: 'Marcos', role: 'user', disabled: true, createdAt: now - 20 * DAY, lastLoginAt: now - 12 * DAY, sessions: 0 },
]
const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms))

export async function listInvitations(): Promise<Invitation[]> { await wait(); return [...invitations].sort((a, b) => b.createdAt - a.createdAt) }
export async function createInvitation(opts: { role?: Role; days?: number } = {}): Promise<{ id: string; code: string; url: string; expiresAt: number }> {
  await wait()
  const id = 'i' + (invitations.length + 1), code = 'k' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12)
  const expiresAt = Date.now() + (opts.days ?? 7) * DAY
  invitations = [...invitations, { id, role: opts.role ?? 'user', createdAt: Date.now(), expiresAt, usedAt: null, usedBy: null, revokedAt: null, status: 'active' }]
  return { id, code, url: `${location.origin}/invitacion/${code}`, expiresAt }
}
export async function revokeInvitation(id: string): Promise<void> { await wait(200); invitations = invitations.map((i) => (i.id === id ? { ...i, revokedAt: Date.now(), status: 'revoked' } : i)) }
export async function listUsers(): Promise<AdminUser[]> { await wait(); return users }
export async function updateUser(id: string, patch: { disabled?: boolean; role?: Role; displayName?: string }): Promise<void> { await wait(250); users = users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }
export async function resetPassword(_id: string): Promise<{ temporaryPassword: string }> { await wait(400); return { temporaryPassword: 'Tmp-' + Math.random().toString(36).slice(2, 8) + '-' + Math.random().toString(36).slice(2, 8) } }
export async function logoutUser(id: string): Promise<void> { await wait(250); users = users.map((u) => (u.id === id ? { ...u, sessions: 0 } : u)) }
