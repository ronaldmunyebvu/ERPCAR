/**
 * The single serverless entry point.
 *
 * Vercel resolves every `/api/*` request to this file (see the `rewrites` in
 * vercel.json), and it dispatches internally instead of one function per route.
 * That matters here for two reasons:
 *
 *  - One bundle, one pool. Every entry point builds its own copy of the module
 *    graph, so splitting the API across several files meant several independent
 *    connection pools, each paying its own TLS handshake to Neon.
 *  - A single place that can answer a request. The bundle dispatches on the path
 *    after the module graph has loaded once, rather than each function loading
 *    its own copy of it per cold start.
 *
 * The handlers keep their existing shape (a Vercel event in, a
 * `{ statusCode, headers, body }` object out) so they stay testable without a
 * server; only the routing between them is new.
 *
 * Notes on running as a function rather than a server:
 *  - there is no listen() and no port; Vercel owns the socket
 *  - the filesystem is read-only apart from /tmp, so nothing is written to disk
 *  - the database pool is warmed lazily on the first query rather than at module
 *    load. Warming on load made even the health check depend on the database
 *    being reachable, so a request that touches no data still waited on a
 *    connection it did not need.
 */
import { warmPool } from './_lib/db.js'
import authHandler from './_lib/handler-auth.js'
import dataHandler from './_lib/handler-data.js'
import healthHandler from './_lib/handler-health.js'

// Written to stderr because Vercel surfaces it in the function log. These three
// markers are diagnostic: they show whether the module finished loading, whether
// the handler was reached, and whether a reply left. A timeout with no marker at
// all means the function body never ran, which is a platform-side failure rather
// than anything this code can influence.
console.error('[api] module loaded')
process.on('exit', () => console.error('[api] process exiting'))

let warmed = false

/**
 * Opens the pool in the background, at most once per instance.
 *
 * Deliberately not awaited: the TLS handshake to Neon takes several seconds, and
 * blocking on it would spend the request's whole budget before doing any work.
 */
function warmOnce() {
  if (warmed) return
  warmed = true
  warmPool().catch(() => {})
}

const ROUTES = new Map([
  ['/api/auth', authHandler],
  ['/api/data', dataHandler],
  ['/api/health', healthHandler],
])

export default async function handler(event) {
  const path = (event.path || event.rawPath || '').split('?')[0]
  console.error(`[api] handler invoked for ${path}`)
  const target = ROUTES.get(path)

  if (!target) {
    return {
      statusCode: 404,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: JSON.stringify({ error: 'Unknown endpoint.' }),
    }
  }

  // The pool is warmed on first use, so a request that needs no data - the
  // health check, or an unauthenticated call that is rejected outright - never
  // waits on a database connection.
  if (path !== '/api/health') warmOnce()

  return target(event)
}
