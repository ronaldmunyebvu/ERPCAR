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
  await check('reports.fleetPerformance', () => repository.reports.fleetPerformance(companyId, range))
  await check(
    'reports.fleetPerformance + ownership filter',
    () => repository.reports.fleetPerformance(companyId, { ...range, ownership: 'sub_lease' }),
  )
  await check('activity.list', () => repository.activity.list({ companyId, limit: 20 }))
  await check('activity.list + action filter', () => repository.activity.list({ companyId, action: 'rental' }))

  console.log('\nOwnership + Zinara licence')
  // One scratch vehicle is created, renewed and removed so the whole licence
  // round trip runs against the live schema without leaving data behind.
  let scratch = null
  try {
    scratch = await repository.cars.create(
      {
        company_id: companyId,
        make: 'Licence',
        model: 'Check',
        year: 2024,
        registration: 'TST-LIC',
        color: 'White',
        category: 'other',
        daily_rate: 20,
        status: 'inactive',
        ownership: 'sub_lease',
        owner_first_name: 'Check',
        owner_last_name: 'Script',
        company_share_percent: 75,
        license_valid_from: '2026-01-01',
        license_valid_to: '2026-01-15',
      },
      { id: session.id },
    )
    console.log(
      `  ✓ cars.create (sub-lease) — share=${scratch.company_share_percent} owner=${scratch.owner_first_name} ${scratch.owner_last_name}`,
    )
  } catch (error) {
    failures += 1
    console.log(`  ✗ cars.create (sub-lease) — ${error.message}`)
  }
  if (scratch?.id) {
    await check('cars.renewLicense', async () => {
      const renewed = await repository.cars.renewLicense(
        scratch.id,
        new Date().toISOString().slice(0, 10),
        { id: session.id },
      )
      return {
        ownership: renewed.ownership,
        share: renewed.company_share_percent,
        valid_from: renewed.license_valid_from,
        valid_to: renewed.license_valid_to,
      }
    })
    await check('reports.dashboard includes the expiry list', async () => {
      const dash = await repository.reports.dashboard(companyId)
      const found = (dash.attention.licenses || []).find((car) => car.id === scratch.id)
      if (!found) throw new Error('scratch vehicle missing from attention.licenses')
      return { days_left: found.days_left, owner: found.owner }
    })
    await check('cars.remove', () => repository.cars.remove(scratch.id, { id: session.id }))
  }

  console.log(failures === 0 ? '\nAll Neon checks passed.\n' : `\n${failures} check(s) failed.\n`)
  process.exit(failures === 0 ? 0 : 1)
} finally {
  await server.close()
}