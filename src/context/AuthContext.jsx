import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getRepository, isLiveMode } from '@/db'
import * as authApi from '@/db/remote/auth.api'
import {
  clearOfflineAccount,
  getOfflineAccount,
  saveOfflineAccount,
} from '@/db/offline/local'
import { signToken, verifyToken } from '@/lib/crypto'

/**
 * Auth state.
 *
 * In live mode (always enabled for production builds) there is deliberately no
 * token in this module: the session is an `httpOnly` cookie that the server
 * reads, verifies, and re-checks against the users table on every request.
 * Nothing to steal from `localStorage`, nothing to forge, and no signing key in
 * the bundle.
 *
 * Demo mode has no server to hold a cookie, so it keeps the original local
 * token purely to preserve the offline experience. That path stores only
 * browser-local mock data and is never used in production.
 */

const AuthContext = createContext(null)
const SESSION_KEY = 'carrental.session'
const MOCK_SECRET = 'demo-only-insecure-session-secret'

function readMockSession() {
  const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY)
  return raw ? verifyToken(raw, MOCK_SECRET) : Promise.resolve(null)
}

function clearMockSession() {
  sessionStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_KEY)
}

async function accountFromMockToken() {
  const payload = await readMockSession()
  if (!payload) return null
  const repo = await getRepository()
  const account = await repo.auth.findUserById(payload.userId)
  if (!account || account.user.status !== 'active') return null
  return { ...account, token: payload }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    const restore = isLiveMode()
      ? authApi.restore().catch((cause) => {
          if (cause.status === 0) {
            const cached = getOfflineAccount()
            if (cached) return cached
          }
          throw cause
        })
      : accountFromMockToken()

    restore
      .then((account) => {
        if (cancelled) return
        if (!account) {
          if (isLiveMode() && navigator.onLine) clearOfflineAccount()
          return
        }
        setUser(account.user)
        setCompany(account.company)
        if (isLiveMode() && navigator.onLine) {
          saveOfflineAccount(account)
          getRepository()
            .then((repo) => repo.bootstrap(account.company.id))
            .catch((cause) => console.error('[offline] could not refresh company cache', cause))
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause.message)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Puts a freshly issued account into state and warms the offline cache.
   *
   * Every path that ends a login — password, confirmation link — finishes here
   * so none of them can leave the session half-built.
   */
  const adopt = useCallback((account) => {
    if (isLiveMode()) {
      saveOfflineAccount(account)
      getRepository()
        .then((repo) => repo.bootstrap(account.company.id))
        .catch((cause) => console.error('[offline] could not prepare company cache', cause))
    }
    setUser(account.user)
    setCompany(account.company)
    return account.user
  }, [])

  const signIn = useCallback(
    async (credentials) => {
      const account = isLiveMode()
        ? await authApi.signIn(credentials.email, credentials.password)
        : await getRepository().then(async (repo) => {
            const found = await repo.auth.signIn(credentials)
            const token = await signToken(
              { userId: found.user.id, companyId: found.company.id, role: found.user.role },
              MOCK_SECRET,
            )
            sessionStorage.setItem(SESSION_KEY, token)
            localStorage.setItem(SESSION_KEY, token)
            return found
          })
      return adopt(account)
    },
    [adopt],
  )

  /**
   * Redeems the one-time link emailed when a company is created.
   *
   * The server treats a valid link as proof of the address and signs the owner
   * in with it, so this finishes exactly like a password sign-in.
   */
  const confirmEmail = useCallback(
    async (confirmationToken) => {
      if (isLiveMode()) return adopt(await authApi.confirmEmail(confirmationToken))
      const account = await getRepository().then((repo) =>
        repo.auth.confirmEmail(confirmationToken),
      )
      const token = await signToken(
        { userId: account.user.id, companyId: account.company.id, role: account.user.role },
        MOCK_SECRET,
      )
      sessionStorage.setItem(SESSION_KEY, token)
      localStorage.setItem(SESSION_KEY, token)
      return adopt(account)
    },
    [adopt],
  )

  const signOut = useCallback(async () => {
    if (isLiveMode()) await authApi.signOut().catch(() => {})
    else clearMockSession()
    if (isLiveMode()) clearOfflineAccount()
    setUser(null)
    setCompany(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!user) return null
    const account = isLiveMode() && !navigator.onLine
      ? getOfflineAccount()
      : isLiveMode()
      ? await authApi.restore()
      : await getRepository().then((repo) => repo.auth.findUserById(user.id))
    if (account) {
      setUser(account.user)
      setCompany(account.company)
    }
    return account
  }, [user])

  const value = useMemo(
    () => ({
      user,
      company,
      ready,
      error,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      isMember: user?.role === 'member',
      signIn,
      confirmEmail,
      signOut,
      refresh,
      clearError: () => setError(null),
    }),
    [user, company, ready, error, signIn, confirmEmail, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}