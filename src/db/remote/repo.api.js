import { OPERATIONS, groupOf, methodOf } from '../operations'

/**
 * HTTP data source: the browser's view of the repository.
 *
 * The shape it returns is generated from `OPERATIONS`, which is the same
 * manifest the API authorises against. A method the UI calls must therefore
 * exist on both sides by construction, and the client holds no database
 * credential and no session-signing key - only an `httpOnly` cookie the
 * browser attaches on its own.
 */

const ENDPOINT = '/api/data'

/** Server errors carry a message worth showing; transport errors get a generic one. */
export class ApiRequestError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

async function send(operation, args) {
  let response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation, args }),
    })
  } catch {
    throw new ApiRequestError(
      'Could not reach the server. Check your connection and try again.',
      0,
    )
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new ApiRequestError(
      payload?.error || 'The request could not be completed.',
      response.status,
    )
  }
  return payload?.data ?? null
}

export function createApiRepository() {
  const repo = {
    mode: 'api',
    onChange() {
      return () => {}
    },
    // Demo tooling has no meaning against a live database.
    async resetDemoData() {
      throw new Error('Demo data cannot be reset once a live database is connected.')
    },
    async importDemoData() {
      throw new Error('Demo data import is only available in demo mode.')
    },
    exportData() {
      throw new Error('Raw exports are only available in demo mode.')
    },
  }

  for (const operation of Object.keys(OPERATIONS)) {
    const group = groupOf(operation)
    const method = methodOf(operation)
    const call = (...args) => send(operation, args)
    if (!group) {
      repo[method] = call
    } else {
      repo[group] = repo[group] || {}
      repo[group][method] = call
    }
  }

  return repo
}