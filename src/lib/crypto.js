const textEncoder = new TextEncoder()

function bytesToB64Url(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.length % 4 ? '='.repeat(4 - (base64.length % 4)) : ''
  const binary = atob(base64 + padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const ITERATIONS = 120_000
const KEY_LENGTH_BITS = 256

async function derive(password, salt, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    KEY_LENGTH_BITS,
  )
  return new Uint8Array(bits)
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Hashes a plain-text password into a self-describing PBKDF2 string. */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt)
  return `pbkdf2$${ITERATIONS}$${bytesToB64Url(salt)}$${bytesToB64Url(hash)}`
}

/** Verifies a plain-text password against a stored hash. */
export async function verifyPassword(password, stored) {
  if (!stored) return false
  const [scheme, iterations, salt, hash] = String(stored).split('$')
  if (scheme !== 'pbkdf2' || !salt || !hash) return false
  try {
    const candidate = await derive(password, b64UrlToBytes(salt), Number(iterations) || ITERATIONS)
    return timingSafeEqual(candidate, b64UrlToBytes(hash))
  } catch {
    return false
  }
}

async function getHmacKey(secret) {
  return crypto.subtle.importKey('raw', textEncoder.encode(secret || 'insecure-dev-secret'), {
    name: 'HMAC',
    hash: 'SHA-256',
  }, false, ['sign', 'verify'])
}

/** Creates an HMAC-signed session token: `<base64url payload>.<base64url signature>`. */
export async function signToken(payload, secret, ttlSeconds = 60 * 60 * 12) {
  const now = Date.now()
  const body = { ...payload, iat: now, exp: now + ttlSeconds * 1000 }
  const encoded = textEncoder.encode(JSON.stringify(body))
  const signature = await crypto.subtle.sign('HMAC', await getHmacKey(secret), encoded)
  return `${bytesToB64Url(encoded)}.${bytesToB64Url(signature)}`
}

/** Verifies a session token's signature and expiry, returning the payload or null. */
export async function verifyToken(token, secret) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await getHmacKey(secret),
      b64UrlToBytes(parts[1]),
      b64UrlToBytes(parts[0]),
    )
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(b64UrlToBytes(parts[0])))
    if (!payload?.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function randomToken(bytes = 24) {
  return bytesToB64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}