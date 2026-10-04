import type { VercelRequest, VercelResponse } from '@vercel/node'
import { HttpError } from './authService.js'

export const clientIp = (req: VercelRequest) => {
  const fwd = req.headers['x-forwarded-for']
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
  return first || (req.headers['x-real-ip'] as string | undefined) || 'unknown'
}
export const deviceLabel = (req: VercelRequest) => String(req.headers['user-agent'] ?? '').slice(0, 120)
export const bearer = (req: VercelRequest) => req.headers.authorization as string | undefined
export const queryStr = (req: VercelRequest, key: string) => {
  const v = req.query?.[key]
  return Array.isArray(v) ? v[0] : (v as string | undefined)
}
export const originOf = (req: VercelRequest) => {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host
  return `${(req.headers['x-forwarded-proto'] as string | undefined) ?? 'https'}://${host}`
}

/** Ejecuta el manejador y traduce HttpError a respuestas JSON `{ error, ...extra }` (sin filtrar detalles internos). */
export async function respond(res: VercelResponse, fn: () => Promise<{ status?: number; body?: unknown } | void>) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const out = (await fn()) ?? { status: 204 }
    if (out.body === undefined) return res.status(out.status ?? 204).end()
    return res.status(out.status ?? 200).json(out.body)
  } catch (e) {
    if (e instanceof HttpError) {
      const retry = e.extra.retryAfterS
      if (typeof retry === 'number') res.setHeader('Retry-After', String(retry))
      return res.status(e.status).json({ error: e.code, ...e.extra })
    }
    console.error('api error', e instanceof Error ? e.message : e)
    return res.status(500).json({ error: 'server_error' })
  }
}
