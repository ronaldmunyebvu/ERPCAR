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
 *  - cold starts are common, so the pool is warmed in the background rather than
 *    awaited. The TLS handshake to Neon has been measured at several seconds, and
 *    blocking the first request on it would put it close to the timeout.
 */
import { warmPool } from './_lib/db.js'
import authHandler from './_lib/handler-auth.js'
import dataHandler from './_lib/handler-data.js'
import healthHandler from './_lib/handler-health.js'

warmPool().catch(() => {})

const ROUTES = new Map([
  ['/api/auth', authHandler],
  ['/api/data', dataHandler],
  ['/api/health', healthHandler],
])

export default async function handler(event) {
  const path = (event.path || event.rawPath || '').split('?')[0]
  const target = ROUTES.get(path)

  if (!target) {
    return {
      statusCode: 404,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: JSON.stringify({ error: 'Unknown endpoint.' }),
    }
  }

  return target(event)
}
