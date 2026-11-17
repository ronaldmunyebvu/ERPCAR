/**
 * Daily fleet reminders.
 *
 * Vercel Cron calls this once a day (see `crons` in vercel.json). It emails each
 * company's admins a single message listing every vehicle whose Zinara licence
 * or scheduled maintenance falls inside the warning window. The per-vehicle
 * markers written back afterwards mean a given expiry or due date is only sent
 * once, while renewing the licence or resetting the service interval naturally
 * schedules the next reminder.
 *
 * `runReminders` accepts its collaborators so it can be exercised without a
 * database or an SMTP server.
 */
import { query as dbQuery } from './db.js'
import { mail } from './mailer.js'
import { LICENSE_WARNING_DAYS } from '../../src/lib/utils.js'

const json = (body, status = 200) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
})

let schemaReady = null

/**
 * Older deployments created before servicing reminders existed need the extra
 * columns. Every statement is idempotent, and the promise is cached so a warm
 * instance pays the round trip at most once.
 */
function ensureSchema(query) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS maintenance_interval_days int
                   CHECK (maintenance_interval_days >= 0)`)
      await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS maintenance_due_on date`)
      await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS maintenance_reminder_for date`)
      await query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS license_reminder_for date`)
    })().catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
}

export async function runReminders({
  query = dbQuery,
  mailer = mail,
  warningDays = LICENSE_WARNING_DAYS,
} = {}) {
  const enabled = typeof mailer.enabled === 'function' ? mailer.enabled() : mailer.enabled
  if (!enabled) {
    return { ok: true, skipped: 'mail is not configured', companies: 0, sent: 0 }
  }

  await ensureSchema(query)

  const rows = await query(
    `SELECT ca.id, ca.company_id, ca.registration, ca.make, ca.model,
            ca.license_valid_to, ca.license_reminder_for,
            ca.maintenance_due_on, ca.maintenance_reminder_for,
            c.name AS company_name, c.email AS company_email,
            (ca.license_valid_to - current_date)::int AS license_days_left,
            (ca.maintenance_due_on - current_date)::int AS maintenance_days_left
       FROM cars ca
       JOIN companies c ON c.id = ca.company_id
      WHERE (ca.license_valid_to IS NOT NULL
             AND ca.license_valid_to <= current_date + $1::int
             AND (ca.license_reminder_for IS NULL
                  OR ca.license_reminder_for <> ca.license_valid_to))
         OR (ca.maintenance_due_on IS NOT NULL
             AND ca.maintenance_due_on <= current_date + $1::int
             AND (ca.maintenance_reminder_for IS NULL
                  OR ca.maintenance_reminder_for <> ca.maintenance_due_on))
      ORDER BY c.name, ca.registration`,
    [warningDays],
  )

  const companies = new Map()
  for (const row of rows) {
    if (!companies.has(row.company_id)) {
      companies.set(row.company_id, {
        id: row.company_id,
        name: row.company_name,
        email: row.company_email,
        licenses: [],
        maintenance: [],
      })
    }
    const company = companies.get(row.company_id)
    if (
      row.license_valid_to &&
      row.license_days_left !== null &&
      row.license_days_left <= warningDays &&
      row.license_reminder_for !== row.license_valid_to
    ) {
      company.licenses.push(row)
    }
    if (
      row.maintenance_due_on &&
      row.maintenance_days_left !== null &&
      row.maintenance_days_left <= warningDays &&
      row.maintenance_reminder_for !== row.maintenance_due_on
    ) {
      company.maintenance.push(row)
    }
  }

  let sent = 0
  let failed = 0
  let licenses = 0
  let maintenance = 0

  for (const company of companies.values()) {
    if (!company.licenses.length && !company.maintenance.length) continue

    try {
      const admins = await query(
        `SELECT email FROM users
          WHERE company_id = $1 AND role = 'admin' AND status = 'active'
            AND email IS NOT NULL
          ORDER BY created_at`,
        [company.id],
      )
      const to = admins.map((user) => user.email).filter(Boolean)
      if (!to.length && company.email) to.push(company.email)
      if (!to.length) continue

      const delivered = await mailer.fleetReminder({
        to,
        company: company.name,
        licenses: company.licenses,
        maintenance: company.maintenance,
      })
      if (!delivered) {
        failed += 1
        continue
      }
      sent += 1

      if (company.licenses.length) {
        await query(
          `UPDATE cars SET license_reminder_for = license_valid_to
            WHERE id = ANY($1::uuid[])`,
          [company.licenses.map((car) => car.id)],
        )
        licenses += company.licenses.length
      }
      if (company.maintenance.length) {
        await query(
          `UPDATE cars SET maintenance_reminder_for = maintenance_due_on
            WHERE id = ANY($1::uuid[])`,
          [company.maintenance.map((car) => car.id)],
        )
        maintenance += company.maintenance.length
      }
    } catch (error) {
      // One company's failure must not stop the others from being reminded.
      console.error(`[reminders] company ${company.id} failed`, error?.message)
      failed += 1
    }
  }

  return {
    ok: true,
    warning_days: warningDays,
    companies: sent,
    failed,
    licenses,
    maintenance,
  }
}

export default async function handler(event) {
  const method = (event?.httpMethod || event?.method || 'GET').toUpperCase()
  if (method !== 'GET') return json({ error: 'Method not allowed.' }, 405)

  const secret = process.env.CRON_SECRET
  if (secret) {
    const header = event?.headers?.authorization || event?.headers?.Authorization || ''
    if (header !== `Bearer ${secret}`) return json({ error: 'Unauthorized.' }, 401)
  }

  try {
    return json(await runReminders())
  } catch (error) {
    console.error('[reminders] run failed', error?.message)
    return json({ error: 'Reminder run failed.' }, 500)
  }
}
