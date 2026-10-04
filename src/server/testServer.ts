// Utilidades de test: handlers REALES de /api sobre Postgres en memoria (PGlite) con el esquema de db/schema.ts.
import type { PGlite } from '@electric-sql/pglite'

export interface TestDb {
  db: unknown
  pglite: PGlite
}

export async function makeTestDb(): Promise<TestDb> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('../../db/schema')
  const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api')
  const pglite = new PGlite()
  const db = drizzle(pglite)
  const ddl = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema as never))
  await pglite.exec(ddl.join('\n'))
  return { db, pglite }
}

type Handler = (req: unknown, res: unknown) => Promise<unknown>
export interface ApiResult { status: number; body: any; headers: Record<string, string> }

let handlers: Record<string, Handler> | undefined
const load = async () => {
  process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret'
  handlers ??= {
    auth: (await import(/* @vite-ignore */ '../../api/auth/[action]')).default as Handler,
    admin: (await import(/* @vite-ignore */ '../../api/admin/[resource]')).default as Handler,
    push: (await import(/* @vite-ignore */ '../../api/sync/push')).default as Handler,
    pull: (await import(/* @vite-ignore */ '../../api/sync/pull')).default as Handler,
  }
  return handlers
}

/** Llama al handler como lo haría Vercel: ruta + método + cabeceras + cuerpo. */
export async function callApi(
  method: string, path: string, opts: { token?: string; body?: unknown; ip?: string; headers?: Record<string, string> } = {},
): Promise<ApiResult> {
  const h = await load()
  const url = new URL(path, 'http://localhost')
  const parts = url.pathname.split('/').filter(Boolean) // api, auth, login
  const query: Record<string, string> = Object.fromEntries(url.searchParams)
  let handler: Handler
  if (parts[1] === 'auth') {
    handler = h.auth
    query.action = parts[2]
  } else if (parts[1] === 'admin') {
    handler = h.admin
    query.resource = parts[2]
  } else handler = parts[2] === 'push' ? h.push : h.pull
  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  if (opts.token) headers.authorization = `Bearer ${opts.token}`
  if (opts.ip) headers['x-forwarded-for'] = opts.ip
  const out: ApiResult = { status: 200, body: undefined, headers: {} }
  const res = {
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v },
    status(c: number) { out.status = c; return res },
    json(b: unknown) { out.body = b; return res },
    end() { return res },
  }
  await handler({ method, headers, body: opts.body, query }, res)
  return out
}
