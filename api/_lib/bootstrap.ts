import { eq } from 'drizzle-orm'
import { users } from '../../db/schema.js'
import { HttpError, normalizeEmail, type Db } from './authService.js'
import { hashPassword, passwordProblems } from './password.js'
import { newId } from './tokens.js'

export type BootstrapResult = ({ created: true; id: string } | { created: false; id: string; reason: 'exists' | 'password_reset' }) & { warnings: string[] }

/** El bootstrap solo exige lo básico (10–128 caracteres); si la contraseña es común lo avisa para que se cambie desde la app. */
function checkBootstrapPassword(password: string, email: string): string[] {
  const problems = passwordProblems(password, email)
  const fatal = problems.filter((p) => !p.includes('común'))
  if (fatal.length) throw new HttpError(422, 'weak_password', { reasons: fatal })
  return problems.length ? ['La contraseña del administrador es común: cámbiala desde Ajustes tras entrar.'] : []
}

/**
 * Crea la cuenta administradora si no existe (idempotente). Si ya existe no toca nada,
 * salvo que se pida `resetPassword` (para recuperar el acceso lo ejecuta el propietario con acceso a la base).
 */
export async function ensureAdmin(
  db: Db, input: { email: string; password: string; displayName?: string; resetPassword?: boolean }, now = Date.now(),
): Promise<BootstrapResult> {
  const email = normalizeEmail(input.email)
  const [existing] = await db.select().from(users).where(eq(users.email, email))
  if (existing) {
    if (!input.resetPassword) return { created: false, id: existing.id, reason: 'exists', warnings: [] }
    const warnings = checkBootstrapPassword(input.password, email)
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(input.password), role: 'admin', disabled: false, tokenVersion: existing.tokenVersion + 1 })
      .where(eq(users.id, existing.id))
    return { created: false, id: existing.id, reason: 'password_reset', warnings }
  }
  const warnings = checkBootstrapPassword(input.password, email)
  const id = newId()
  await db.insert(users).values({
    id, email, passwordHash: await hashPassword(input.password), displayName: input.displayName ?? email.split('@')[0],
    role: 'admin', createdAt: now,
  })
  return { created: true, id, warnings }
}
