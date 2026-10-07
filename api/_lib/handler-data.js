import { createNeonRepository } from '../../src/db/neon/repo.neon.js'
import { OPERATIONS } from '../../src/db/operations.js'
import { connectionString, one, query } from './db.js'
import { currentSession } from './auth.js'
import { SESSION_COOKIE, fail, json, parseCookies, readBody } from './http.js'
import { ApiError, resolveCall, sanitizeArgs } from './scope.js'

/**
 * The single data endpoint.
 *
 * It is not a SQL proxy: it exposes exactly the operations declared in
 * `src/db/operations.js`, and `resolveCall` pins the tenant, the acting user
 * and row ownership to the verified session before any statement is built.
 * Everything the caller supplies is treated as a filter, never as scope.
 */

let repositoryPromise = null
const VERSIONED_OPERATIONS = {
  'cars.update': ['cars', 0],
  'cars.remove': ['cars', 0],
  // A renewal rewrites three date columns on one vehicle, so a stale client
  // must not be able to silently overwrite a renewal made elsewhere.
  'cars.renewLicense': ['cars', 0],
  'customers.update': ['customers', 0],
  'customers.remove': ['customers', 0],
  'rentals.update': ['rentals', 0],
  'rentals.returnCar': ['rentals', 0],
  'rentals.cancel': ['rentals', 0],
  'rentals.remove': ['rentals', 0],
  'payments.remove': ['payments', 0],
}

function repository() {
  if (!repositoryPromise) {
    repositoryPromise = createNeonRepository(connectionString(), { query }).catch((error) => {
      repositoryPromise = null
      throw error
    })
  }
  return repositoryPromise
}

/** Error messages that describe our own state are safe to show; SQL is not. */
function safeMessage(error) {
  if (error instanceof ApiError) return error.message
  const text = String(error?.message || '')
  if (/not found|already|invalid|must be|password|email|account|admin|permission|set up|json/i.test(text)) {
    return text
  }
  console.error('[api/data]', error)
  return 'The request could not be completed.'
}

export default async function handler(event) {
  if (event.httpMethod !== 'POST') return fail('Method not allowed.', 405)

  let body
  try {
    body = readBody(event)
  } catch (cause) {
    return fail(cause.message, cause.statusCode || 400)
  }

  const operation = typeof body.operation === 'string' ? body.operation : ''
  if (!Object.prototype.hasOwnProperty.call(OPERATIONS, operation)) {
    return fail('Unknown operation.', 404)
  }

  try {
    const session = await currentSession(parseCookies(event)[SESSION_COOKIE])
    const sync = body.sync && typeof body.sync === 'object' ? body.sync : null
    if (sync?.force && session?.role !== 'admin') {
      throw new ApiError('Only an admin can resolve an offline data conflict.', 403)
    }
    const clientArgs = sanitizeArgs(Array.isArray(body.args) ? body.args : [])
    const { group, method, args, guardResult } = await resolveCall(
      operation,
      clientArgs,
      session,
    )

    const repo = await repository()
    if (sync?.mutationId) {
      if (!/^[0-9a-f-]{36}$/i.test(sync.mutationId)) {
        throw new ApiError('Invalid offline mutation identifier.', 400)
      }

      const versioned = VERSIONED_OPERATIONS[operation]
      if (versioned && sync.baseVersion && !sync.force) {
        const [table, index] = versioned
        const id = args[index]
        const current = await one(
          `SELECT * FROM ${table} WHERE id = $1 AND company_id = $2`,
          [id, session.companyId],
        )
        if (!current && operation.endsWith('.remove')) {
          return json({ data: { removed: true } })
        }
        if (!current || new Date(current.updated_at).toISOString() !== sync.baseVersion) {
          return json({ conflict: { mutationId: sync.mutationId, operation, remote: current } }, 409)
        }
      }
    }
    const target = repo[group]
    const fn = target?.[method]
    if (typeof fn !== 'function') throw new ApiError('Misconfigured operation.', 500)

    const result = await fn.apply(target, args)

    // A guard may require fields to be dropped before they reach a browser,
    // e.g. the reset token that would otherwise be an account oracle.
    let payload = result
    if (guardResult?.strip?.length && result && typeof result === 'object') {
      payload = { ...result }
      for (const field of guardResult.strip) payload[field] = null
    }

    return json({ data: payload ?? null })
  } catch (error) {
    const status = error instanceof ApiError ? error.statusCode : 500
    return fail(safeMessage(error), status)
  }
}