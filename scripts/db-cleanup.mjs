/**
 * Removes the demonstration tenant from the database.
 *
 * A freshly seeded Neon database contains "Falcon Car Hire" with four accounts
 * whose passwords are published in `src/db/mock/seed.js`. Those must not
 * survive into a real deployment, but a full wipe would also destroy any
 * genuine company created through /setup.
 *
 *   node --env-file=.env scripts/db-cleanup.mjs            # preview
 *   node --env-file=.env scripts/db-cleanup.mjs --yes      # delete demo data
 *
 * Accounts are matched on the demo email domain, never on the company name, so
 * a real company is not caught by a rename. This is destructive; --yes is
 * required.
 */
import { query, one } from '../api/_lib/db.js'

/**
 * Emails belonging to the seeded demonstration tenant. See
 * `src/db/mock/seed.js`. Matching on address rather than on the company name
 * keeps this from touching a real company that happens to be called
 * "Falcon Car Hire", and leaves genuine accounts such as an owner's own Gmail
 * address alone.
 */
const DEMO_EMAILS = [
  'admin@falconcarhire.test',
  'rudo@falconcarhire.test',
  'brian@falconcarhire.test',
  'salma@falconcarhire.test',
]

async function demoCompanies() {
  return query(
    `SELECT DISTINCT c.id, c.name
     FROM companies c
     JOIN users u ON u.company_id = c.id
     WHERE lower(u.email) = ANY($1)
     ORDER BY c.name`,
    [DEMO_EMAILS],
  )
}

const targets = await demoCompanies()

if (!targets.length) {
  console.log('No demo data found. Nothing to do.')
  process.exit(0)
}

console.log('\nDemo tenant(s) that will be deleted:')
for (const company of targets) {
  const rows = await one(
    `SELECT
       (SELECT count(*)::int FROM cars      WHERE company_id = $1) AS cars,
       (SELECT count(*)::int FROM rentals   WHERE company_id = $1) AS rentals,
       (SELECT count(*)::int FROM customers WHERE company_id = $1) AS customers,
       (SELECT count(*)::int FROM payments  WHERE company_id = $1) AS payments,
       (SELECT count(*)::int FROM users     WHERE company_id = $1) AS users`,
    [company.id],
  )
  console.log(`\n  ${company.name}`)
  console.log(`    id: ${company.id}`)
  console.log(`    ${rows.users} users, ${rows.cars} cars, ${rows.rentals} rentals,`)
  console.log(`    ${rows.customers} customers, ${rows.payments} payments`)
}

const kept = await query(
  `SELECT c.name, u.email FROM users u JOIN companies c ON c.id = u.company_id
   WHERE NOT (lower(u.email) = ANY($1)) ORDER BY c.name`,
  [DEMO_EMAILS],
)

if (kept.length) {
  console.log('\nThese accounts are NOT demo data and will be kept:')
  for (const row of kept) console.log(`  ${row.name} - ${row.email}`)
}

if (!process.argv.includes('--yes')) {
  console.log('\nRe-run with --yes to delete the demo tenant(s) above.')
  process.exit(1)
}

/**
 * Child-first so nothing is left referencing a removed row. One statement per
 * call: Neon's HTTP driver rejects multi-statement queries outright.
 */
const DELETES = [
  `DELETE FROM activity_log    WHERE company_id = $1`,
  `DELETE FROM password_resets WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)`,
  `DELETE FROM payments        WHERE company_id = $1`,
  `DELETE FROM rentals         WHERE company_id = $1`,
  `DELETE FROM customers       WHERE company_id = $1`,
  `DELETE FROM cars            WHERE company_id = $1`,
  `DELETE FROM users           WHERE company_id = $1`,
  `DELETE FROM companies       WHERE id = $1`,
]

for (const company of targets) {
  for (const statement of DELETES) await query(statement, [company.id])
  console.log(`\nDeleted: ${company.name}`)
}

const remaining = await one('SELECT count(*)::int AS count FROM companies')
console.log(`\nCompanies remaining: ${remaining.count}`)
if (remaining.count === 0) {
  console.log('The database is empty, so /setup is now available for first-run onboarding.')
} else {
  console.log('Sign in with your own account to continue.')
}