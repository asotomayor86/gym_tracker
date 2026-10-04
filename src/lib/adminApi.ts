import { authClient } from './sync'
import { createAdminApi } from './adminClient'

export { AdminApiError } from './adminClient'
export type { AdminUser, Invitation, Role } from './adminClient'

const api = createAdminApi({
  getToken: () => authClient.getAccessToken(),
  refresh: () => authClient.refresh(),
  fetch: (...a) => fetch(...a),
})

/** El panel de administración ya usa la API real. */
export const adminReady = () => true
export const { listInvitations, createInvitation, revokeInvitation, listUsers, updateUser, resetPassword, logoutUser } = api
