import { timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SignJWT, jwtVerify } from 'jose'

/** App de un solo usuario: el user_id es fijo, pero todas las tablas lo llevan. */
export const USER_ID = 'owner'

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET)

export function checkPassword(input: unknown): boolean {
  const expected = process.env.APP_PASSWORD
  if (!expected || typeof input !== 'string') return false
  const a = Buffer.from(input)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const signToken = () =>
  new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(USER_ID).setExpirationTime('90d').sign(secret())

/** Devuelve true si la petición está autenticada; si no, responde 401. */
export async function requireAuth(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const token = req.headers.authorization?.replace(/^Bearer /, '')
  try {
    if (!token || !process.env.AUTH_SECRET) throw new Error('no token')
    await jwtVerify(token, secret())
    return true
  } catch {
    res.status(401).json({ error: 'unauthorized' })
    return false
  }
}
