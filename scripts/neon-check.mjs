/**
 * Exercises the real Neon repository against the live database.
 * Run with: npm run db:check
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createServer } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function connectionString() {
  if (process.env.NEON_DATABASE_URL) return process.env.NEON_DATABASE_URL
  const dotenv = readFileSync(resolve(ROOT, '.env'), 'utf8')
  const match = dotenv.match(/^\s*VITE_NEON_DATABASE_URL\s*=\s*(.+)\s*$/m)
  if (!match) throw new Error('No connection string found in .env')
  return match[1].replace(/^["']|["']$/g, '')
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

let failures = 0

function check(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then((value) => {
      const detail =
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.entries(value)
              .map(([key, entry]) => `${key}=${Array.isArray(entry) ? entry.length : JSON.stringify(entry)}`)
              .join(' ')
          : Array.isArray(value)
            ? `${value.length} rows`
            : JSON.stringify(value)
      console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
    })
    .catch((error) => {
      failures += 1
      const cause = error.cause ? ` | cause: ${error.cause.code || ''} ${error.cause.message || error.cause}` : ''
      console.log(`  ✗ ${label}\n      ${error.message}${cause}`)
    })
}

try {
  const { createNeonRepository } = await server.ssrLoadModule('/src/db/neon/repo.neon.js')
  const repository = await createNeonRepository(connectionString())

  console.log('\nAuth')
  await check('isSetupComplete', () => repository.auth.isSetupComplete())
  const session = await repository.auth
    .signIn({ email: 'admin@falconcarhire.test', password: 'Admin@123' })
    .then(
      (value) => ({ id: value.user.id, name: value.user.full_name, role: value.user.role }),
      (error) => {
        failures += 1
        console.log(`  ✗ signIn as admin — ${error.message}`)
        return null
      },
    )
  if (session) console.log(`  ✓ signIn as admin — ${JSON.stringify(session)}`)
const account = session ? await repository.auth.findUserById(session.id) : null
if (account?.user) console.log(`  ✓ findUserById — ${account.user.full_name}`)
const company = account?.company ?? null
if (company) console.log(`  ✓ companies.get — ${company.name} (${company.currency})`)

  if (!company) {
    console.log('\nNo seeded company found. Run: npm run db:setup:force')
    process.exit(1)
  }

  const companyId = company.id
  const range = { from: undefined, to: undefined }

  console.log('\nData')
  await check('cars.list', () => repository.cars.list({ companyId }))
  await check('cars.categories', () => repository.cars.categories({ companyId }))
  await check('customers.list', () => repository.customers.list({ companyId }))
  await check('customers.list + search', () => repository.customers.list({ companyId, search: 'grace' }))
  await check('rentals.list', () => repository.rentals.list({ companyId }))
  await check('rentals.list + status=active', () => repository.rentals.list({ companyId, status: 'active' }))
  await check('rentals.list + search', () => repository.rentals.list({ companyId, search: 'FCH' }))

  const rental = (await repository.rentals.list({ companyId }))[0]
  await check('rentals.get', () => repository.rentals.get(rental.id, { companyId }))
  await check('customers.history', () => repository.customers.history(rental.customer_id, { companyId }))
  await check('payments.list', () => repository.payments.list({ companyId }))
  await check('payments.list + method', () => repository.payments.list({ companyId, method: 'cash' }))
  await check('users.list', () => repository.users.list({ companyId }))

  console.log('\nReports')
  await check('reports.dashboard', () => repository.reports.dashboard(companyId))
  await check('reports.revenue', () => repository.reports.revenue(companyId, range))
  await check('reports.utilization', () => repository.reports.utilization(companyId, range))
  await check('reports.memberActivity', () => repository.reports.memberActivity(companyId, range))
  await check('activity.list', () => repository.activity.list({ companyId, limit: 20 }))
  await check('activity.list + action filter', () => repository.activity.list({ companyId, action: 'rental' }))

  console.log(failures === 0 ? '\nAll Neon checks passed.\n' : `\n${failures} check(s) failed.\n`)
  process.exit(failures === 0 ? 0 : 1)
} finally {
  await server.close()
}