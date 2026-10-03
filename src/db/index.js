import { createMockRepository } from './mock/repo.mock'

/**
 * Data source entry point.
 *
 * The rest of the app only ever talks to this repository object, so swapping
 * the storage engine never requires UI changes:
 *
 *   VITE_DATA_SOURCE=mock  -> localStorage (default, works with no database)
 *   VITE_DATA_SOURCE=neon  -> Neon Postgres over the serverless HTTP driver
 *
 * To connect Neon later:
 *   1. Create a Neon project and run `src/db/schema.sql` in its SQL Editor.
 *   2. Copy `.env.example` to `.env`.
 *   3. Set VITE_NEON_DATABASE_URL and VITE_DATA_SOURCE=neon, restart `npm run dev`.
 */

const DATA_SOURCE = import.meta.env.VITE_DATA_SOURCE || 'mock'
export const SESSION_SECRET =
  import.meta.env.VITE_SESSION_SECRET || 'dev-only-insecure-session-secret'

let repositoryPromise = null

async function createRepository() {
  if (DATA_SOURCE === 'neon') {
    const { createNeonRepository } = await import('./neon/repo.neon')
    return createNeonRepository(import.meta.env.VITE_NEON_DATABASE_URL)
  }
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

export function isNeonMode() {
  return DATA_SOURCE === 'neon'
}

export const dataSource = DATA_SOURCE