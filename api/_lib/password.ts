import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const N = 2 ** 15
const R = 8
const P = 1
const KEYLEN = 32

const derive = (password: string, salt: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((resolve, reject) => {
    const opts: ScryptOptions = { N: n, r, p, maxmem: 128 * n * r * 2 }
    scrypt(password.normalize('NFKC'), salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key)))
  })

/** Formato: scrypt$N$r$p$sal(base64)$hash(base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, N, R, P)
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$')
  if (alg !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const key = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p))
  return key.length === expected.length && timingSafeEqual(key, expected)
}

let dummy: Promise<string> | undefined
/** Compara contra un hash falso cuando el correo no existe: el tiempo de respuesta no delata qué cuentas existen. */
export const burnPasswordCheck = async (password: string) => {
  dummy ??= hashPassword('contraseña-ficticia-para-igualar-tiempos')
  await verifyPassword(password, await dummy)
}

const COMMON = new Set([
  '1234567890', '12345678910', '0123456789', '1234567891', 'qwertyuiop', 'qwerty1234', 'qwerty12345', 'asdfghjkl1',
  'password12', 'password123', 'password1234', 'contraseña1', 'contraseña12', 'contraseña123', 'contrasena1', 'contrasena123',
  'iloveyou12', 'abc1234567', 'abcdefghij', 'abcd123456', '1q2w3e4r5t', '1qaz2wsx3edc', 'letmein123', 'welcome123',
  'administrador', 'administrator', 'gimnasio123', 'entrenamiento', 'futbol12345', 'barcelona10', 'realmadrid1', 'passw0rd123',
  '1111111111', '0000000000', '1234512345', 'aaaaaaaaaa', 'mypassword1', 'trustno1234', 'superman123', 'qazwsxedcr',
])

/** Política: 10–128 caracteres, distinta del correo y de su parte local, y no demasiado común. Devuelve los motivos en español. */
export function passwordProblems(password: unknown, email = ''): string[] {
  if (typeof password !== 'string') return ['La contraseña es obligatoria.']
  const out: string[] = []
  const pw = password.normalize('NFKC')
  const low = pw.toLowerCase()
  if (pw.length < 10) out.push('Debe tener al menos 10 caracteres.')
  if (pw.length > 128) out.push('Debe tener como máximo 128 caracteres.')
  const mail = email.trim().toLowerCase()
  if (mail && (low === mail || (mail.includes('@') && low === mail.split('@')[0]))) out.push('No puede ser igual que tu correo.')
  if (COMMON.has(low) || /^(.)\1+$/.test(pw)) out.push('Es una contraseña demasiado común.')
  return out
}
