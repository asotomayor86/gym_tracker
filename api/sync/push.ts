import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq, getTableColumns, lt } from 'drizzle-orm'
import { syncTables } from '../../db/schema.js'
import { USER_ID, requireAuth } from '../_lib/auth.js'
import { db } from '../_lib/db.js'

type Rows = Record<string, Record<string, unknown>[]>

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!(await requireAuth(req, res))) return
  const changes: Rows = req.body?.changes ?? {}
  const now = Date.now()
  let applied = 0

  for (const [name, table] of Object.entries(syncTables)) {
    const allowed = Object.keys(getTableColumns(table))
    for (const incoming of changes[name] ?? []) {
      if (typeof incoming.id !== 'string' || typeof incoming.updatedAt !== 'number') continue
      // Solo columnas conocidas; userId y syncedAt los fija el servidor.
      const row: Record<string, unknown> = {}
      for (const key of allowed) if (key in incoming) row[key] = incoming[key]
      row.userId = USER_ID
      row.syncedAt = now
      const { id: _id, ...set } = row
      await db
        .insert(table)
        .values(row as never)
        .onConflictDoUpdate({
          target: table.id,
          set: set as never,
          setWhere: and(eq(table.userId, USER_ID), lt(table.updatedAt, incoming.updatedAt)),
        })
      applied++
    }
  }
  res.json({ applied })
}
