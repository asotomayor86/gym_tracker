/**
 * Crea (idempotente) la cuenta administradora a partir de ADMIN_EMAIL y ADMIN_PASSWORD del .env local.
 *   npx tsx scripts/bootstrap-admin.ts                   crea el admin si no existe (no toca uno existente)
 *   npx tsx scripts/bootstrap-admin.ts --reset-password  restablece la contraseña del admin (recuperación)
 * Requiere haber aplicado antes la etapa `schema` de la migración. Nunca imprime la contraseña.
 */
import 'dotenv/config'
import { ensureAdmin } from '../api/_lib/bootstrap'
import { db } from '../api/_lib/db'

const email = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD
if (!email || !password) {
  console.error('Faltan ADMIN_EMAIL y/o ADMIN_PASSWORD en el entorno (.env).')
  process.exit(1)
}
const result = await ensureAdmin(db, { email, password, resetPassword: process.argv.includes('--reset-password') })
const what = result.created ? 'creada' : result.reason === 'password_reset' ? 'contraseña restablecida' : 'ya existía (sin cambios)'
console.log(`Cuenta admin ${email}: ${what}.`)
for (const w of result.warnings) console.warn(`Aviso: ${w}`)
