import { createNeonRepository } from '../src/db/neon/repo.neon.js'
import { connectionString, query } from './_lib/db.js'
import { currentSession, issueSession } from './_lib/auth.js'
import {
  SESSION_COOKIE,
  clearSessionCookie,
  fail,
  json,
  parseCookies,
  readBody,
  sessionCookie,
} from './_lib/http.js'
import { ApiError, runGuard } from './_lib/scope.js'

/**
 * Authentication endpoint.
 *
 * Sign-in is the one place that verifies a password, and it happens here. The
 * browser no longer receives a signing key, a password hash, or a token it can
 * read: it gets an opaque `httpOnly` cookie that JavaScript cannot touch.
 */

let repositoryPromise = null

function repository() {
  if (!repositoryPromise) {
    repositoryPromise = createNeonRepository(connectionString(), { query }).catch((error) => {
      repositoryPromise = null
      throw error
    })
  }
  return repositoryPromise
}

/**
 * Messages the repository raises for ordinary user mistakes, such as a wrong
 * password or an unknown address. These are the caller's fault, not the
 * server's, so they are returned verbatim and paired with a 4xx status. Anything
 * not on this list is treated as a genuine fault: it is logged server-side and
 * replaced with a generic message, so an unexpected error can never leak a
 * query, a hostname or a column name to the browser.
 */
const USER_FAULT = /not found|incorrect|deactivated|password|email|account|already|json|admin|taken|invalid|expired/i

function safeMessage(error) {
  if (error instanceof ApiError) return error.message
  const text = String(error?.message || '')
  if (USER_FAULT.test(text)) return text
  console.error('[api/auth]', error)
  return 'The request could not be completed.'
}

/** 4xx for a caller mistake, 500 for a fault on our side. */
function statusFor(error) {
  if (error instanceof ApiError) return error.statusCode
  return USER_FAULT.test(String(error?.message || '')) ? 400 : 500
}

/** Strips anything that must never cross the wire. */
function publicAccount(user, company) {
  if (!user) return null
  const { password_hash, ...safe } = user
  void password_hash
  return { user: safe, company }
}

const ACTIONS = {
  /** Used by the client on every load to restore a session. */
  async session(repo, session) {
    if (!session) return { account: null }
    return { account: publicAccount(session.user, session.company) }
  },

  async signIn(repo, _session, payload, event) {
    const email = String(payload.email || '').trim()
    const password = String(payload.password || '')
    if (!email || !password) throw new ApiError('Enter your email address and password.')

    const account = await repo.auth.signIn({ email, password })
    const { token, maxAge } = issueSession({
      userId: account.user.id,
      companyId: account.company.id,
      role: account.user.role,
    })
    return {
      account: publicAccount(account.user, account.company),
      cookie: sessionCookie(event, token, maxAge),
    }
  },

  async signOut() {
    // The handler replaces this with an expired cookie.
    return {}
  },

  /** First-run provisioning. Refused once a company exists. */
  async setup(repo, _session, payload, event) {
    await runGuard('noCompaniesExist')
    const { company, owner } = payload
    if (!company?.name || !owner?.full_name || !owner?.email || !owner?.password) {
      throw new ApiError('Company name, your name, email and password are all required.')
    }
    if (String(owner.password).length < 8) {
      throw new ApiError('Choose a password with at least 8 characters.')
    }
    const user = await repo.auth.createCompanyWithOwner({ company, owner })
    const created = await repo.auth.findUserById(user.id)
    const { token, maxAge } = issueSession({
      userId: user.id,
      companyId: created.company.id,
      role: user.role,
    })
    return {
      account: publicAccount(created.user, created.company),
      cookie: sessionCookie(event, token, maxAge),
    }
  },
}

export default async function handler(event) {
  if (event.httpMethod !== 'POST') return fail('Method not allowed.', 405)

  let payload
  try {
    payload = readBody(event)
  } catch (cause) {
    return fail(cause.message, cause.statusCode || 400)
  }

  const action = typeof payload.action === 'string' ? payload.action : ''
  const run = ACTIONS[action]
  if (!run) return fail('Unknown action.', 404)

  try {
    const session = await currentSession(parseCookies(event)[SESSION_COOKIE])
    const result = await run(await repository(), session, payload, event)

    // `cookie` is response-header material, never response body.
    const { cookie, ...body } = result
    const headers = {}
    if (cookie) headers['set-cookie'] = cookie
    // Sign-out clears the cookie by sending an already-expired one.
    if (action === 'signOut') headers['set-cookie'] = clearSessionCookie(event)

    return json({ ...body, signedIn: Boolean(body.account) }, 200, headers)
  } catch (error) {
    return fail(safeMessage(error), statusFor(error))
  }
}