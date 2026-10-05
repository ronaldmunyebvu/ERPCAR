/**
 * Relative specifiers, not the `@/` alias: this module is executed inside the
 * Vercel function by Node, which does not resolve the Vite alias.
 *
 * `src/lib/crypto.js` runs unmodified on Node because it is built entirely on
 * WebCrypto and `btoa`/`atob`, all of which are globals there. Reusing it keeps
 * the stored PBKDF2 hashes valid - the format has not changed, only the side
 * that computes it.
 */
import { hashPassword, verifyPassword, randomToken } from '../../lib/crypto.js'
import { isOverdue, rentalTotal, rentalBalance, startOfDay, addDays, daysBetween } from '../../lib/utils.js'

/**
 * Neon (PostgreSQL) data source.
 *
 * This module is SERVER ONLY. It is loaded by `api/data.js` inside the Vercel
 * function, never by the browser bundle: the connection string it is given is
 * read from a non-`VITE_` environment variable and must not be shipped to
 * clients. `VITE_DATA_SOURCE=api` makes the browser proxy these methods over
 * HTTP instead of importing this file.
 *
 * Every statement goes through `sql.query()` with bound parameters, so user
 * input is never concatenated into SQL text. The method contract is identical
 * to `src/db/mock/repo.mock.js` — the UI cannot tell them apart.
 *
 * Note: the HTTP driver opens a connection per statement, so multi-statement
 * transactions are unavailable. Each write below is idempotent and safe to retry.
 */

const PUBLIC_USER_COLUMNS = `
  id, company_id, full_name, email, phone, role, status, avatar_url,
  last_login_at, created_at, updated_at
`

