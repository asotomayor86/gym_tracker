import type { VercelRequest, VercelResponse } from '@vercel/node'
import * as svc from '../_lib/authService.js'
import { db } from '../_lib/db.js'
import { bearer, clientIp, deviceLabel, queryStr, respond } from '../_lib/http.js'

const METHODS: Record<string, string> = {
  login: 'POST', refresh: 'POST', logout: 'POST', 'logout-all': 'POST', register: 'POST', 'change-password': 'POST', me: 'GET', invite: 'GET',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = queryStr(req, 'action') ?? ''
  if (!(action in METHODS)) return res.status(404).json({ error: 'not_found' })
  if (req.method !== METHODS[action]) return res.status(405).end()
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
  const ip = clientIp(req)
  const device = deviceLabel(req)

  return respond(res, async () => {
    switch (action) {
      case 'login':
        return { body: await svc.login(db, { email: body.email, password: body.password, ip, device }) }
      case 'refresh':
        return { body: await svc.refresh(db, body.refreshToken, device) }
      case 'logout':
        await svc.logout(db, body.refreshToken)
        return
      case 'logout-all':
        await svc.logoutAll(db, await svc.authenticate(db, bearer(req)))
        return
      case 'register':
        return { status: 201, body: await svc.register(db, { code: body.code, email: body.email, password: body.password, displayName: body.displayName, ip, device }) }
      case 'change-password':
        return {
          body: await svc.changePassword(db, await svc.authenticate(db, bearer(req)), {
            currentPassword: body.currentPassword, newPassword: body.newPassword, device,
          }),
        }
      case 'me':
        return { body: { user: (await svc.authenticate(db, bearer(req))).user } }
      case 'invite':
        return { body: await svc.checkInvite(db, queryStr(req, 'code'), ip) }
    }
  })
}
