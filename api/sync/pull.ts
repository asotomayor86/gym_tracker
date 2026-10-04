import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq, gt } from 'drizzle-orm'
import { syncTables } from '../../db/schema.js'
import { authenticate } from '../_lib/authService.js'
import { db } from '../_lib/db.js'
import { bearer, respond } from '../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  return respond(res, async () => {
    const { userId } = await authenticate(db, bearer(req))
    const since = Number(req.query.since) || 0
    // Margen de 1 s hacia atrás: re-aplicar filas es idempotente.
    const cursor = Date.now() - 1000
    const changes: Record<string, unknown[]> = {}

    for (const [name, table] of Object.entries(syncTables)) {
      const rows = await db
        .select()
        .from(table)
        .where(and(eq(table.userId, userId), gt(table.syncedAt, since)))
        .limit(5000)
      changes[name] = rows.map(({ userId: _u, syncedAt: _s, ...rest }) => rest)
    }
    return { body: { changes, cursor } }
  })
}