function num(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Fluent filter builder that keeps SQL text and bound parameters in sync, so
 * dynamic WHERE clauses can never be built by string concatenation.
 */
function filters() {
  const clauses = []
  const params = []
  const api = {
    params,
    eq(column, value) {
      if (value === undefined || value === null || value === '') return api
      params.push(value)
      clauses.push(`${column} = $${params.length}`)
      return api
    },
    op(column, operator, value) {
      if (value === undefined || value === null || value === '') return api
      params.push(value)
      clauses.push(`${column} ${operator} $${params.length}`)
      return api
    },
    /** `raw(sql, values)` renumbers the `$n` placeholders inside `sql`. */
    raw(sql, values = []) {
      if (!sql) return api
      const offset = params.length
      values.forEach((value) => params.push(value))
      clauses.push(sql.replace(/\$(\d+)/g, (_, index) => `$${offset + Number(index)}`))
      return api
    },
    where() {
      return clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
    },
  }
  return api
}

/**
 * @param {string} connectionString - the pooled Postgres URL
 * @param {{ query(text: string, params?: unknown[]): Promise<unknown> }} sql -
 *   the executor to run statements through, normally supplied by `api/_lib/db.js`
 */
export async function createNeonRepository(connectionString, sql) {
  if (!connectionString) {
    throw new Error(
      'No database connection string was supplied to the repository. Set DATABASE_URL in the Vercel project environment variables.',
    )
  }
  // The `sql` executor is injected by the caller rather than constructed here.
  // Both drivers in use are WebSocket-based and stall on Vercel's runtime, so
  // the API layer passes in a plain TLS executor built on `pg` instead. This
  // keeps the repository free of any driver dependency, and means this file
  // runs unchanged on Node, in tests, and on any other host.
  if (!sql || typeof sql.query !== 'function') {
    throw new Error('createNeonRepository requires a `sql` executor with a query() method.')
  }

  async function rows(text, params = []) {
    const result = await sql.query(text, params)
    // `pg` resolves to a `{ rows }` envelope, while the serverless driver
    // resolves straight to the row array. Both are accepted so either
    // executor can be supplied.
    if (Array.isArray(result)) return result
    return result?.rows ?? []
  }

  async function one(text, params = []) {
    const found = await rows(text, params)
    return found[0] ?? null
  }

  async function logActivity(entry) {
    await rows(
      `INSERT INTO activity_log (company_id, user_id, action, entity, entity_id, summary, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        entry.company_id,
        entry.user_id ?? null,
        entry.action,
        entry.entity,
        entry.entity_id ?? null,
        entry.summary,
        JSON.stringify(entry.metadata ?? {}),
      ],
    )
  }

  function decorateRental(rental) {
    if (!rental) return null
    const shaped = {
      ...rental,
      daily_rate: num(rental.daily_rate),
      total_amount: num(rental.total_amount),
      deposit_amount: num(rental.deposit_amount),
      additional_charges: Array.isArray(rental.additional_charges)
        ? rental.additional_charges
        : JSON.parse(rental.additional_charges || '[]'),
      payments: rental.payments || [],
    }
    const paid = shaped.payments.reduce((sum, payment) => sum + num(payment.amount), 0)
    return {
      ...shaped,
      is_overdue: isOverdue(shaped),
      computed_status: isOverdue(shaped) ? 'overdue' : shaped.status,
      computed_total: rentalTotal(shaped),
      computed_paid: paid,
      computed_balance: rentalBalance({ ...shaped, payments: shaped.payments }),
    }
  }

  /** Shared rental projection: rental + car + customer + creator + payments. */
  const RENTAL_SELECT = `
    SELECT
      r.*,
      to_jsonb(c.*) - 'company_id' AS car,
      to_jsonb(cu.*) - 'company_id' AS customer,
      to_jsonb(u.*) - 'company_id' - 'password_hash' AS created_by_user,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(p.*) - 'company_id')
        FROM payments p WHERE p.rental_id = r.id
      ), '[]'::jsonb) AS payments
    FROM rentals r
    LEFT JOIN cars c      ON c.id = r.car_id
    LEFT JOIN customers cu ON cu.id = r.customer_id
    LEFT JOIN users u     ON u.id = r.created_by
  `

  function shapePaymentRow(payment) {
    return { ...payment, amount: num(payment.amount) }
  }

  return {
    mode: 'neon',

    async bootstrap() {
      await one('SELECT 1')
      return true
    },
    onChange() {
      return () => {}
    },
    async resetDemoData() {
      throw new Error('Demo data cannot be reset in Neon mode.')
    },
    async importDemoData() {
      throw new Error('Demo data import is only available in mock mode.')
    },
    exportData() {
      throw new Error('Raw exports are only available in mock mode.')
    },

    /* ================================================================ auth */
    auth: {
      async isSetupComplete() {
        const row = await one('SELECT count(*)::int AS count FROM companies')
        return num(row?.count) > 0
      },

      async createCompanyWithOwner({ company, owner }) {
        const created = await one(
          `INSERT INTO companies (name, email, phone, address, city, country, logo_url, currency, timezone)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [
            company.name,
            company.email || null,
            company.phone || null,
            company.address || null,
            company.city || null,
            company.country || null,
            company.logo_url || null,
            company.currency || 'USD',
            company.timezone || 'UTC',
          ],
        )
        const user = await one(
          `INSERT INTO users (company_id, full_name, email, phone, password_hash, role)
           VALUES ($1,$2,$3,$4,$5,'admin') RETURNING ${PUBLIC_USER_COLUMNS}`,
          [
            created.id,
            owner.full_name,
            String(owner.email).trim().toLowerCase(),
            owner.phone || null,
            await hashPassword(owner.password),
          ],
        )
        return user
      },

      async signIn({ email, password }) {
        const user = await one(
          `SELECT * FROM users WHERE lower(email) = lower($1)`,
          [String(email).trim()],
        )
        if (!user) throw new Error('No account found for that email address.')
        if (user.status !== 'active') {
          throw new Error('This account has been deactivated. Contact your admin.')
        }
        if (!(await verifyPassword(password, user.password_hash))) {
          throw new Error('Incorrect password. Please try again.')
        }
        const company = await one('SELECT * FROM companies WHERE id = $1', [user.company_id])
        await rows(`UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1`, [user.id])
        await logActivity({
          company_id: user.company_id,
          user_id: user.id,
          action: 'auth.login',
          entity: 'user',
          entity_id: user.id,
          summary: `${user.full_name} signed in`,
        })
        const { password_hash, ...safe } = user
        void password_hash
        return { user: safe, company }
      },

      async signOut() {},

      async findUserById(id) {
        const user = await one(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`, [id])
        if (!user) return null
        const company = await one('SELECT * FROM companies WHERE id = $1', [user.company_id])
        return { user, company }
      },

      async createUser(input) {
        const email = String(input.email).trim().toLowerCase()
        const existing = await one('SELECT id FROM users WHERE lower(email) = $1', [email])
        if (existing) throw new Error('A user with that email address already exists.')
        if (input.role === 'admin') {
          const admins = await one(
            `SELECT count(*)::int AS count FROM users
             WHERE company_id = $1 AND role = 'admin' AND status = 'active'`,
            [input.company_id],
          )
          if (num(admins?.count) > 0) {
            throw new Error('This company already has an active owner/admin account.')
          }
        }
        const user = await one(
          `INSERT INTO users (company_id, full_name, email, phone, password_hash, role, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${PUBLIC_USER_COLUMNS}`,
          [
            input.company_id,
            input.full_name,
            email,
            input.phone || null,
            await hashPassword(input.password),
            input.role || 'member',
            input.status || 'active',
          ],
        )
        await logActivity({
          company_id: input.company_id,
          user_id: input.created_by || null,
          action: 'user.created',
          entity: 'user',
          entity_id: user.id,
          summary: `Created ${user.role} account ${user.email}`,
          metadata: { email, role: user.role },
        })
        return user
      },

      async updateUser(id, patch, actor) {
        const current = await one('SELECT * FROM users WHERE id = $1', [id])
        if (!current) throw new Error('User not found')

        if (patch.email) {
          const clash = await one('SELECT id FROM users WHERE lower(email) = lower($1) AND id <> $2', [
            patch.email,
            id,
          ])
          if (clash) throw new Error('A user with that email address already exists.')
        }
        if (patch.role && patch.role !== 'admin' && current.role === 'admin') {
          const admins = await one(
            `SELECT count(*)::int AS count FROM users
             WHERE company_id = $1 AND role = 'admin' AND status = 'active'`,
            [current.company_id],
          )
          if (num(admins?.count) <= 1) {
            throw new Error('You cannot remove the last active admin of this company.')
          }
        }

        const user = await one(
          `UPDATE users SET
             full_name = COALESCE($2, full_name),
             email     = COALESCE(lower($3), email),
             phone     = COALESCE($4, phone),
             role      = COALESCE($5, role),
             status    = COALESCE($6, status),
             avatar_url= COALESCE($7, avatar_url),
             password_hash = COALESCE($8, password_hash),
             updated_at = now()
           WHERE id = $1
           RETURNING ${PUBLIC_USER_COLUMNS}`,
          [
            id,
            patch.full_name ?? null,
            patch.email ?? null,
            patch.phone ?? null,
            patch.role ?? null,
            patch.status ?? null,
            patch.avatar_url ?? null,
            patch.password ? await hashPassword(patch.password) : null,
          ],
        )

        await logActivity({
          company_id: current.company_id,
          user_id: actor?.id || null,
          action: patch.password ? 'user.password_reset' : 'user.updated',
          entity: 'user',
          entity_id: id,
          summary: patch.password
            ? `Reset password for ${user.full_name}`
            : `Updated ${user.role} account ${user.full_name}`,
          metadata: { status: user.status, role: user.role },
        })
        return user
      },

      async removeUser(id, actor) {
        const user = await one('SELECT * FROM users WHERE id = $1', [id])
        if (!user) throw new Error('User not found')
        if (user.role === 'admin') {
          const admins = await one(
            `SELECT count(*)::int AS count FROM users
             WHERE company_id = $1 AND role = 'admin' AND status = 'active'`,
            [user.company_id],
          )
          if (num(admins?.count) <= 1) {
            throw new Error('You cannot remove the last active admin of this company.')
          }
        }
        const linked = await one(
          'SELECT count(*)::int AS count FROM rentals WHERE created_by = $1',
          [id],
        )
        const hardDeleted = num(linked?.count) === 0
        if (hardDeleted) {
          await rows('DELETE FROM users WHERE id = $1', [id])
        } else {
          await rows(`UPDATE users SET status = 'inactive', updated_at = now() WHERE id = $1`, [id])
        }
        await logActivity({
          company_id: user.company_id,
          user_id: actor?.id || null,
          action: hardDeleted ? 'user.deleted' : 'user.deactivated',
          entity: 'user',
          entity_id: id,
          summary: hardDeleted
            ? `Deleted account ${user.full_name}`
            : `Deactivated ${user.full_name} (has ${num(linked.count)} rental records)`,
          metadata: { email: user.email },
        })
        return { removed: true, hardDeleted }
      },

      async requestPasswordReset(email) {
        const user = await one('SELECT * FROM users WHERE lower(email) = lower($1)', [
          String(email).trim(),
        ])
        if (!user) return { ok: true, token: null, user: null, email: String(email).trim().toLowerCase() }
        const token = randomToken()
        await rows(
          `INSERT INTO password_resets (user_id, token_hash, expires_at)
           VALUES ($1,$2, now() + interval '1 day')`,
          [user.id, token],
        )
        const { password_hash, ...safe } = user
        void password_hash
        return { ok: true, token, user: safe, email: user.email }
      },

      async completePasswordReset({ token, password }) {
        const reset = await one(
          `SELECT * FROM password_resets
           WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
          [token],
        )
        if (!reset) throw new Error('This reset link is invalid or has expired. Please request a new one.')
        const user = await one(
          `UPDATE users SET password_hash = $2, updated_at = now()
           WHERE id = $1 RETURNING ${PUBLIC_USER_COLUMNS}`,
          [reset.user_id, await hashPassword(password)],
        )
        await rows('UPDATE password_resets SET used_at = now() WHERE id = $1', [reset.id])
        await logActivity({
          company_id: user.company_id,
          user_id: user.id,
          action: 'user.password_reset',
          entity: 'user',
          entity_id: user.id,
          summary: `${user.full_name} reset their password`,
        })
        return user
      },

      async changeOwnPassword({ userId, currentPassword, newPassword }) {
        const user = await one('SELECT * FROM users WHERE id = $1', [userId])
        if (!user) throw new Error('User not found')
        if (!(await verifyPassword(currentPassword, user.password_hash))) {
          throw new Error('Your current password is incorrect.')
        }
        await rows('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
          userId,
          await hashPassword(newPassword),
        ])
        return { ok: true }
      },
    },

    /* ========================================================== companies */
    companies: {
      async list() {
        return rows('SELECT * FROM companies ORDER BY created_at')
      },
      async get(id) {
        return one('SELECT * FROM companies WHERE id = $1', [id])
      },
      async update(id, patch, actor) {
        const company = await one(
          `UPDATE companies SET
             name = COALESCE($2, name),
             email = COALESCE($3, email),
             phone = COALESCE($4, phone),
             address = COALESCE($5, address),
             city = COALESCE($6, city),
             country = COALESCE($7, country),
             logo_url = COALESCE($8, logo_url),
             currency = COALESCE($9, currency),
             timezone = COALESCE($10, timezone),
             members_see_all_rentals = COALESCE($11, members_see_all_rentals),
             members_edit_own_rentals = COALESCE($12, members_edit_own_rentals),
             members_manage_fleet = COALESCE($13, members_manage_fleet),
             password_reset_enabled = COALESCE($14, password_reset_enabled),
             updated_at = now()
           WHERE id = $1 RETURNING *`,
          [
            id,
            patch.name ?? null,
            patch.email ?? null,
            patch.phone ?? null,
            patch.address ?? null,
            patch.city ?? null,
            patch.country ?? null,
            patch.logo_url ?? null,
            patch.currency ?? null,
            patch.timezone ?? null,
            patch.members_see_all_rentals ?? null,
            patch.members_edit_own_rentals ?? null,
            patch.members_manage_fleet ?? null,
            patch.password_reset_enabled ?? null,
          ],
        )
        await logActivity({
          company_id: id,
          user_id: actor?.id || null,
          action: 'company.updated',
          entity: 'company',
          entity_id: id,
          summary: 'Updated company settings',
          metadata: { fields: Object.keys(patch) },
        })
        return company
      },
    },

    /* =============================================================== users */
    users: {
      async list({ companyId, role, status, search } = {}) {
        const f = filters().eq('company_id', companyId).eq('role', role).eq('status', status)
        if (search) {
          f.raw('(full_name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1)', [`%${search}%`])
        }
        return rows(
          `SELECT ${PUBLIC_USER_COLUMNS},
             (SELECT count(*)::int FROM rentals r WHERE r.created_by = users.id) AS rentals_captured
           FROM users${f.where()}
           ORDER BY full_name`,
          f.params,
        )
      },
      async get(id) {
        return one(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`, [id])
      },
    },

    /* ================================================================ cars */
    cars: {
      async list({ companyId, status, category, search } = {}) {
        const f = filters().eq('c.company_id', companyId).eq('c.category', category)
        if (status && status !== 'all') f.eq('c.status', status)
        if (search) {
          f.raw(
            '(c.registration ILIKE $1 OR c.make ILIKE $1 OR c.model ILIKE $1 OR c.color ILIKE $1)',
            [`%${search}%`],
          )
        }
        const list = await rows(
          `SELECT c.*, to_jsonb(r) - 'company_id' AS current_rental
           FROM cars c
           LEFT JOIN LATERAL (
             SELECT * FROM rentals
             WHERE car_id = c.id AND status IN ('active','overdue')
             ORDER BY pickup_at DESC LIMIT 1
           ) r ON TRUE${f.where()}
           ORDER BY c.registration`,
          f.params,
        )
        const hydrated = await Promise.all(
          list.map(async (car) => ({
            ...car,
            daily_rate: num(car.daily_rate),
            current_rental: car.current_rental
              ? decorateRental(
                  await one(`${RENTAL_SELECT} WHERE r.id = $1`, [car.current_rental.id]),
                )
              : null,
          })),
        )
        return hydrated
      },

      async get(id) {
        const car = await one('SELECT * FROM cars WHERE id = $1', [id])
        return car ? { ...car, daily_rate: num(car.daily_rate) } : null
      },

      async create(input, actor) {
        const registration = String(input.registration).trim().toUpperCase()
        const clash = await one(
          'SELECT id FROM cars WHERE company_id = $1 AND lower(registration) = lower($2)',
          [input.company_id, registration],
        )
        if (clash) throw new Error(`Registration ${registration} already exists in the fleet.`)
        const car = await one(
          `INSERT INTO cars (company_id, make, model, year, registration, color, category,
                             daily_rate, status, photo_url, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [
            input.company_id,
            input.make,
            input.model,
            Number(input.year),
            registration,
            input.color || null,
            input.category || 'sedan',
            Number(input.daily_rate) || 0,
            input.status || 'available',
            input.photo_url || null,
            input.notes || null,
          ],
        )
        await logActivity({
          company_id: input.company_id,
          user_id: actor?.id || null,
          action: 'car.created',
          entity: 'car',
          entity_id: car.id,
          summary: `Added ${car.make} ${car.model} (${car.registration}) to the fleet`,
          metadata: { registration: car.registration },
        })
        return { ...car, daily_rate: num(car.daily_rate) }
      },

      async update(id, patch, actor) {
        const previous = await one('SELECT * FROM cars WHERE id = $1', [id])
        if (!previous) throw new Error('Vehicle not found')
        if (patch.registration) {
          const clash = await one(
            'SELECT id FROM cars WHERE company_id = $1 AND lower(registration) = lower($2) AND id <> $3',
            [previous.company_id, patch.registration, id],
          )
          if (clash) throw new Error(`Registration ${patch.registration} already exists in the fleet.`)
        }
        const car = await one(
          `UPDATE cars SET
             make = COALESCE($2, make),
             model = COALESCE($3, model),
             year = COALESCE($4, year),
             registration = COALESCE(upper($5), registration),
             color = COALESCE($6, color),
             category = COALESCE($7, category),
             daily_rate = COALESCE($8, daily_rate),
             status = COALESCE($9, status),
             photo_url = COALESCE($10, photo_url),
             notes = COALESCE($11, notes),
             updated_at = now()
           WHERE id = $1 RETURNING *`,
          [
            id,
            patch.make ?? null,
            patch.model ?? null,
            patch.year !== undefined ? Number(patch.year) : null,
            patch.registration ?? null,
            patch.color ?? null,
            patch.category ?? null,
            patch.daily_rate !== undefined ? Number(patch.daily_rate) : null,
            patch.status ?? null,
            patch.photo_url ?? null,
            patch.notes ?? null,
          ],
        )
        await logActivity({
          company_id: car.company_id,
          user_id: actor?.id || null,
          action: 'car.updated',
          entity: 'car',
          entity_id: id,
          summary:
            previous.status !== car.status
              ? `Moved ${car.make} ${car.model} (${car.registration}) to ${car.status}`
              : `Updated ${car.make} ${car.model} (${car.registration})`,
          metadata: { status: car.status },
        })
        return { ...car, daily_rate: num(car.daily_rate) }
      },

      async remove(id, actor) {
        const car = await one('SELECT * FROM cars WHERE id = $1', [id])
        if (!car) throw new Error('Vehicle not found')
        const linked = await one('SELECT count(*)::int AS count FROM rentals WHERE car_id = $1', [id])
        if (num(linked.count) > 0) {
          throw new Error(
            `This vehicle has ${num(linked.count)} rental record(s). Mark it inactive instead of deleting it.`,
          )
        }
        await rows('DELETE FROM cars WHERE id = $1', [id])
        await logActivity({
          company_id: car.company_id,
          user_id: actor?.id || null,
          action: 'car.deleted',
          entity: 'car',
          entity_id: id,
          summary: `Removed ${car.make} ${car.model} (${car.registration}) from the fleet`,
        })
        return { removed: true }
      },

      async categories({ companyId }) {
        const result = await rows(
          'SELECT DISTINCT category FROM cars WHERE company_id = $1 ORDER BY category',
          [companyId],
        )
        return result.map((row) => row.category)
      },
    },

    /* ========================================================== customers */
    customers: {
      async list({ companyId, search } = {}) {
        const params = [companyId]
        let text = `SELECT c.*,
             (SELECT count(*)::int FROM rentals r WHERE r.customer_id = c.id AND r.status <> 'cancelled') AS rentals,
             COALESCE((SELECT SUM(r.total_amount
                 + COALESCE((SELECT SUM((x->>'amount')::numeric)
                             FROM jsonb_array_elements(r.additional_charges) AS x), 0))
                 FROM rentals r WHERE r.customer_id = c.id AND r.status <> 'cancelled'), 0)::float AS spend,
             (SELECT max(r.pickup_at) FROM rentals r WHERE r.customer_id = c.id) AS last_rental
           FROM customers c WHERE c.company_id = $1`
        if (search) {
          params.push(`%${search}%`)
          text += ` AND (full_name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2 OR id_number ILIKE $2 OR driver_license ILIKE $2)`
        }
        const list = await rows(`${text} ORDER BY c.full_name`, params)
        return list.map((customer) => ({ ...customer, spend: num(customer.spend) }))
      },

      async get(id) {
        return one('SELECT * FROM customers WHERE id = $1', [id])
      },

      async create(input, actor) {
        const customer = await one(
          `INSERT INTO customers (company_id, full_name, phone, email, id_number, driver_license, address, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [
            input.company_id,
            input.full_name,
            input.phone || null,
            input.email || null,
            input.id_number || null,
            input.driver_license || null,
            input.address || null,
            input.notes || null,
          ],
        )
        await logActivity({
          company_id: input.company_id,
          user_id: actor?.id || null,
          action: 'customer.created',
          entity: 'customer',
          entity_id: customer.id,
          summary: `Added customer ${customer.full_name}`,
        })
        return customer
      },

      async update(id, patch, actor) {
        const customer = await one(
          `UPDATE customers SET
             full_name = COALESCE($2, full_name),
             phone = COALESCE($3, phone),
             email = COALESCE($4, email),
             id_number = COALESCE($5, id_number),
             driver_license = COALESCE($6, driver_license),
             address = COALESCE($7, address),
             notes = COALESCE($8, notes),
             updated_at = now()
           WHERE id = $1 RETURNING *`,
          [
            id,
            patch.full_name ?? null,
            patch.phone ?? null,
            patch.email ?? null,
            patch.id_number ?? null,
            patch.driver_license ?? null,
            patch.address ?? null,
            patch.notes ?? null,
          ],
        )
        if (!customer) throw new Error('Customer not found')
        await logActivity({
          company_id: customer.company_id,
          user_id: actor?.id || null,
          action: 'customer.updated',
          entity: 'customer',
          entity_id: id,
          summary: `Updated customer ${customer.full_name}`,
        })
        return customer
      },

      async remove(id, actor) {
        const customer = await one('SELECT * FROM customers WHERE id = $1', [id])
        if (!customer) throw new Error('Customer not found')
        const linked = await one(
          'SELECT count(*)::int AS count FROM rentals WHERE customer_id = $1',
          [id],
        )
        if (num(linked.count) > 0) {
          throw new Error(`This customer has ${num(linked.count)} rental record(s) and cannot be deleted.`)
        }
        await rows('DELETE FROM customers WHERE id = $1', [id])
        await logActivity({
          company_id: customer.company_id,
          user_id: actor?.id || null,
          action: 'customer.deleted',
          entity: 'customer',
          entity_id: id,
          summary: `Deleted customer ${customer.full_name}`,
        })
        return { removed: true }
      },

      async history(customerId, { companyId } = {}) {
        const f = filters().eq('r.customer_id', customerId).eq('r.company_id', companyId)
        const list = await rows(`${RENTAL_SELECT}${f.where()} ORDER BY r.pickup_at DESC`, f.params)
        return list.map((rental) =>
          decorateRental({ ...rental, payments: (rental.payments || []).map(shapePaymentRow) }),
        )
      },
    },

    /* ============================================================ rentals */
    rentals: {
      async list({
        companyId,
        status,
        search,
        from,
        to,
        carId,
        customerId,
        createdBy,
        limit,
      } = {}) {
        const f = filters()
          .eq('r.company_id', companyId)
          .eq('r.car_id', carId)
          .eq('r.customer_id', customerId)
          .eq('r.created_by', createdBy)
          .op('r.expected_return_at', '>=', from)
          .op('r.pickup_at', '<=', to)

        if (status === 'overdue') {
          f.raw(`(r.status IN ('active','overdue') AND r.actual_return_at IS NULL AND r.expected_return_at < now())`)
        } else if (status && status !== 'all') {
          f.eq('r.status', status)
        }

        if (search) {
          f.raw(
            `(r.reference ILIKE $1 OR r.notes ILIKE $1
              OR cu.full_name ILIKE $1 OR cu.phone ILIKE $1
              OR c.registration ILIKE $1
              OR (c.make || ' ' || c.model) ILIKE $1)`,
            [`%${search}%`],
          )
        }

        const text = `${RENTAL_SELECT}${f.where()}
          ORDER BY r.pickup_at DESC${limit ? ` LIMIT ${Number(limit)}` : ''}`

        const list = await rows(text, f.params)
        return list.map((rental) =>
          decorateRental({ ...rental, payments: (rental.payments || []).map(shapePaymentRow) }),
        )
      },

      async get(id, { companyId } = {}) {
        const f = filters().eq('r.id', id).eq('r.company_id', companyId)
        const rental = await one(`${RENTAL_SELECT}${f.where()}`, f.params)
        if (!rental) return null
        return decorateRental({
          ...rental,
          payments: (rental.payments || []).map(shapePaymentRow),
        })
      },

      async create(input, actor) {
        const car = await one('SELECT * FROM cars WHERE id = $1', [input.car_id])
        if (!car) throw new Error('Vehicle not found')
        if (car.status === 'maintenance' || car.status === 'inactive') {
          throw new Error(`${car.registration} is ${car.status} and cannot be rented out.`)
        }
        if (car.status === 'rented') {
          const activeRental = await one(
            `SELECT reference, expected_return_at FROM rentals
             WHERE car_id = $1 AND status IN ('active','overdue')
               AND $2::timestamptz < expected_return_at
               AND $3::timestamptz > pickup_at
             LIMIT 1`,
            [car.id, input.pickup_at, input.expected_return_at],
          )
          if (activeRental) {
            throw new Error(
              `${car.registration} is already on rental ${activeRental.reference} until ${activeRental.expected_return_at}.`,
            )
          }
        }
        const clash = await one(
          `SELECT reference, expected_return_at FROM rentals
           WHERE car_id = $1 AND status IN ('active','overdue')
             AND $2::timestamptz < expected_return_at
             AND $3::timestamptz > pickup_at
           LIMIT 1`,
          [car.id, input.pickup_at, input.expected_return_at],
        )
        if (clash) {
          throw new Error(
            `${car.registration} is already on rental ${clash.reference} until ${clash.expected_return_at}.`,
          )
        }

        const days = Math.max(1, daysBetween(input.pickup_at, input.expected_return_at))
        const dailyRate = Number(input.daily_rate ?? car.daily_rate) || 0
        const year = new Date().getFullYear()
        const highest = await one(
          `SELECT coalesce(max(substring(reference from '[0-9]+$')::int), 0) AS value
           FROM rentals WHERE company_id = $1 AND reference LIKE $2`,
          [car.company_id, `RNT-${year}-%`],
        )
        const reference = `RNT-${year}-${String(num(highest?.value) + 1).padStart(4, '0')}`

        const rental = await one(
          `INSERT INTO rentals (company_id, car_id, customer_id, created_by, reference, pickup_at,
                                expected_return_at, daily_rate, days, total_amount, deposit_amount,
                                additional_charges, status, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,'active',$13)
           RETURNING *`,
          [
            car.company_id,
            car.id,
            input.customer_id,
            actor?.id || input.created_by,
            reference,
            input.pickup_at,
            input.expected_return_at,
            dailyRate,
            days,
            Number(input.total_amount ?? dailyRate * days) || 0,
            Number(input.deposit_amount) || 0,
            JSON.stringify(Array.isArray(input.additional_charges) ? input.additional_charges : []),
            input.notes || null,
          ],
        )
        await rows(`UPDATE cars SET status = 'rented', updated_at = now() WHERE id = $1`, [car.id])

        if (Number(input.amount_paid) > 0) {
          await rows(
            `INSERT INTO payments (company_id, rental_id, amount, method, note, received_by)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              rental.company_id,
              rental.id,
              Number(input.amount_paid),
              input.payment_method || 'cash',
              'Deposit / initial payment at booking',
              actor?.id || input.created_by,
            ],
          )
        }

        const customer = await one('SELECT full_name FROM customers WHERE id = $1', [
          input.customer_id,
        ])
        await logActivity({
          company_id: rental.company_id,
          user_id: actor?.id || null,
          action: 'rental.created',
          entity: 'rental',
          entity_id: rental.id,
          summary: `Captured rental ${rental.reference} for ${customer?.full_name ?? 'customer'} (${car.make} ${car.model})`,
          metadata: { reference, total: rental.total_amount },
        })
        return this.get(rental.id)
      },

      async update(id, patch, actor) {
        const current = await one('SELECT * FROM rentals WHERE id = $1', [id])
        if (!current) throw new Error('Rental not found')
        const pickup = patch.pickup_at ?? current.pickup_at
        const expected = patch.expected_return_at ?? current.expected_return_at

        const updated = await one(
          `UPDATE rentals SET
             car_id = COALESCE($2, car_id),
             customer_id = COALESCE($3, customer_id),
             pickup_at = COALESCE($4, pickup_at),
             expected_return_at = COALESCE($5, expected_return_at),
             daily_rate = COALESCE($6, daily_rate),
             days = COALESCE($7, days),
             total_amount = COALESCE($8, total_amount),
             deposit_amount = COALESCE($9, deposit_amount),
             additional_charges = COALESCE($10::jsonb, additional_charges),
             status = COALESCE($11, status),
             notes = COALESCE($12, notes),
             updated_at = now()
           WHERE id = $1 RETURNING *`,
          [
            id,
            patch.car_id ?? null,
            patch.customer_id ?? null,
            patch.pickup_at ?? null,
            patch.expected_return_at ?? null,
            patch.daily_rate !== undefined ? Number(patch.daily_rate) : null,
            daysBetween(pickup, expected),
            patch.total_amount !== undefined ? Number(patch.total_amount) : null,
            patch.deposit_amount !== undefined ? Number(patch.deposit_amount) : null,
            patch.additional_charges ? JSON.stringify(patch.additional_charges) : null,
            patch.status ?? null,
            patch.notes ?? null,
          ],
        )

        if (patch.car_id && patch.car_id !== current.car_id) {
          await rows(
            `UPDATE cars SET status = 'available' WHERE id = $1 AND status = 'rented'`,
            [current.car_id],
          )
        }
        if (updated.status === 'active' || updated.status === 'overdue') {
          await rows(`UPDATE cars SET status = 'rented', updated_at = now() WHERE id = $1`, [
            updated.car_id,
          ])
        }

        await logActivity({
          company_id: updated.company_id,
          user_id: actor?.id || null,
          action: 'rental.updated',
          entity: 'rental',
          entity_id: id,
          summary: `Updated rental ${updated.reference}`,
          metadata: { fields: Object.keys(patch) },
        })
        return this.get(id)
      },

      async returnCar(id, { actual_return_at, additional_charges, notes }, actor) {
        const current = await one('SELECT * FROM rentals WHERE id = $1', [id])
        if (!current) throw new Error('Rental not found')
        if (current.actual_return_at) throw new Error('This rental has already been closed.')

        const returnedAt = actual_return_at || new Date().toISOString()
        const days = Math.max(1, daysBetween(current.pickup_at, returnedAt))
        const lateDays = Math.max(0, daysBetween(current.expected_return_at, returnedAt) - 1)
        const charges = Array.isArray(additional_charges)
          ? additional_charges
          : (current.additional_charges ?? [])
        if (lateDays > 0 && !charges.some((charge) => /late/i.test(charge.label ?? ''))) {
          charges.push({
            label: `Late return fee (${lateDays} day${lateDays > 1 ? 's' : ''})`,
            amount: Math.round(num(current.daily_rate) * 0.5 * lateDays),
          })
        }

        await rows(
          `UPDATE rentals SET actual_return_at = $2, days = $3, total_amount = $4,
                              additional_charges = $5::jsonb, status = 'completed',
                              notes = COALESCE($6, notes), updated_at = now()
           WHERE id = $1`,
          [
            id,
            returnedAt,
            days,
            num(current.daily_rate) * days,
            JSON.stringify(charges),
            notes ?? null,
          ],
        )
        await rows(`UPDATE cars SET status = 'available', updated_at = now() WHERE id = $1`, [
          current.car_id,
        ])

        const car = await one('SELECT make, model, registration FROM cars WHERE id = $1', [
          current.car_id,
        ])
        await logActivity({
          company_id: current.company_id,
          user_id: actor?.id || null,
          action: 'rental.returned',
          entity: 'rental',
          entity_id: id,
          summary: `Returned ${car ? `${car.make} ${car.model} ${car.registration}` : 'vehicle'} for rental ${current.reference}`,
          metadata: { reference: current.reference, days, lateDays },
        })
        return this.get(id)
      },

      async cancel(id, reason, actor) {
        const current = await one('SELECT * FROM rentals WHERE id = $1', [id])
        if (!current) throw new Error('Rental not found')
        if (current.actual_return_at) throw new Error('A completed rental cannot be cancelled.')
        const note = reason
          ? `${current.notes ? `${current.notes}\n` : ''}Cancelled: ${reason}`
          : current.notes
        await rows(`UPDATE rentals SET status = 'cancelled', notes = $2, updated_at = now() WHERE id = $1`, [
          id,
          note,
        ])
        await rows(
          `UPDATE cars SET status = 'available', updated_at = now()
           WHERE id = $1 AND status = 'rented'`,
          [current.car_id],
        )
        await logActivity({
          company_id: current.company_id,
          user_id: actor?.id || null,
          action: 'rental.cancelled',
          entity: 'rental',
          entity_id: id,
          summary: `Cancelled rental ${current.reference}${reason ? ` — ${reason}` : ''}`,
        })
        return this.get(id)
      },

      async remove(id, actor) {
        const current = await one('SELECT * FROM rentals WHERE id = $1', [id])
        if (!current) throw new Error('Rental not found')
        await rows('DELETE FROM rentals WHERE id = $1', [id])
        await logActivity({
          company_id: current.company_id,
          user_id: actor?.id || null,
          action: 'rental.deleted',
          entity: 'rental',
          entity_id: id,
          summary: `Deleted rental ${current.reference}`,
        })
        return { removed: true }
      },
    },

    /* =========================================================== payments */
    payments: {
      async list({ companyId, rentalId, method, from, to } = {}) {
        const f = filters()
          .eq('p.company_id', companyId)
          .eq('p.rental_id', rentalId)
          .eq('p.method', method)
          .op('p.received_at', '>=', from)
          .op('p.received_at', '<=', to)
        const list = await rows(
          `SELECT p.*, r.reference AS rental_reference, cu.full_name AS customer_name,
                  (c.make || ' ' || c.model) AS car_label,
                  to_jsonb(u.*) - 'company_id' - 'password_hash' AS received_by_user
           FROM payments p
           LEFT JOIN rentals r   ON r.id = p.rental_id
           LEFT JOIN customers cu ON cu.id = r.customer_id
           LEFT JOIN cars c      ON c.id = r.car_id
           LEFT JOIN users u     ON u.id = p.received_by
           ${f.where()}
           ORDER BY p.received_at DESC`,
          f.params,
        )
        return list.map(shapePaymentRow)
      },

      async create({ companyId, rental_id, amount, method, reference, note }, actor) {
        const rental = await one('SELECT * FROM rentals WHERE id = $1', [rental_id])
        if (!rental) throw new Error('Rental not found')
        const value = Number(amount)
        if (!(value > 0)) throw new Error('Payment amount must be greater than zero.')
        const payment = await one(
          `INSERT INTO payments (company_id, rental_id, amount, method, reference, note, received_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [
            companyId || rental.company_id,
            rental_id,
            value,
            method || 'cash',
            reference || null,
            note || null,
            actor?.id || null,
          ],
        )
        await logActivity({
          company_id: payment.company_id,
          user_id: actor?.id || null,
          action: 'payment.recorded',
          entity: 'payment',
          entity_id: payment.id,
          summary: `Recorded ${payment.method} payment on rental ${rental.reference}`,
          metadata: { amount: value, method: payment.method, reference: rental.reference },
        })
        return shapePaymentRow(payment)
      },

      async remove(id, actor) {
        const payment = await one('SELECT * FROM payments WHERE id = $1', [id])
        if (!payment) throw new Error('Payment not found')
        await rows('DELETE FROM payments WHERE id = $1', [id])
        await logActivity({
          company_id: payment.company_id,
          user_id: actor?.id || null,
          action: 'payment.deleted',
          entity: 'payment',
          entity_id: id,
          summary: 'Removed a payment record',
          metadata: { amount: payment.amount },
        })
        return { removed: true }
      },
    },

    /* =========================================================== activity */
    activity: {
      async list({ companyId, userId, action, search, limit = 200 } = {}) {
        const f = filters().eq('a.company_id', companyId).eq('a.user_id', userId)
        if (action && action !== 'all') f.raw('a.action LIKE $1', [`${action}%`])
        if (search) f.raw('(a.summary ILIKE $1 OR a.action ILIKE $1)', [`%${search}%`])
        const list = await rows(
          `SELECT a.*, to_jsonb(u.*) - 'company_id' - 'password_hash' AS user
           FROM activity_log a
           LEFT JOIN users u ON u.id = a.user_id
           ${f.where()}
           ORDER BY a.created_at DESC
           LIMIT $${f.params.push(Number(limit))}`,
          f.params,
        )
        return list
      },
    },

    /* ============================================================ reports */
    reports: {
      async dashboard(companyId) {
        const [company, counts, money, overdueRows, dueSoonRows, upcomingRows, recentRows, activityRows] =
          await Promise.all([
            one('SELECT * FROM companies WHERE id = $1', [companyId]),
            one(
              `SELECT
                 (SELECT count(*)::int FROM cars WHERE company_id = $1) AS cars_total,
                 (SELECT count(*)::int FROM cars WHERE company_id = $1 AND status = 'available') AS cars_available,
                 (SELECT count(*)::int FROM cars WHERE company_id = $1 AND status = 'rented') AS cars_rented,
                 (SELECT count(*)::int FROM cars WHERE company_id = $1 AND status = 'maintenance') AS cars_maintenance,
                 (SELECT count(*)::int FROM cars WHERE company_id = $1 AND status = 'inactive') AS cars_inactive,
                 (SELECT count(*)::int FROM rentals WHERE company_id = $1) AS rentals_total,
                 (SELECT count(*)::int FROM rentals WHERE company_id = $1 AND status = 'active') AS rentals_active,
                 (SELECT count(*)::int FROM rentals WHERE company_id = $1 AND status = 'completed') AS rentals_completed,
                 (SELECT count(*)::int FROM rentals WHERE company_id = $1 AND status = 'cancelled') AS rentals_cancelled,
                 (SELECT count(*)::int FROM customers WHERE company_id = $1) AS customers_total,
                 (SELECT count(*)::int FROM users WHERE company_id = $1 AND role = 'member' AND status = 'active') AS members_active`,
              [companyId],
            ),
            one(
              `SELECT
                 COALESCE((SELECT SUM(amount) FROM payments
                           WHERE company_id = $1 AND received_at >= date_trunc('month', now())), 0)::float AS revenue_this_month,
                 COALESCE((SELECT SUM(amount) FROM payments WHERE company_id = $1), 0)::float AS revenue_total,
                 COALESCE((SELECT SUM(billed) FROM (
                     SELECT r.total_amount
                       + COALESCE((SELECT SUM((c->>'amount')::numeric)
                                   FROM jsonb_array_elements(r.additional_charges) AS c), 0) AS billed
                     FROM rentals r WHERE company_id = $1 AND status <> 'cancelled'
                   ) s), 0)::float AS billed_total,
                 COALESCE((SELECT SUM(balance) FROM rentals_with_balance
                           WHERE company_id = $1 AND status <> 'cancelled'), 0)::float AS outstanding,
                 COALESCE((SELECT SUM(deposit_amount) FROM rentals
                           WHERE company_id = $1 AND status = 'active'), 0)::float AS deposits_held`,
              [companyId],
            ),
            rows(
              `${RENTAL_SELECT} WHERE r.company_id = $1
                AND r.status IN ('active','overdue') AND r.actual_return_at IS NULL
                AND r.expected_return_at < now()
                ORDER BY r.expected_return_at`,
              [companyId],
            ),
            rows(
              `${RENTAL_SELECT} WHERE r.company_id = $1
                AND r.status = 'active' AND r.actual_return_at IS NULL
                AND r.expected_return_at BETWEEN now() AND now() + interval '1 day'
                ORDER BY r.expected_return_at`,
              [companyId],
            ),
            rows(
              `${RENTAL_SELECT} WHERE r.company_id = $1 AND r.status = 'active'
                AND r.actual_return_at IS NULL AND r.expected_return_at >= now()
                ORDER BY r.expected_return_at LIMIT 6`,
              [companyId],
            ),
            rows(`${RENTAL_SELECT} WHERE r.company_id = $1 ORDER BY r.created_at DESC LIMIT 6`, [
              companyId,
            ]),
            rows(
              `SELECT a.*, to_jsonb(u.*) - 'company_id' - 'password_hash' AS user
               FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
               WHERE a.company_id = $1 ORDER BY a.created_at DESC LIMIT 8`,
              [companyId],
            ),
          ])

        const shape = (rental) =>
          decorateRental({ ...rental, payments: (rental.payments || []).map(shapePaymentRow) })

        return {
          currency: company?.currency || 'USD',
          counts: {
            ...counts,
            cars_total: num(counts.cars_total),
            cars_available: num(counts.cars_available),
            cars_rented: num(counts.cars_rented),
            cars_maintenance: num(counts.cars_maintenance),
            cars_inactive: num(counts.cars_inactive),
            rentals_total: num(counts.rentals_total),
            rentals_active: num(counts.rentals_active),
            rentals_overdue: overdueRows.length,
            rentals_completed: num(counts.rentals_completed),
            rentals_cancelled: num(counts.rentals_cancelled),
            customers_total: num(counts.customers_total),
            members_active: num(counts.members_active),
          },
          money: {
            revenue_this_month: num(money.revenue_this_month),
            revenue_total: num(money.revenue_total),
            billed_total: num(money.billed_total),
            outstanding: num(money.outstanding),
            deposits_held: num(money.deposits_held),
          },
          attention: {
            due_soon: dueSoonRows.map(shape),
            overdue: overdueRows.map(shape),
          },
          upcoming: upcomingRows.map(shape),
          recent: recentRows.map(shape),
          top_cars: (await this.utilization(companyId)).slice(0, 5),
          recent_activity: activityRows,
        }
      },

      async revenue(companyId, { from, to } = {}) {
        const start = from ? startOfDay(new Date(from)) : startOfDay(addDays(new Date(), -29))
        const end = to ? startOfDay(new Date(to)) : startOfDay(new Date())
        const series = await rows(
          `WITH span AS (
             SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
           ),
           collected AS (
             SELECT date(received_at) AS day, sum(amount) AS amount
             FROM payments WHERE company_id = $1 AND received_at >= $2::timestamptz
               AND received_at < $3::timestamptz + interval '1 day'
             GROUP BY 1
           ),
           billed AS (
             SELECT date(pickup_at) AS day,
                    sum(total_amount + COALESCE((SELECT SUM((c->>'amount')::numeric)
                      FROM jsonb_array_elements(additional_charges) AS c), 0)) AS amount,
                    count(*) AS rentals
             FROM rentals WHERE company_id = $1 AND status <> 'cancelled'
               AND pickup_at >= $2::timestamptz AND pickup_at < $3::timestamptz + interval '1 day'
             GROUP BY 1
           )
           SELECT to_char(span.day, 'YYYY-MM-DD') AS date,
                  COALESCE(collected.amount, 0)::float AS collected,
                  COALESCE(billed.amount, 0)::float AS billed,
                  COALESCE(billed.rentals, 0)::int AS rentals
           FROM span
           LEFT JOIN collected ON collected.day = span.day
           LEFT JOIN billed    ON billed.day    = span.day
           ORDER BY span.day`,
          [companyId, start.toISOString(), end.toISOString()],
        )

        const totalsRow = await one(
          `SELECT
             (SELECT count(*)::int FROM rentals WHERE company_id = $1 AND status <> 'cancelled'
               AND pickup_at >= $2::timestamptz AND pickup_at < $3::timestamptz + interval '1 day') AS rentals,
             (SELECT coalesce(avg(total_amount), 0)::float FROM rentals
               WHERE company_id = $1 AND status <> 'cancelled'
                 AND pickup_at >= $2::timestamptz AND pickup_at < $3::timestamptz + interval '1 day') AS avg_value,
             (SELECT coalesce(sum(balance), 0)::float FROM rentals_with_balance
               WHERE company_id = $1 AND status <> 'cancelled'
                 AND pickup_at >= $2::timestamptz AND pickup_at < $3::timestamptz + interval '1 day') AS outstanding`,
          [companyId, start.toISOString(), end.toISOString()],
        )

        const statusRows = await rows(
          `SELECT status,
                  (status IN ('active','overdue') AND actual_return_at IS NULL
                    AND expected_return_at < now()) AS derived_overdue,
                  count(*)::int AS count
           FROM rentals
           WHERE company_id = $1 AND status <> 'cancelled'
             AND pickup_at >= $2::timestamptz AND pickup_at < $3::timestamptz + interval '1 day'
           GROUP BY 1, 2`,
          [companyId, start.toISOString(), end.toISOString()],
        )

        const methodRows = await rows(
          `SELECT method, sum(amount)::float AS amount FROM payments
           WHERE company_id = $1 AND received_at >= $2::timestamptz
             AND received_at < $3::timestamptz + interval '1 day'
           GROUP BY method ORDER BY amount DESC`,
          [companyId, start.toISOString(), end.toISOString()],
        )

        return {
          from: start.toISOString(),
          to: end.toISOString(),
          series,
          totals: {
            collected: series.reduce((sum, bucket) => sum + num(bucket.collected), 0),
            billed: series.reduce((sum, bucket) => sum + num(bucket.billed), 0),
            rentals: num(totalsRow.rentals),
            average_rental_value: num(totalsRow.avg_value),
            outstanding: num(totalsRow.outstanding),
          },
          by_status: ['active', 'completed', 'overdue', 'cancelled'].map((status) => ({
            status,
            count: statusRows
              .filter((row) => (row.derived_overdue ? 'overdue' : row.status) === status)
              .reduce((sum, row) => sum + num(row.count), 0),
          })),
          by_method: methodRows.map((row) => ({ method: row.method, amount: num(row.amount) })),
        }
      },

      async utilization(companyId, { from, to } = {}) {
        const start = from ? startOfDay(new Date(from)) : startOfDay(addDays(new Date(), -89))
        const end = to ? startOfDay(new Date(to)) : startOfDay(new Date())
        const windowDays = Math.max(1, Math.round((end - start) / 86_400_000) + 1)

        const list = await rows(
          `SELECT c.id, c.registration, (c.make || ' ' || c.model) AS car_label, c.category, c.status,
                  c.daily_rate::float AS daily_rate,
                  count(r.id)::int AS rentals,
                  COALESCE(sum(LEAST(GREATEST(
                    EXTRACT(EPOCH FROM (coalesce(r.actual_return_at, r.expected_return_at) - r.pickup_at))::numeric / 86400,
                    1), $3)), 0)::float AS days_rented,
                  COALESCE(sum(r.total_amount
                    + COALESCE((SELECT SUM((x->>'amount')::numeric)
                                FROM jsonb_array_elements(r.additional_charges) AS x), 0)), 0)::float AS revenue
           FROM cars c
           LEFT JOIN rentals r ON r.car_id = c.id AND r.status <> 'cancelled'
             AND r.pickup_at <= $2::timestamptz + interval '1 day'
           WHERE c.company_id = $1
           GROUP BY c.id
           ORDER BY revenue DESC`,
          [companyId, end.toISOString(), windowDays],
        )

        const outstanding = await rows(
          `SELECT car_id, coalesce(sum(balance), 0)::float AS outstanding
           FROM rentals_with_balance
           WHERE company_id = $1 AND status <> 'cancelled'
             AND pickup_at >= $2::timestamptz AND pickup_at <= $3::timestamptz + interval '1 day'
           GROUP BY car_id`,
          [companyId, start.toISOString(), end.toISOString()],
        )
        const outstandingByCar = new Map(outstanding.map((row) => [row.car_id, num(row.outstanding)]))

        return list.map((row) => {
          const daysRented = Math.round(num(row.days_rented))
          return {
            id: row.id,
            registration: row.registration,
            label: row.car_label,
            category: row.category,
            status: row.status,
            daily_rate: num(row.daily_rate),
            rentals: num(row.rentals),
            days_rented: daysRented,
            utilization: Math.min(100, Math.round((daysRented / windowDays) * 100)),
            revenue: num(row.revenue),
            outstanding: outstandingByCar.get(row.id) ?? 0,
          }
        })
      },

      async memberActivity(companyId, { from, to } = {}) {
        const start = from ? startOfDay(new Date(from)) : startOfDay(addDays(new Date(), -29))
        const end = to ? startOfDay(new Date(to)) : startOfDay(new Date())
        const list = await rows(
          `SELECT u.id, u.full_name, u.email, u.role, u.status,
             (SELECT count(*)::int FROM rentals r
               WHERE r.created_by = u.id AND r.company_id = $1
                 AND r.pickup_at >= $2::timestamptz AND r.pickup_at < $3::timestamptz + interval '1 day') AS rentals_captured,
             (SELECT count(*)::int FROM rentals r
               WHERE r.created_by = u.id AND r.company_id = $1 AND r.status = 'active'
                 AND r.pickup_at >= $2::timestamptz AND r.pickup_at < $3::timestamptz + interval '1 day') AS active,
             (SELECT count(*)::int FROM rentals r
               WHERE r.created_by = u.id AND r.company_id = $1 AND r.status = 'completed'
                 AND r.pickup_at >= $2::timestamptz AND r.pickup_at < $3::timestamptz + interval '1 day') AS completed,
             (SELECT coalesce(sum(r.total_amount
                 + COALESCE((SELECT SUM((x->>'amount')::numeric)
                             FROM jsonb_array_elements(r.additional_charges) AS x), 0)), 0)::float
              FROM rentals r
              WHERE r.created_by = u.id AND r.company_id = $1
                AND r.pickup_at >= $2::timestamptz AND r.pickup_at < $3::timestamptz + interval '1 day') AS billed,
             (SELECT coalesce(sum(p.amount), 0)::float FROM payments p
               WHERE p.received_by = u.id AND p.company_id = $1
                 AND p.received_at >= $2::timestamptz AND p.received_at < $3::timestamptz + interval '1 day') AS collected,
             (SELECT count(*)::int FROM activity_log a WHERE a.user_id = u.id) AS actions
           FROM users u
           WHERE u.company_id = $1
           ORDER BY rentals_captured DESC`,
          [companyId, start.toISOString(), end.toISOString()],
        )
        return list.map((row) => ({
          ...row,
          rentals_captured: num(row.rentals_captured),
          active: num(row.active),
          completed: num(row.completed),
          billed: num(row.billed),
          collected: num(row.collected),
          actions: num(row.actions),
        }))
      },
    },
  }
}