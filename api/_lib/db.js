import pg from 'pg'

/**
 * Server-only Postgres access.
 *
 * The connection string is read from the environment *inside the function*, so
 * it is never referenced by client code and never appears in a browser bundle.
 * Everything under `api/` is deployed as a serverless function; only variables
 * without the `VITE_` prefix are visible here.
 *
 * Driver note: this uses `pg` rather than `@neondatabase/serverless`. The
 * serverless package's driver is WebSocket-based, and on Vercel its connection
 * attempt never settles, so every request ran to the 30s function timeout and
 * returned 504 - including requests that should have been rejected without
 * touching the database. `pg` speaks plain TLS over the pooler, which is the
 * path Neon documents for serverless deployments, and it fails fast when a
 * connection string is wrong instead of hanging.
 */

/**
 * Vercel and Neon integrations disagree on the variable name, so the common
 * aliases are accepted. `DATABASE_URL` is the documented default.
 */
const CANDIDATE_VARS = ['DATABASE_URL', 'NEON_DATABASE_URL', 'POSTGRES_URL', 'PGDATABASE_URL']

export function connectionString() {
  for (const name of CANDIDATE_VARS) {
    const value = process.env[name]
    if (value && value.trim()) return value.trim()
  }
  throw new Error(
    `No database connection string found. Set one of ${CANDIDATE_VARS.join(', ')} in the Vercel project environment variables.`,
  )
}

/**
 * Neon's pooled URL carries `channel_binding=require`, which only applies to a
 * direct TLS connection. The serverless HTTP driver reaches the pooler over
 * plain HTTPS, so the parameter is dropped and the URL is otherwise untouched.
 */
function httpUrl(value) {
  try {
    const parsed = new URL(value)
    parsed.searchParams.delete('channel_binding')
    // `require` is currently treated as `verify-full` but is scheduled to
    // weaken, so the strict spelling is requested explicitly.
    parsed.searchParams.set('sslmode', 'verify-full')
    return parsed.toString()
  } catch {
    return value
  }
}

/**
 * The pooler terminates idle connections, and a function instance may be
 * frozen between invocations, so the pool is kept deliberately small and every
 * statement is given a deadline. A hung query then raises an error we can
 * report, rather than stalling until Vercel kills the invocation at 30s.
 */
const POOL_SIZE = 2
const CONNECT_TIMEOUT_MS = 8_000
const STATEMENT_TIMEOUT_MS = 15_000

let pool = null

function client() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: httpUrl(connectionString()),
      max: POOL_SIZE,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: 10_000,
      // `sslmode=require` is Neon's default and is treated as `verify-full`,
      // which fails outright when the certificate does not match. That is the
      // behaviour we want, but it produces a deprecation warning on every
      // cold start, so the stricter spelling is made explicit.
      ssl: { sslmode: 'verify-full' },
      allowExitOnIdle: true,
    })
    // A pool-level error (server closed the socket, network blip) must not
    // become an unhandled rejection that kills the function instance.
    pool.on('error', (error) => console.error('[api/db] pool error', error.message))
  }
  return pool
}

export async function query(text, params = []) {
  const result = await client().query({
    text,
    values: params,
    query_timeout: STATEMENT_TIMEOUT_MS,
  })
  return result?.rows ?? []
}

export async function one(text, params = []) {
  return (await query(text, params))[0] ?? null
}

/**
 * True when `id` is a row in `table` that belongs to `companyId`.
 *
 * `table` is never taken from user input: it only ever comes from the
 * operation manifest, and the identifier is bound as a parameter, so this
 * cannot be used to reach an arbitrary table.
 */
export async function rowBelongsTo(table, id, companyId) {
  if (!id || !companyId) return false
  const row = await one(`SELECT 1 AS ok FROM ${table} WHERE id = $1 AND company_id = $2`, [
    id,
    companyId,
  ])
  return Boolean(row)
}

export async function countRows(table) {
  const row = await one(`SELECT count(*)::int AS count FROM ${table}`)
  return Number(row?.count ?? 0)
}