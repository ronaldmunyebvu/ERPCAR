import { neon } from '@neondatabase/serverless'

/**
 * Server-only Postgres access.
 *
 * The connection string is read from the environment *inside the function*, so
 * it is never referenced by client code and never appears in a browser bundle.
 * Everything under `api/` is deployed as a serverless function; only variables
 * without the `VITE_` prefix are visible here.
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
    return parsed.toString()
  } catch {
    return value
  }
}

let cached = null

function client() {
  if (!cached) cached = neon(httpUrl(connectionString()))
  return cached
}

export async function query(text, params = []) {
  const result = await client().query(text, params)
  // `sql.query()` resolves straight to the row array on some builds of the
  // driver and to a `{ rows }` envelope on others, so both are accepted.
  if (Array.isArray(result)) return result
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