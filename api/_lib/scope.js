import { OPERATIONS, groupOf, methodOf } from '../../src/db/operations.js'
import { countRows, one, rowBelongsTo } from './db.js'
import { actorFor } from './auth.js'

/**
 * Turns an untrusted `{ group, method, args }` request into a call that is
 * safe to make, or throws.
 *
 * Everything a client sends is treated as a hint. The company and the acting
 * user always come from the verified session, and any row the caller does not
 * own is refused before a statement runs. Without this the dispatcher would be
 * an authenticated SQL proxy: a member of one company could name another
 * company's id and read or alter it.
 */

export class ApiError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.statusCode = statusCode
  }
}

/** Table names are compile-time constants from the manifest, never request input. */
function assertKnownTable(table) {
  if (!['users', 'cars', 'customers', 'rentals', 'payments'].includes(table)) {
    throw new ApiError('Unknown table in operation manifest.', 500)
  }
  return table
}

async function checkOwn(table, id, companyId) {
  assertKnownTable(table)
  if (!(await rowBelongsTo(table, id, companyId))) {
    throw new ApiError('Not found.', 404)
  }
}

/**
 * Guards that depend on server state or policy rather than on the session.
 */
const GUARDS = {
  /**
   * Public signup is only legitimate while the database is empty. Left
   * unguarded, anyone could POST a second company and become its owner.
   */
  async noCompaniesExist() {
    if ((await countRows('companies')) > 0) {
      throw new ApiError('This workspace has already been set up.', 409)
    }
  },

  /**
   * The reset page has no mail server behind it and shows the link on screen,
   * which is fine for a local demo but would hand an attacker a working reset
   * token for any address they typed. It would also answer "does this address
   * belong to an account?", which is an enumeration oracle.
   *
   * So in production both the token and the user record are stripped, leaving
   * a response that is identical whether or not the account exists.
   */
  async resetTokenPolicy() {
    const expose = process.env.EXPOSE_RESET_TOKEN === 'true' || process.env.NODE_ENV !== 'production'
    return { expose, strip: expose ? [] : ['token', 'user'] }
  },
}

/**
 * Applies the manifest's argument rewrites.
 *
 * `key: null` replaces the argument outright, which is how methods that take a
 * bare `companyId` are pinned to the caller's own company.
 */
function applyForce(args, force, session) {
  if (!force) return args
  const next = args.slice()
  for (const rule of force) {
    const { index, key, from } = rule
    const value = session[from]
    if (!value) throw new ApiError('Session is missing tenant context.', 401)
    if (key === null) {
      next[index] = value
    } else {
      const current = next[index]
      next[index] = current && typeof current === 'object' ? { ...current, [key]: value } : { [key]: value }
    }
  }
  return next
}

/** Replaces the trailing `actor` argument with the signed-in user. */
function applyActor(args, index, session) {
  const next = args.slice()
  while (next.length < index) next.push(undefined)
  next[index] = actorFor(session)
  return next
}

/** Runs a named guard, for endpoints that need it outside `resolveCall`. */
export async function runGuard(name) {
  const guard = GUARDS[name]
  if (!guard) throw new ApiError('Unknown guard.', 500)
  return guard()
}

/**
 * Resolves an operation into the concrete call to perform.
 *
 * Returns `{ op, group, method, args, guardResult }`.
 */
export async function resolveCall(operation, args, session) {
  const spec = OPERATIONS[operation]
  if (!spec) throw new ApiError('Unknown operation.', 404)

  /* ---- authentication ------------------------------------------------- */
  const needsSession = spec.auth !== 'public'
  if (needsSession && !session) throw new ApiError('Sign in to continue.', 401)
  if (spec.auth === 'admin' && session?.role !== 'admin') {
    throw new ApiError('You do not have permission to do that.', 403)
  }

  let guardResult = null
  if (spec.guard) guardResult = await GUARDS[spec.guard]()

  /* ---- operation substitution ----------------------------------------- */
  // Some methods are unsafe as written (they select across every tenant), so
  // they are served by a narrower implementation instead.
  const effective = spec.replace ? OPERATIONS[spec.replace] : spec
  if (!effective) throw new ApiError('Misconfigured operation.', 500)
  const group = groupOf(effective === spec ? operation : spec.replace)
  const method = methodOf(effective === spec ? operation : spec.replace)
  const isSubstituted = Boolean(spec.replace)

  // A substituted call starts from the target's own argument contract; the
  // substituted-from key carries its rules.
  let resolved = isSubstituted ? (method === 'get' ? [undefined] : [{}]) : (Array.isArray(args) ? args : [])
  if (spec.force) resolved = applyForce(resolved, spec.force, session)
  if (effective.force) resolved = applyForce(resolved, effective.force, session)

  /* ---- row ownership --------------------------------------------------- */
  if (session && effective.own) {
    await checkOwn(effective.own, resolved[0], session.companyId)
  }
  if (session && effective.owner) {
    for (const rule of effective.owner) {
      const target = resolved[rule.arg]
      if (!target) continue
      await checkOwn(effective.own, target[rule.key], session.companyId)
    }
  }

  /* ---- actor identity -------------------------------------------------- */
  const actorIndex = effective.actor
  if (session && typeof actorIndex === 'number') {
    resolved = applyActor(resolved, actorIndex, session)
  }

  return { group, method, args: resolved, guardResult }
}

/**
 * Rejects arguments that are not plain JSON-ish values. This keeps a caller
 * from smuggling prototypes or non-serialisable structures into the repository
 * layer, which spreads them into query parameters.
 */
export function sanitizeArgs(value, depth = 0) {
  if (depth > 8) throw new ApiError('Request arguments nested too deeply.', 400)
  if (value === null || value === undefined) return value
  const type = typeof value
  if (type === 'string' || type === 'boolean') return value
  if (type === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map((entry) => sanitizeArgs(entry, depth + 1))
  if (type === 'object') {
    const out = {}
    for (const [key, entry] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      out[key] = sanitizeArgs(entry, depth + 1)
    }
    return out
  }
  return null
}

/** Convenience wrapper used by the password-reset handler. */
export async function userByEmail(email) {
  return one('SELECT * FROM users WHERE lower(email) = lower($1)', [String(email).trim()])
}