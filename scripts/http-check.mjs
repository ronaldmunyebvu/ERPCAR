/**
 * End-to-end check over real HTTP, the same way the browser and Vercel do it.
 *
 * The other checks import the handlers and call them directly, which cannot
 * catch a request that never reaches the function or a body that never gets
 * parsed. This mounts the real single entry point on a Node HTTP server and
 * drives its Vercel req/res contract with fetch: cookies, JSON bodies, status
 * codes and headers included.
 *
 * Requests go to `/api/<endpoint>` because that is the URL the browser uses;
 * `api/index.js` is what Vercel actually invokes, so this exercises the
 * dispatching as well as the handlers.
 */
import { createServer } from 'node:http'

const entry = (await import('../api/index.js')).default

const server = createServer(async (req, res) => {
  await entry(req, res)
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

console.log('Routing')
const health = await fetch(`${base}/api/health`)
const healthBody = await health.json()
check('health returns 200', health.status === 200, `status ${health.status}`)
check(
  'health reports no secrets in the body',
  !JSON.stringify(healthBody).includes(process.env.JWT_SECRET ?? 'x'),
)

const getAuth = await fetch(`${base}/api/auth`)
check('GET /api/auth is 405', getAuth.status === 405, `status ${getAuth.status}`)

const unknown = await post('/api/doesnotexist', {})
check('unknown /api endpoint is 404', unknown.status === 404, `status ${unknown.status}`)

console.log('\nLive data')
const setup = await post('/api/data', { operation: 'auth.isSetupComplete', args: [] })
const setupBody = await setup.json()
check('auth.isSetupComplete answers', setup.status === 200, JSON.stringify(setupBody))

console.log('\nAuthorisation')
const anon = await post('/api/data', { operation: 'companies.list', args: [] })
check('companies.list without a session is 401', anon.status === 401, `status ${anon.status}`)

const bad = await post('/api/auth', {
  action: 'signIn',
  email: 'nobody@example.com',
  password: 'wrong-password',
})
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
const badOp = await post('/api/data', { operation: 'pg.sleeptime', args: [] })
check('operation outside the manifest is refused', badOp.status === 404, `status ${badOp.status}`)

const badGroup = await post('/api/data', { operation: 'notAGroup.method', args: [] })
check('unknown group is refused', badGroup.status === 404, `status ${badGroup.status}`)

server.close()
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
process.exit(failures === 0 ? 0 : 1)