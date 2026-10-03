import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkPassword, signToken } from './_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!checkPassword(req.body?.password)) return res.status(401).json({ error: 'bad password' })
  res.json({ token: await signToken() })
}
