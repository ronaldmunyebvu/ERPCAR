/**
 * Request/response plumbing for the serverless functions.
 *
 * Cookies are `httpOnly` so the session token is unreachable from JavaScript,
 * which removes the token-forgery problem that existed while signing happened
 * in the browser against a bundled secret.
 */

export const SESSION_COOKIE = 'carrental.session'

const BASE_SECONDS = 60 * 60 * 12

export function json(body, status = 200, headers = {}) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
    body: JSON.stringify(body),
  }
}

export function fail(message, status = 400) {
  return json({ error: message }, status)
}

/** Parses a JSON body, tolerating an empty or non-JSON payload. */
export function readBody(event) {
  if (!event?.body) return {}
  try {
    return JSON.parse(event.body) ?? {}
  } catch {
    throw Object.assign(new Error('Request body was not valid JSON.'), { statusCode: 400 })
  }
}

/** Minimal cookie header parser; avoids depending on a framework. */
export function parseCookies(event) {
  const header = event?.headers?.cookie || event?.headers?.Cookie || ''
  const jar = {}
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    jar[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim())
  }
  return jar
}

/** `https` when the request reached Vercel over TLS, else `http` (localhost). */
function baseUrl(event) {
  const headers = event?.headers || {}
  const forwarded = headers['x-forwarded-proto']
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  if (proto) return proto
  const host = String(headers.host || headers.Host || 'localhost')
  return host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https'
}

export function isSecureRequest(event) {
  const headers = event?.headers || {}
  const forwarded = headers['x-forwarded-proto']
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  if (proto) return proto === 'https'
  const host = String(headers.host || headers.Host || '')
  return host.endsWith('vercel.app') || process.env.NODE_ENV === 'production'
}

export function sessionCookie(event, token, ttlSeconds = BASE_SECONDS) {
  const maxAge = Math.floor(ttlSeconds)
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (isSecureRequest(event)) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(event) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax']
  if (isSecureRequest(event)) parts.push('Secure')
  return parts.join('; ')
}

export { BASE_SECONDS, baseUrl }