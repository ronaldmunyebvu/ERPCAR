/**
 * Data source entry point.
 *
 * The rest of the app only ever talks to this repository object, so swapping
 * the storage engine never requires UI changes:
 *
 *   VITE_DATA_SOURCE=mock -> localStorage for local development
 *   VITE_DATA_SOURCE=api  -> Neon Postgres through the Vercel functions in /api
 *
 * `api` is the only supported production mode. The older `neon` value talked to
 * Neon straight from the browser, which meant the `VITE_`-prefixed connection
 * string was compiled into a public JS bundle along with the session-signing
 * key. That mode has been removed rather than left available by accident.
 */

// Never let a production deployment silently fall back to browser-only storage.
// Local development keeps the mock as a convenient default.
const DATA_SOURCE = import.meta.env.PROD
  ? 'api'
  : import.meta.env.VITE_DATA_SOURCE || 'mock'

let repositoryPromise = null

async function createRepository() {
  if (DATA_SOURCE === 'api') {
    const { createApiRepository } = await import('./remote/repo.api')
    return createApiRepository()
  }
  if (DATA_SOURCE === 'neon') {
    throw new Error(
      'VITE_DATA_SOURCE=neon is no longer supported because it exposed the database credentials in the browser bundle. Set VITE_DATA_SOURCE=api and configure DATABASE_URL on the server.',
    )
  }
  // Imported lazily so the demo dataset, including its well-known credentials,
  // is absent from the production bundle when the live database is in use.
  const { createMockRepository } = await import('./mock/repo.mock')
  return createMockRepository()
}

export function getRepository() {
  if (!repositoryPromise) {
    repositoryPromise = createRepository().catch((error) => {
      repositoryPromise = null
      throw error
    })
  }
  return repositoryPromise
}

/** True when reads and writes go to the live database. */
export function isLiveMode() {
  return DATA_SOURCE === 'api'
}

export const dataSource = DATA_SOURCE