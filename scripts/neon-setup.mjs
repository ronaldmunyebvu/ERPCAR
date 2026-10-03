import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const URL_ENCODINGS = {
  '~': '%7E',
  '!': '%21',
  "'": '%27',
  '(': '%28',
  ')': '%29',
  '*': '%2A',
}

/**
 * The browser HTTP driver wants a bare `host/db` target. Copy the connection
 * string into a separate Neon connection and point this at it.
 */
const OVERRIDE_ENV = {
  NEON_DATABASE_URL: 'NEON_DATABASE_URL',
  VITE_NEON_DATABASE_URL: 'VITE_NEON_DATABASE_URL',
}

const force = process.argv.includes('--force')
const skipSeed = process.argv.includes('--schema-only')

function readConnectionString() {
  const overrideKey = Object.keys(OVERRIDE_ENV).find((key) => process.env[key])
  if (overrideKey) return process.env[overrideKey]

  try {
    const dotenv = readFileSync(resolve(ROOT, '.env'), 'utf8')
    const match = dotenv.match(/^\s*VITE_NEON_DATABASE_URL\s*=\s*(.+)\s*$/m)
    if (match) return match[1].replace(/^["']|["']$/g, '')
  } catch {
    /* .env missing */
  }
  throw new Error('No connection string found. Set NEON_DATABASE_URL or fill in .env')
}

function normalise(url) {
  const parsed = new URL(url)
  parsed.username = encodeURIComponent(parsed.username)
  parsed.password = encodeURIComponent(parsed.password).replace(/[!'()*]/g, (char) => URL_ENCODINGS[char])
  if (!parsed.searchParams.get('sslmode')) parsed.searchParams.set('sslmode', 'require')
  return parsed.toString()
}

function splitStatements(sql) {
  const statements = []
  let current = ''
  let index = 0

  while (index < sql.length) {
    const char = sql[index]
    const pair = sql.slice(index, index + 2)

    if (pair === '--') {
      const end = sql.indexOf('\n', index)
      index = end === -1 ? sql.length : end + 1
      current += '\n'
      continue
    }

    if (pair === '$$') {
      const end = sql.indexOf('$$', index + 2)
      const stop = end === -1 ? sql.length : end + 2
      current += sql.slice(index, stop)
      index = stop
      continue
    }

    if (char === "'") {
      let cursor = index + 1
      while (cursor < sql.length) {
        if (sql[cursor] === "'") {
          if (sql[cursor + 1] === "'") {
            cursor += 2
            continue
          }
          cursor += 1
          break
        }
        cursor += 1
      }
      current += sql.slice(index, cursor)
      index = cursor
      continue
    }

    if (char === ';') {
      if (current.trim()) statements.push(current.trim())
      current = ''
      index += 1
      continue
    }

    current += char
    index += 1
  }

  if (current.trim()) statements.push(current.trim())
  return statements
}

/* ------------------------------------------------------------------ crypto */

const encoder = new TextEncoder()
const ITERATIONS = 120_000

function toBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function hashPassword(password) {
  const salt = new Uint8Array(16)
  globalThis.crypto.getRandomValues(salt)
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  )
  return `pbkdf2$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`
}

/* -------------------------------------------------------------------- seed */

const uuid = () => crypto.randomUUID()

function at(days, hour = 9, minute = 0) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

const daysBetween = (from, to) =>
  Math.max(1, Math.ceil((new Date(to) - new Date(from)) / 86_400_000))

async function seed(sql) {
  const existing = await sql`SELECT count(*)::int AS count FROM companies`
  if (existing[0].count > 0 && !force) {
    console.log('• Database already has data. Re-run with --force to wipe and reseed.')
    return false
  }

  if (existing[0].count > 0) {
    console.log('• --force given: clearing existing data…')
    await sql`TRUNCATE payments, rentals, customers, cars, activity_log, password_resets, users, companies RESTART IDENTITY CASCADE`
  }

  const year = new Date().getFullYear()

  const [company] = await sql`
    INSERT INTO companies (name, email, phone, address, city, country, currency, timezone,
                           members_see_all_rentals, members_edit_own_rentals, members_manage_fleet)
    VALUES ('Falcon Car Hire', 'info@falconcarhire.test', '+263 712 000 111',
            '18 Josiah Tongogara Street', 'Harare', 'Zimbabwe', 'USD', 'Africa/Harare',
            false, true, false)
    RETURNING id`

  const adminHash = await hashPassword('Admin@123')
  const memberHash = await hashPassword('Member@123')

  const people = [
    ['Tendai Moyo', 'admin@falconcarhire.test', '+263 712 000 111', 'admin', 'active', 0],
    ['Rudo Chari', 'rudo@falconcarhire.test', '+263 771 220 145', 'member', 'active', 1],
    ['Brian Ncube', 'brian@falconcarhire.test', '+263 772 998 001', 'member', 'active', 2],
    ['Salma Dube', 'salma@falconcarhire.test', '+263 773 441 992', 'member', 'inactive', null],
  ]

  const users = []
  for (const [fullName, email, phone, role, status, lastLogin] of people) {
    const [row] = await sql`
      INSERT INTO users (company_id, full_name, email, phone, password_hash, role, status, last_login_at)
      VALUES (${company.id}, ${fullName}, ${email}, ${phone},
              ${role === 'admin' ? adminHash : memberHash}, ${role}, ${status},
              ${lastLogin === null ? null : at(-lastLogin, 8, 30)})
      RETURNING id, full_name, role`
    users.push(row)
  }
  const owner = users[0]
  const staff = users.slice(1)

  const carDefs = [
    ['Toyota', 'Corolla', 2022, 'FCH-2214', 'White', 'sedan', 65, 'available'],
    ['Toyota', 'Corolla', 2021, 'FCH-2215', 'Silver', 'sedan', 65, 'rented'],
    ['Nissan', 'Note', 2023, 'FCH-3391', 'Blue', 'hatchback', 48, 'available'],
    ['Honda', 'Fit', 2022, 'FCH-3308', 'Black', 'hatchback', 52, 'available'],
    ['Toyota', 'Hiace', 2021, 'FCH-7788', 'White', 'van', 120, 'available'],
    ['Toyota', 'Hiace', 2020, 'FCH-7789', 'Grey', 'van', 115, 'maintenance'],
    ['Nissan', 'NV350', 2022, 'FCH-8802', 'Silver', 'van', 110, 'available'],
    ['Isuzu', 'D-Max', 2023, 'FCH-4417', 'Red', 'pickup', 95, 'available'],
    ['Mercedes-Benz', 'C-Class', 2021, 'FCH-5502', 'Black', 'luxury', 240, 'available'],
    ['Toyota', 'Fortuner', 2022, 'FCH-6601', 'White', 'suv', 175, 'available'],
    ['BMW', '3 Series', 2020, 'FCH-5509', 'Navy', 'luxury', 235, 'available'],
    ['Toyota', 'Land Cruiser', 2023, 'FCH-6609', 'White', 'suv', 320, 'rented'],
  ]

  const cars = []
  for (const [make, model, carYear, registration, color, category, rate, status] of carDefs) {
    const [row] = await sql`
      INSERT INTO cars (company_id, make, model, year, registration, color, category, daily_rate, status)
      VALUES (${company.id}, ${make}, ${model}, ${carYear}, ${registration}, ${color}, ${category}, ${rate}, ${status})
      RETURNING id, registration, daily_rate`
    cars.push({ ...row, daily_rate: Number(row.daily_rate) })
  }

  const customerDefs = [
    ['Grace Mutasa', '+263 771 220 145', 'grace.mutasa@example.test', '63-0712345 A', 'DL-88213', '12 Samora Avenue, Harare'],
    ['Peter Ndlovu', '+263 772 998 001', 'pndlovu@example.test', '08-9988776 B', 'DL-77541', '45 Bulawayo Road, Harare'],
    ['Anna Sibanda', '+263 773 441 992', 'anna.sibanda@example.test', '63-5543210 C', 'DL-66012', '7 Borrowdale Road, Harare'],
    ['Michael Dube', '+263 774 220 118', 'm.dube@example.test', '02-3344556 D', 'DL-55490', '88 Nelson Mandela Ave, Harare'],
    ['Lydia Chikore', '+263 775 667 210', 'lydia.chikore@example.test', '63-7788990 A', 'DL-44321', '31 Fleetwood Road, Harare'],
    ['Zimlink Traders (Corporate)', '+263 4 887 220', 'fleet@zimlink.test', 'BP-102-556', null, '4 Sam Nujoma Street, Harare'],
  ]

  const customers = []
  for (const [fullName, phone, email, idNumber, licence, address] of customerDefs) {
    const [row] = await sql`
      INSERT INTO customers (company_id, full_name, phone, email, id_number, driver_license, address)
      VALUES (${company.id}, ${fullName}, ${phone}, ${email}, ${idNumber}, ${licence}, ${address})
      RETURNING id, full_name`
    customers.push(row)
  }

  let counter = 0
  const rentals = []

  const plan = [
    [0, 0, 0, -96, -89, {}, 'Airport pickup, flight BAW 1172.'],
    [2, 1, 0, -84, -79, {}, 'Weekly hire, mileage unlimited.'],
    [4, 5, 1, -70, -64, {}, 'Corporate account — airport transfers.'],
    [8, 2, 2, -58, -55, { charges: [{ label: 'Fuel top-up', amount: 45 }] }, ''],
    [9, 3, 1, -47, -42, {}, ''],
    [1, 0, 0, -40, -35, {}, 'Extended by 2 days over the phone.'],
    [3, 4, 2, -33, -30, { charges: [{ label: 'Late return fee', amount: 25 }] }, ''],
    [6, 5, 0, -26, -20, {}, 'Corporate account.'],
    [7, 3, 1, -21, -16, { charges: [{ label: 'Damage fee — rear bumper', amount: 180 }] }, ''],
    [10, 1, 2, -14, -9, {}, ''],
    [4, 2, 0, -6, -2, { actual: at(-2, 17, 20) }, 'Returned early, balance refunded.'],
    [9, 0, 1, -3, 2, { open: true }, 'Long-distance trip to Kariba, deposit held.'],
    [11, 3, 0, -1, 4, { open: true }, 'Mining contractor — extended cab.'],
    [2, 4, 1, -8, -5, { charges: [{ label: 'Late return fee', amount: 30 }] }, 'Customer unreachable — follow up.'],
    [5, 5, 2, 2, 7, { open: true }, 'Booked for weekend wedding shuttle.'],
  ]

  for (const [carIndex, customerIndex, staffIndex, pickupDay, returnDay, extra, notes] of plan) {
    counter += 1
    const car = cars[carIndex]
    const pickup = at(pickupDay, 9, 0)
    const expected = at(returnDay, 18, 0)
    const days = daysBetween(pickup, expected)
    const rate = Number(car.daily_rate)
    const total = rate * days
    const charges = extra.charges ?? []
    const actual = extra.actual ?? null
    const status = extra.open ? 'active' : 'completed'

    const [row] = await sql`
      INSERT INTO rentals (company_id, car_id, customer_id, created_by, reference, pickup_at,
                           expected_return_at, actual_return_at, daily_rate, days, total_amount,
                           deposit_amount, additional_charges, status, notes)
      VALUES (${company.id}, ${car.id}, ${customers[customerIndex].id}, ${staff[staffIndex].id},
              ${`RNT-${year}-${String(counter).padStart(4, '0')}`}, ${pickup}, ${expected}, ${actual},
              ${rate}, ${days}, ${total}, ${Math.round(rate * 2)},
              ${JSON.stringify(charges)}::jsonb, ${status}, ${notes})
      RETURNING id, reference, total_amount`

    rentals.push({ ...row, total: Number(row.total_amount), charges, status, pickupDay, actual })
  }

  const methods = ['ecocash', 'card', 'cash', 'bank_transfer']
  let paymentCount = 0

  for (const [index, rental] of rentals.entries()) {
    const bill = rental.total + rental.charges.reduce((sum, charge) => sum + Number(charge.amount), 0)
    let amount = null

    if (rental.status === 'completed') {
      amount = bill
    } else if (rental.status === 'active') {
      amount = Math.round(bill * 0.6)
    } else {
      amount = Math.round(bill * 0.4)
    }

    if (amount !== null) {
      paymentCount += 1
      await sql`
        INSERT INTO payments (company_id, rental_id, amount, method, reference, received_by, received_at)
        VALUES (${company.id}, ${rental.id}, ${amount}, ${methods[index % 4]},
                ${`${methods[index % 4].slice(0, 4).toUpperCase()}-${String(paymentCount).padStart(5, '0')}`},
                ${staff[index % 3].id}, ${at(rental.actual ? -2 : rental.pickupDay - 2, 11, 30)})`
    }
  }

  const logDefs = [
    [owner.id, 'rental.created', 'rental', rentals[12].id, `Captured rental ${rentals[12].reference} for Michael Dube (Toyota Fortuner)`, -1],
    [staff[0].id, 'rental.returned', 'rental', rentals[10].id, `Returned Toyota Hiace FCH-7788 for Anna Sibanda`, -2],
    [staff[1].id, 'customer.created', 'customer', customers[4].id, 'Added customer Lydia Chikore', -6],
    [owner.id, 'user.created', 'user', staff[1].id, 'Created staff account brian@falconcarhire.test', -30],
    [owner.id, 'user.deactivated', 'user', staff[2].id, 'Deactivated staff account salma@falconcarhire.test', -25],
    [owner.id, 'car.updated', 'car', cars[5].id, 'Moved Toyota Hiace FCH-7789 to maintenance', -5],
    [staff[2].id, 'payment.recorded', 'payment', null, 'Recorded a payment against an open rental', -55],
  ]

  for (const [userId, action, entity, entityId, summary, daysAgo] of logDefs) {
    await sql`
      INSERT INTO activity_log (company_id, user_id, action, entity, entity_id, summary, created_at)
      VALUES (${company.id}, ${userId}, ${action}, ${entity}, ${entityId}, ${summary}, ${at(daysAgo, 13, 15)})`
  }

  console.log(`
✓ Seed complete
  company   Falcon Car Hire (${company.id})
  owner     admin@falconcarhire.test  / Admin@123
  member    rudo@falconcarhire.test  / Member@123
  fleet     ${cars.length} vehicles
  customers ${customers.length} records
  rentals   ${rentals.length} bookings
  payments  ${paymentCount} entries`)
  return true
}

/* -------------------------------------------------------------------- main */

const connectionString = normalise(readConnectionString())

const { neon } = await import('@neondatabase/serverless')
const sql = neon(connectionString)

console.log(`→ ${new URL(connectionString).host}/${new URL(connectionString).pathname.slice(1)}`)

const sqlFile = resolve(ROOT, 'src/db/schema.sql')
const statements = splitStatements(await readFile(sqlFile, 'utf8'))

for (const statement of statements) {
  const label = statement.split('\n')[0].slice(0, 60)
  try {
    await sql.query(statement)
    console.log(`  ✓ ${label}`)
  } catch (error) {
    if (/already exists/i.test(error.message)) {
      console.log(`  = ${label} (already exists)`)
      continue
    }
    console.error(`  ✗ ${label}\n    ${error.message}`)
    process.exit(1)
  }
}

if (!skipSeed) await seed(sql)

console.log('\nDone.')
process.exit(0)