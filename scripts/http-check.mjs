/**
 * End-to-end check over real HTTP, the same way the browser and Vercel do it.
 *
 * The other checks import the handlers and call them directly, which cannot
 * catch a request that never reaches the function or a body that never gets
 * parsed. This mounts the real handlers on a Node HTTP server, translates
 * between Node's req/res and Vercel's event/return shape, and drives them with
 * fetch: cookies, JSON bodies, status codes and headers included.
 */
import { createServer } from 'node:http'

const modules = {
  '/api/auth': (await import('../api/auth.js')).default,
  '/api/data': (await import('../api/data.js')).default,
  '/api/health': (await import('../api/health.js')).default,
}

const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0]
  const handler = modules[path]

  if (!handler) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('Not Found')
    return
  }

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)

  const event = {
    httpMethod: req.method,
    headers: req.headers,
    body: chunks.length ? Buffer.concat(chunks).toString('utf8') : null,
    query: Object.fromEntries(new URL(req.url, 'http://localhost').searchParams),
  }

  try {
    const result = await handler(event)
    const headers = { ...result.headers }
    res.writeHead(result.statusCode, headers)
    res.end(result.body ?? '')
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: error.message }))
  }
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

const post = (path, body, cookie) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })

console.log('GET probes')
const health = await fetch(`${base}/api/health`)
const healthBody = await health.json()
check('health returns 200', health.status === 200, `status ${health.status}`)
check('health reports no secrets in the body', !JSON.stringify(healthBody).includes(process.env.JWT_SECRET ?? 'x'))

const getAuth = await fetch(`${base}/api/auth`)
check('GET /api/auth is 405', getAuth.status === 405, `status ${getAuth.status}`)

const missing = await fetch(`${base}/api/nope`)
check('unknown /api path is 404', missing.status === 404, `status ${missing.status}`)

console.log('\nLive data')
const setup = await post('/api/data', { operation: 'auth.isSetupComplete', args: [] })
const setupBody = await setup.json()
check('auth.isSetupComplete answers', setup.status === 200, JSON.stringify(setupBody))

console.log('\nAuthorisation')
const anon = await post('/api/data', { operation: 'companies.list', args: [] })
check('companies.list without a session is 401', anon.status === 401, `status ${anon.status}`)

const bad = await post('/api/auth', { action: 'signIn', email: 'nobody@example.com', password: 'wrong-password' })
const badBody = await bad.json()
check(
  'unknown email is a 4xx, not a server error',
  bad.status >= 400 && bad.status < 500,
  `${bad.status} ${JSON.stringify(badBody)}`,
)

const session = await post('/api/auth', { action: 'session' })
const sessionBody = await session.json()
check('session reports signed out', session.status === 200 && sessionBody.signedIn === false)

console.log('\nManifest')
// An operation that is not in the allowlist must never reach a repository
// method. Any 4xx is acceptable; what matters is that it is refused.
const badOp = await post('/api/data', { operation: 'pg.sleeptime', args: [] })
check('operation outside the manifest is refused', badOp.status >= 400 && badOp.status < 500, `status ${badOp.status}`)

const badGroup = await post('/api/data', { operation: 'notAGroup.method', args: [] })
check('unknown group is refused', badGroup.status >= 400 && badGroup.status < 500, `status ${badGroup.status}`)

server.close()
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
process.exit(failures === 0 ? 0 : 1)