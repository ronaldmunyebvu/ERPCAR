/**
 * Browser-side auth calls.
 *
 * The session lives in an `httpOnly` cookie set by `/api/auth`, so there is
 * nothing here to read, copy or forge - which is precisely why the previous
 * client-side token signing could not be secured.
 */

const ENDPOINT = '/api/auth'

export class AuthApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
  }
}

async function call(action, payload = {}) {
  let response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
  } catch {
    throw new AuthApiError('Could not reach the server. Check your connection and try again.', 0)
  }

  let result = null
  try {
    result = await response.json()
  } catch {
    result = null
  }

  if (!response.ok) {
    throw new AuthApiError(result?.error || 'The request could not be completed.', response.status)
  }
  return result
}

/** Restores a session on page load. Returns the account or null. */
export async function restore() {
  const result = await call('session')
  return result?.account ?? null
}

export async function signIn(email, password) {
  const result = await call('signIn', { email, password })
  return result?.account ?? null
}

export async function signOut() {
  await call('signOut')
}

export async function setupWorkspace({ company, owner }) {
  const result = await call('setup', { company, owner })
  return result?.account ?? null
}

/**
 * Redeems the emailed confirmation link.
 *
 * Returns the account: the server marks the address confirmed and sets the
 * session cookie in the same response.
 */
export async function confirmEmail(token) {
  const result = await call('confirmEmail', { token })
  return result?.account ?? null
}

export async function isSetupComplete() {
  const repo = (await import('../index')).getRepository()
  return repo.auth.isSetupComplete()
}