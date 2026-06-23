// ─── Payment secret encryption (server-only) ─────────────────────────────────
//
// AES-256-GCM at rest for per-school provider credentials. The key is derived
// from PAYMENTS_ENC_KEY (env). Ciphertext layout: base64( iv[12] | tag[16] | ct ).
// NEVER import this from a client component; secrets are only ever decrypted on
// the service-role server path.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

function key(): Buffer {
  const raw = process.env.PAYMENTS_ENC_KEY
  if (!raw) throw new Error('PAYMENTS_ENC_KEY is not configured')
  return createHash('sha256').update(raw).digest() // 32 bytes
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptSecret(b64: string): string {
  const buf = Buffer.from(b64, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
