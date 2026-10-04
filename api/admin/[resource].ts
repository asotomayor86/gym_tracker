import type { VercelRequest, VercelResponse } from '@vercel/node'
import * as svc from '../_lib/authService.js'
import { db } from '../_lib/db.js'
import { bearer, originOf, queryStr, respond } from '../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const resource = queryStr(req, 'resource')
  const id = queryStr(req, 'id')
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>

  return respond(res, async () => {
    const ctx = await svc.authenticate(db, bearer(req))
    svc.requireAdmin(ctx)

    if (resource === 'invitations') {
      if (req.method === 'GET') return { body: await svc.listInvitations(db) }
      if (req.method === 'POST') return { status: 201, body: await svc.createInvitation(db, ctx, body, originOf(req)) }
      if (req.method === 'DELETE' && id) return void (await svc.revokeInvitation(db, id))
    }
    if (resource === 'users') {
      if (req.method === 'GET') return { body: await svc.listUsers(db) }
      if (req.method === 'PATCH' && id) return void (await svc.updateUser(db, ctx, id, body))
      if (req.method === 'POST' && id) {
        const action = queryStr(req, 'action')
        if (action === 'reset-password') return { body: await svc.resetPassword(db, id) }
        if (action === 'logout') return void (await svc.logoutUser(db, id))
      }
    }
    throw new svc.HttpError(404, 'not_found')
  })
}
