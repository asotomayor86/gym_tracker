import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

export const ACCESS_TTL_S = 15 * 60
export const REFRESH_TTL_MS = 90 * 86_400_000

const secret = () => {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 16) throw new Error('AUTH_SECRET no configurado')
  return new TextEncoder().encode(process.env.AUTH_SECRET)
}

export interface AccessClaims {
  sub: string
  role: 'admin' | 'user'
  /** token_version del usuario al emitirlo. */
  tv: number
  /** id de la sesión de auth (para revocar al instante). */
  sid: string
}

export const signAccess = (c: AccessClaims) =>
  new SignJWT({ role: c.role, tv: c.tv, sid: c.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_S}s`)
    .sign(secret())

export async function verifyAccess(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || typeof payload.tv !== 'number') throw new Error('claims')
  return { sub: payload.sub, role: payload.role === 'admin' ? 'admin' : 'user', tv: payload.tv, sid: payload.sid }
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
/** 256 bits aleatorios en base64url (refresh tokens). */
export const newSecret = (bytes = 32) => randomBytes(bytes).toString('base64url')
export const newId = () => randomUUID()
