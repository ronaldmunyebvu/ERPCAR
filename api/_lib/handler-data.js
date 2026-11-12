import { createNeonRepository } from '../../src/db/neon/repo.neon.js'
import { OPERATIONS } from '../../src/db/operations.js'
import { connectionString, query } from './db.js'
import { mail } from './mailer.js'
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

function repository() {
  if (!repositoryPromise) {
    repositoryPromise = createNeonRepository(connectionString(), { query }, mail).catch((error) => {
      repositoryPromise = null
      throw error
    })
  }
  return repositoryPromise
}

/**
 * Ordinary user mistakes — a wrong reset code, a stale link, a duplicate
 * address — are safe to show and belong with a 4xx, because they describe
 * what the caller did rather than what broke. Anything else is logged and
 * replaced with a generic message, so a query, a hostname or a column name
 * can never reach the browser.
 */
const USER_FAULT = /not found|already|invalid|incorrect|expired|attempt|must be|password|email|account|admin|permission|set up|json/i

function safeMessage(error) {
  if (error instanceof ApiError) return error.message
  const text = String(error?.message || '')
  if (USER_FAULT.test(text)) return text
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
    const clientArgs = sanitizeArgs(Array.isArray(body.args) ? body.args : [])
    const { group, method, args, guardResult } = await resolveCall(
      operation,
      clientArgs,
      session,
    )

    const repo = await repository()
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
    const status =
      error instanceof ApiError
        ? error.statusCode
        : USER_FAULT.test(String(error?.message || ''))
        ? 400
        : 500
    return fail(safeMessage(error), status)
  }
}