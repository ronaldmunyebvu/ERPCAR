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

/**
 * Signing secret.
 *
 * `JWT_SECRET` is the name this project is configured with; `SESSION_SECRET`
 * is kept as a fallback so an existing deployment does not break. Either one
 * works, but only one is ever used, and the first non-empty name wins.
 */
function secret() {
  const name = ['JWT_SECRET', 'SESSION_SECRET'].find(
    (key) => typeof process.env[key] === 'string' && process.env[key].trim(),
  )
  const value = name ? process.env[name].trim() : ''
  if (value.length < 32) {
    throw new Error(
      `${name ?? 'JWT_SECRET'} is missing or shorter than 32 characters. Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
    )
  }
  return value
}

/**
 * Session lifetime, from `JWT_EXPIRES_IN`.
 *
 * Accepts a plain number of seconds (`43200`) or a suffixed duration
 * (`12h`, `7d`, `30m`, `2w`). Unreadable values fall back to twelve hours so a
 * typo shortens nothing silently and never locks everyone out.
 */
function sessionTtl() {
  const raw = (process.env.JWT_EXPIRES_IN ?? '').trim().toLowerCase()
  if (!raw) return DEFAULT_TTL_SECONDS

  const match = /^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)?$/.exec(raw)
  if (!match) return DEFAULT_TTL_SECONDS

  const amount = Number(match[1])
  const unit = match[2] ?? 's'
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[unit]
  const seconds = Math.floor(amount * multiplier)

  // Anything under five minutes would make sessions unusable in practice, and
  // anything over thirty days is far longer than a session should live.
  if (!Number.isFinite(seconds) || seconds < 300 || seconds > 2_592_000) return DEFAULT_TTL_SECONDS
  return seconds
}

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function sign(payloadB64) {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url')
}

export function issueSession({ userId, companyId, role }, ttlSeconds = sessionTtl()) {
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

export { DEFAULT_TTL_SECONDS, sessionTtl }