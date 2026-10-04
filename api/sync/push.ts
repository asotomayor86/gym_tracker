import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getTableColumns, lt } from 'drizzle-orm'
import { syncTables } from '../../db/schema.js'
import { authenticate } from '../_lib/authService.js'
import { pushCatalog } from '../_lib/catalog.js'
import { db } from '../_lib/db.js'
import { bearer, respond } from '../_lib/http.js'

type Rows = Record<string, Record<string, unknown>[]>

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  return respond(res, async () => {
    const ctx = await authenticate(db, bearer(req)) // el usuario y su rol salen SIEMPRE del token
    const { userId } = ctx
    const changes: Rows = req.body?.changes ?? {}
    const now = Date.now()
    let applied = 0

    for (const [name, table] of Object.entries(syncTables)) {
      const allowed = Object.keys(getTableColumns(table))
      await Promise.all(
        (changes[name] ?? []).map(async (incoming) => {
          if (typeof incoming.id !== 'string' || typeof incoming.updatedAt !== 'number') return
          // Solo columnas conocidas; userId y syncedAt los fija el servidor.
          const row: Record<string, unknown> = {}
          for (const key of allowed) if (key in incoming) row[key] = incoming[key]
          row.userId = userId
          row.syncedAt = now
          const { id: _id, userId: _u, ...set } = row
          await db
            .insert(table)
            .values(row as never)
            .onConflictDoUpdate({
              target: [table.userId, table.id],
              set: set as never,
              setWhere: lt(table.updatedAt, incoming.updatedAt as number),
            })
          applied++
        }),
      )
    }
    // Catálogo global (ejercicios, gimnasios, disponibilidad): solo admin.
    const cat = await pushCatalog(db, ctx, req.body?.catalog ?? {}, now)
    return { body: { applied, catalog: cat } }
  })
}
