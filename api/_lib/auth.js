import { createHmac, timingSafeEqual } from 'node:crypto'
import { one } from './db.js'

/**
 * Server-side sessions.
 *
 * Two properties this module exists to guarantee:
 *
 *  1. The signing secret never leaves the function. Previously the session was
 *     signed in the browser with a `VITE_` variable, which meant the key was
 *     published to every visitor and any session could be forged.
 *  2. A session carries no authority of its own. Every request re-reads the
 *     user row, so deactivating an account or changing its role takes effect
 *     immediately instead of at the next token expiry.
 */

const DEFAULT_TTL_SECONDS = 60 * 60 * 12

function secret() {
  const value = process.env.SESSION_SECRET
  if (!value || value.trim().length < 32) {
    throw new Error(
      'SESSION_SECRET is missing or shorter than 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    )
  }
  return value.trim()
}

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function sign(payloadB64) {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url')
}

export function issueSession({ userId, companyId, role }, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000)
  const payload = { userId, companyId, role, iat: now, exp: now + ttlSeconds }
  const body = base64url(JSON.stringify(payload))
  return { token: `${body}.${sign(body)}`, maxAge: ttlSeconds }
}

/** Verifies signature and expiry. Returns the payload or null; never throws. */
export function readSession(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  let expected
  try {
    expected = sign(body)
  } catch {
    return null
  }
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload?.exp || payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

/**
 * Resolves the caller to a live account, or null.
 *
 * The user row is re-read on every request rather than trusted from the token,
 * which is what stops a deactivated member or a demoted admin from continuing
 * to act on a token minted while they still had access.
 */
export async function currentSession(token) {
  const payload = readSession(token)
  if (!payload?.userId) return null

  const user = await one(
    `SELECT id, company_id, full_name, email, phone, role, status, avatar_url,
            last_login_at, created_at, updated_at
     FROM users WHERE id = $1`,
    [payload.userId],
  )
  if (!user || user.status !== 'active') return null

  // The company must still match the token, so a token cannot be replayed
  // against an account that has since moved tenants.
  if (payload.companyId && payload.companyId !== user.company_id) return null

  const company = await one('SELECT * FROM companies WHERE id = $1', [user.company_id])
  if (!company) return null

  return {
    user,
    company,
    companyId: user.company_id,
    userId: user.id,
    role: user.role,
  }
}

/**
 * The `actor` argument the repository expects. Always built from the session,
 * so the identity written into `activity_log` cannot be chosen by the caller.
 */
export function actorFor(session) {
  return {
    id: session.userId,
    company_id: session.companyId,
    role: session.role,
    full_name: session.user.full_name,
    email: session.user.email,
  }
}

export { DEFAULT_TTL_SECONDS }