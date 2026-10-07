import { loadDatabase, commit, resetDatabase, onDatabaseChange, exportDatabase } from './store'
import { buildSeed } from './seed'
import { hashPassword, verifyPassword, randomToken, randomDigits } from '@/lib/crypto'
import {
  uid,
  isOverdue,
  rentalTotal,
  rentalBalance,
  matchesSearch,
  toDate,
  startOfDay,
  addDays,
  addMonths,
  daysBetween,
  toDateInput,
  licenseDaysLeft,
  ownerFullName,
  splitRevenue,
  LICENSE_WARNING_DAYS,
  LICENSE_RENEWAL_DAYS,
} from '@/lib/utils'

/**
 * Mock data source — the reference implementation of the repository contract
 * shared with `src/db/neon/repo.neon.js`.
 *
 * Everything lives in browser localStorage, so the app is fully functional
 * before Neon is configured. Method signatures must stay identical between the
 * two implementations.
 */

const clone = (value) => (value === undefined ? value : structuredClone(value))
const byId = (rows) => new Map(rows.map((row) => [row.id, row]))

async function db() {
  return loadDatabase()
}

function sortBy(rows, key, direction = 'asc') {
  const factor = direction === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const left = a[key] ?? ''
    const right = b[key] ?? ''
    if (left === right) return 0
    return (left > right ? 1 : -1) * factor
  })
}

/* ============================================================== helpers */

function logActivity(data, entry) {
  data.activity.unshift({
    id: uid('act_'),
    created_at: new Date().toISOString(),
    metadata: {},
    ...entry,
  })
  data.activity = data.activity.slice(0, 500)
}

function nextReference(data, companyId) {
  const year = new Date().getFullYear()
  const prefix = `RNT-${year}-`
  const highest = data.rentals
    .filter((rental) => rental.company_id === companyId && rental.reference.startsWith(prefix))
    .map((rental) => Number(rental.reference.slice(prefix.length)) || 0)
    .reduce((max, value) => Math.max(max, value), 0)
  return `${prefix}${String(highest + 1).padStart(4, '0')}`
}

function hydrateRental(data, rental) {
  const car = data.cars.find((item) => item.id === rental.car_id)
  const customer = data.customers.find((item) => item.id === rental.customer_id)
  const creator = data.users.find((item) => item.id === rental.created_by)
  const payments = data.payments
    .filter((payment) => payment.rental_id === rental.id)
    .map((payment) => ({ ...payment, received_by_user: clone(data.users.find((u) => u.id === payment.received_by)) }))
  return {
    ...clone(rental),
    car: car ? publicCar(car) : null,
    customer: customer ? clone(customer) : null,
    created_by_user: creator ? publicUser(creator) : null,
    payments,
    is_overdue: isOverdue(rental),
    computed_status: isOverdue(rental) ? 'overdue' : rental.status,
    computed_total: rentalTotal(rental),
    computed_paid: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    computed_balance: rentalBalance({ ...rental, payments }),
  }
}

function publicUser(user) {
  if (!user) return null
  const { password_hash, ...rest } = user
  void password_hash
  return clone(rest)
}

/** Rows stored before the ownership/licence fields existed are backfilled here. */
function publicCar(car) {
  if (!car) return car
  return {
    ownership: 'owned',
    owner_first_name: '',
    owner_last_name: '',
    company_share_percent: 100,
    license_valid_from: null,
    license_valid_to: null,
    license_renewed_at: null,
    ...clone(car),
  }
}

function assertFound(entity, label) {
  if (!entity) throw new Error(`${label} not found`)
  return entity
}

/**
 * Applies the ownership block of a car payload.
 *
 * A patch that does not mention `ownership` (a status toggle, say) leaves the
 * existing arrangement alone, while switching back to `owned` clears the owner
 * and restores the company's share to 100%.
 */
function applyOwnershipFields(target, input) {
  if (input.ownership === undefined || input.ownership === null) return
  const subLease = input.ownership === 'sub_lease'
  target.ownership = subLease ? 'sub_lease' : 'owned'
  if (!subLease) {
    target.owner_first_name = ''
    target.owner_last_name = ''
    target.company_share_percent = 100
    return
  }
  target.owner_first_name = String(input.owner_first_name ?? target.owner_first_name ?? '').trim()
  target.owner_last_name = String(input.owner_last_name ?? target.owner_last_name ?? '').trim()
  const share = Number(input.company_share_percent ?? target.company_share_percent)
  target.company_share_percent = Number.isFinite(share)
    ? Math.min(100, Math.max(0, share))
    : target.company_share_percent || 0
}

/** Empty date inputs mean "no licence recorded yet", not an invalid date. */
function applyLicenseDates(target, input) {
  if (input.license_valid_from !== undefined) {
    target.license_valid_from = input.license_valid_from || null
  }
  if (input.license_valid_to !== undefined) {
    target.license_valid_to = input.license_valid_to || null
  }
}

/* =============================================================== export */

export function createMockRepository() {
  return {
    mode: 'mock',

    /* ------------------------------------------------------------ lifecycle */
    async bootstrap() {
      return db()
    },
    onChange(handler) {
      return onDatabaseChange(handler)
    },
    async resetDemoData() {
      await resetDatabase()
    },
    async importDemoData() {
      await resetDatabase()
    },
    exportData() {
      return exportDatabase()
    },

    /* ================================================================ auth */
    auth: {
      async isSetupComplete() {
        const data = await db()
        return data.companies.length > 0
      },

      /** First-run: register a company together with its owner account. */
      async createCompanyWithOwner({ company, owner }) {
        const data = await db()
        const companyId = uid('cmp_')
        const ownerId = uid('usr_')
        const timestamp = new Date().toISOString()

        data.companies.push({
          id: companyId,
          name: company.name,
          email: company.email || '',
          phone: company.phone || '',
          address: company.address || '',
          city: company.city || '',
          country: company.country || '',
          logo_url: company.logo_url || '',
          currency: company.currency || 'USD',
          timezone: company.timezone || 'UTC',
          members_see_all_rentals: false,
          members_edit_own_rentals: true,
          members_manage_fleet: false,
          password_reset_enabled: true,
          created_at: timestamp,
          updated_at: timestamp,
        })

        data.users.push({
          id: ownerId,
          company_id: companyId,
          full_name: owner.full_name,
          email: owner.email.trim().toLowerCase(),
          phone: owner.phone || '',
          password_hash: await hashPassword(owner.password),
          role: 'admin',
          status: 'active',
          avatar_url: '',
          last_login_at: timestamp,
          created_at: timestamp,
          updated_at: timestamp,
        })

        const confirmToken = randomToken()
        data.password_resets.push({
          id: uid('prs_'),
          user_id: ownerId,
          token: confirmToken,
          purpose: 'email_confirm',
          attempts: 0,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          used_at: null,
          created_at: timestamp,
        })

        commit()
        return {
          ...publicUser(data.users.find((user) => user.id === ownerId)),
          // Demo mode has no mail server: the link is handed back so the
          // setup screen can offer it directly.
          email_sent: false,
          confirmation_token: confirmToken,
        }
      },

      async signIn({ email, password }) {
        const data = await db()
        const user = data.users.find(
          (item) => item.email.toLowerCase() === String(email).trim().toLowerCase(),
        )
        if (!user) throw new Error('No account found for that email address.')
        if (user.status !== 'active') throw new Error('This account has been deactivated. Contact your admin.')
        const ok = await verifyPassword(password, user.password_hash)
        if (!ok) throw new Error('Incorrect password. Please try again.')
        user.last_login_at = new Date().toISOString()
        user.updated_at = user.last_login_at
        const company = data.companies.find((item) => item.id === user.company_id)
        logActivity(data, {
          company_id: user.company_id,
          user_id: user.id,
          action: 'auth.login',
          entity: 'user',
          entity_id: user.id,
          summary: `${user.full_name} signed in`,
        })
        commit()
        return { user: publicUser(user), company: clone(company) }
      },

      async signOut() {},

      /**
       * Redeems the emailed sign-in link issued at company creation.
       *
       * Single use and time limited, exactly as on the server, so the demo
       * behaves the way production does.
       */
      async confirmEmail(token) {
        const data = await db()
        const secret = String(token || '')
        const credential = (data.password_resets || []).find(
          (item) =>
            item.token === secret &&
            item.purpose === 'email_confirm' &&
            !item.used_at &&
            toDate(item.expires_at) > new Date(),
        )
        if (!credential) {
          throw new Error('This confirmation link is invalid or has expired. Please sign in instead.')
        }
        const user = data.users.find((item) => item.id === credential.user_id)
        if (!user || user.status !== 'active') {
          throw new Error('This confirmation link is invalid or has expired. Please sign in instead.')
        }
        credential.used_at = new Date().toISOString()
        user.last_login_at = credential.used_at
        user.updated_at = credential.used_at
        const company = data.companies.find((item) => item.id === user.company_id)
        logActivity(data, {
          company_id: user.company_id,
          user_id: user.id,
          action: 'auth.email_confirmed',
          entity: 'user',
          entity_id: user.id,
          summary: `${user.full_name} confirmed their email address`,
        })
        commit()
        return { user: publicUser(user), company: clone(company) }
      },

      async findUserById(id) {
        const data = await db()
        const user = data.users.find((item) => item.id === id)
        if (!user) return null
        const company = data.companies.find((item) => item.id === user.company_id)
        return { user: publicUser(user), company: clone(company) }
      },

      async createUser(input) {
        const data = await db()
        const email = input.email.trim().toLowerCase()
        if (data.users.some((item) => item.email.toLowerCase() === email)) {
          throw new Error('A user with that email address already exists.')
        }
        if (input.role === 'admin') {
          const admins = data.users.filter(
            (item) => item.company_id === input.company_id && item.role === 'admin' && item.status === 'active',
          )
          if (admins.length > 0) throw new Error('This company already has an active owner/admin account.')
        }
        const timestamp = new Date().toISOString()
        const user = {
          id: uid('usr_'),
          company_id: input.company_id,
          full_name: input.full_name.trim(),
          email,
          phone: input.phone || '',
          password_hash: await hashPassword(input.password),
          role: input.role || 'member',
          status: input.status || 'active',
          avatar_url: '',
          last_login_at: null,
          created_at: timestamp,
          updated_at: timestamp,
        }
        data.users.push(user)
        logActivity(data, {
          company_id: input.company_id,
          user_id: input.created_by || null,
          action: 'user.created',
          entity: 'user',
          entity_id: user.id,
          summary: `Created ${user.role} account ${user.email}`,
          metadata: { email: user.email, role: user.role },
        })
        commit()
        return publicUser(user)
      },

      async updateUser(id, patch, actor) {
        const data = await db()
        const user = assertFound(data.users.find((item) => item.id === id), 'User')
        const next = { ...user, ...patch, updated_at: new Date().toISOString() }
        if (patch.email) {
          const email = patch.email.trim().toLowerCase()
          if (data.users.some((item) => item.id !== id && item.email.toLowerCase() === email)) {
            throw new Error('A user with that email address already exists.')
          }
          next.email = email
        }
        if (patch.password) next.password_hash = await hashPassword(patch.password)
        if (next.role !== 'admin' && user.role === 'admin') {
          const admins = data.users.filter(
            (item) => item.company_id === user.company_id && item.role === 'admin' && item.status === 'active',
          )
          if (admins.length <= 1) throw new Error('You cannot remove the last active admin of this company.')
        }
        Object.assign(user, next)
        const action = patch.password ? 'user.password_reset' : 'user.updated'
        logActivity(data, {
          company_id: user.company_id,
          user_id: actor?.id || null,
          action,
          entity: 'user',
          entity_id: user.id,
          summary: patch.password
            ? `Reset password for ${user.full_name}`
            : `Updated ${user.role} account ${user.full_name}`,
          metadata: { status: user.status, role: user.role },
        })
        commit()
        return publicUser(user)
      },

      /** Hard-deletes a user when they have no linked rentals, otherwise deactivates. */
      async removeUser(id, actor) {
        const data = await db()
        const user = assertFound(data.users.find((item) => item.id === id), 'User')
        if (user.role === 'admin') {
          const admins = data.users.filter(
            (item) => item.company_id === user.company_id && item.role === 'admin' && item.status === 'active',
          )
          if (admins.length <= 1) throw new Error('You cannot remove the last active admin of this company.')
        }
        const rentals = data.rentals.filter((rental) => rental.created_by === id)
        const hardDeleted = rentals.length === 0
        if (hardDeleted) data.users = data.users.filter((item) => item.id !== id)
        else user.status = 'inactive'
        logActivity(data, {
          company_id: user.company_id,
          user_id: actor?.id || null,
          action: hardDeleted ? 'user.deleted' : 'user.deactivated',
          entity: 'user',
          entity_id: id,
          summary: hardDeleted
            ? `Deleted account ${user.full_name}`
            : `Deactivated ${user.full_name} (has ${rentals.length} rental records)`,
          metadata: { email: user.email },
        })
        commit()
        return { removed: true, hardDeleted }
      },

      /**
       * Starts a password reset by issuing a six digit code.
       *
       * Demo mode has no mail server, so the code is returned for the reset
       * screen to show — the production path returns it too, but the API
       * strips it before the browser ever sees it.
       */
      async requestPasswordReset(email) {
        const data = await db()
        const user = data.users.find(
          (item) => item.email.toLowerCase() === String(email).trim().toLowerCase(),
        )
        if (!user) {
          return { ok: true, token: null, user: null, email: String(email).trim().toLowerCase() }
        }
        data.password_resets = data.password_resets || []
        // Only the newest code works: asking again retires the previous one.
        for (const item of data.password_resets) {
          if (item.user_id === user.id && (item.purpose || 'password_reset') === 'password_reset' && !item.used_at) {
            item.used_at = new Date().toISOString()
          }
        }
        const code = randomDigits(6)
        data.password_resets.push({
          id: uid('prs_'),
          user_id: user.id,
          token: code,
          purpose: 'password_reset',
          attempts: 0,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          used_at: null,
          created_at: new Date().toISOString(),
        })
        commit()
        return { ok: true, token: code, user: publicUser(user), email: user.email }
      },

      /**
       * Finishes a reset. Supplying `email` scopes the check to that account's
       * live code so wrong guesses are counted and the code is killed after
       * five; leaving it out keeps link-shaped resets working.
       */
      async completePasswordReset({ token, password, email }) {
        const data = await db()
        const secret = String(token ?? '')
        if (String(password || '').length < 8) {
          throw new Error('Choose a password with at least 8 characters.')
        }

        const live = data.password_resets || []
        const purpose = (item) => item.purpose || 'password_reset'
        let reset = null
        if (email) {
          const owner = data.users.find(
            (item) => item.email.toLowerCase() === String(email).trim().toLowerCase(),
          )
          reset = owner
            ? live
                .filter(
                  (item) =>
                    item.user_id === owner.id &&
                    purpose(item) === 'password_reset' &&
                    !item.used_at &&
                    toDate(item.expires_at) > new Date(),
                )
                .sort((a, b) => toDate(b.created_at) - toDate(a.created_at))[0] || null
            : null
          if (reset) {
            if (reset.attempts >= 5) {
              reset.used_at = new Date().toISOString()
              commit()
              throw new Error('Too many attempts. Please request a new code.')
            }
            if (reset.token !== secret) {
              reset.attempts = (reset.attempts || 0) + 1
              if (reset.attempts >= 5) reset.used_at = new Date().toISOString()
              commit()
              throw new Error(
                reset.attempts >= 5
                  ? 'Too many attempts. Please request a new code.'
                  : 'That code is incorrect. Please try again.',
              )
            }
          }
        } else {
          reset =
            live.find(
              (item) =>
                item.token === secret &&
                purpose(item) === 'password_reset' &&
                !item.used_at &&
                toDate(item.expires_at) > new Date(),
            ) || null
        }
        if (!reset) {
          throw new Error('This reset code is invalid or has expired. Please request a new one.')
        }

        const user = assertFound(data.users.find((item) => item.id === reset.user_id), 'User')
        user.password_hash = await hashPassword(password)
        user.updated_at = new Date().toISOString()
        for (const item of live) {
          if (item.user_id === user.id && purpose(item) === 'password_reset' && !item.used_at) {
            item.used_at = user.updated_at
          }
        }
        logActivity(data, {
          company_id: user.company_id,
          user_id: user.id,
          action: 'user.password_reset',
          entity: 'user',
          entity_id: user.id,
          summary: `${user.full_name} reset their password`,
        })
        commit()
        return publicUser(user)
      },

      async changeOwnPassword({ userId, currentPassword, newPassword }) {
        const data = await db()
        const user = assertFound(data.users.find((item) => item.id === userId), 'User')
        const ok = await verifyPassword(currentPassword, user.password_hash)
        if (!ok) throw new Error('Your current password is incorrect.')
        user.password_hash = await hashPassword(newPassword)
        user.updated_at = new Date().toISOString()
        commit()
        return publicUser(user)
      },
    },

    /* ========================================================== companies */
    companies: {
      async list() {
        const data = await db()
        return clone(data.companies)
      },
      async get(id) {
        const data = await db()
        return clone(data.companies.find((item) => item.id === id) || null)
      },
      async update(id, patch, actor) {
        const data = await db()
        const company = assertFound(data.companies.find((item) => item.id === id), 'Company')
        Object.assign(company, patch, { updated_at: new Date().toISOString() })
        logActivity(data, {
          company_id: id,
          user_id: actor?.id || null,
          action: 'company.updated',
          entity: 'company',
          entity_id: id,
          summary: `Updated company settings`,
          metadata: { fields: Object.keys(patch) },
        })
        commit()
        return clone(company)
      },
    },

    /* =============================================================== users */
    users: {
      async list({ companyId, role, status, search } = {}) {
        const data = await db()
        let rows = data.users.filter((user) => user.company_id === companyId)
        if (role) rows = rows.filter((user) => user.role === role)
        if (status) rows = rows.filter((user) => user.status === status)
        if (search) {
          rows = rows.filter(
            (user) =>
              matchesSearch(user.full_name, search) ||
              matchesSearch(user.email, search) ||
              matchesSearch(user.phone, search),
          )
        }
        const counts = data.rentals
          .filter((rental) => !companyId || rental.company_id === companyId)
          .reduce((acc, rental) => {
            acc[rental.created_by] = (acc[rental.created_by] || 0) + 1
            return acc
          }, {})
        return sortBy(rows, 'full_name').map((user) => ({
          ...publicUser(user),
          rentals_captured: counts[user.id] || 0,
        }))
      },

      async get(id) {
        const data = await db()
        return publicUser(data.users.find((item) => item.id === id) || null)
      },
    },

    /* ================================================================ cars */
    cars: {
      async list({ companyId, status, category, search } = {}) {
        const data = await db()
        let rows = data.cars.filter((car) => car.company_id === companyId)
        if (status) rows = rows.filter((car) => car.status === status)
        if (category) rows = rows.filter((car) => car.category === category)
        if (search) {
          rows = rows.filter(
            (car) =>
              matchesSearch(car.registration, search) ||
              matchesSearch(car.make, search) ||
              matchesSearch(car.model, search) ||
              matchesSearch(`${car.make} ${car.model}`, search) ||
              matchesSearch(car.color, search),
          )
        }
        const activeByCar = new Map()
        data.rentals
          .filter((rental) => rental.status === 'active' || rental.status === 'overdue')
          .forEach((rental) => activeByCar.set(rental.car_id, rental))
        return sortBy(rows, 'registration').map((car) => ({
          ...publicCar(car),
          current_rental: activeByCar.has(car.id) ? hydrateRental(data, activeByCar.get(car.id)) : null,
        }))
      },

      async get(id) {
        const data = await db()
        return publicCar(data.cars.find((car) => car.id === id) || null)
      },

      async create(input, actor) {
        const data = await db()
        const registration = String(input.registration).trim().toUpperCase()
        if (
          data.cars.some(
            (car) =>
              car.company_id === input.company_id &&
              car.registration.toUpperCase() === registration,
          )
        ) {
          throw new Error(`Registration ${registration} already exists in the fleet.`)
        }
        const timestamp = new Date().toISOString()
        const car = {
          id: input.id || uid('car_'),
          company_id: input.company_id,
          make: input.make.trim(),
          model: input.model.trim(),
          year: Number(input.year),
          registration,
          color: input.color || '',
          category: input.category || 'sedan',
          daily_rate: Number(input.daily_rate) || 0,
          status: input.status || 'available',
          photo_url: input.photo_url || '',
          notes: input.notes || '',
          ownership: 'owned',
          owner_first_name: '',
          owner_last_name: '',
          company_share_percent: 100,
          license_valid_from: null,
          license_valid_to: null,
          license_renewed_at: null,
          created_at: timestamp,
          updated_at: timestamp,
        }
        applyOwnershipFields(car, input)
        applyLicenseDates(car, input)
        data.cars.push(car)
        logActivity(data, {
          company_id: input.company_id,
          user_id: actor?.id || null,
          action: 'car.created',
          entity: 'car',
          entity_id: car.id,
          summary: `Added ${car.make} ${car.model} (${car.registration}) to the fleet`,
          metadata: {
            registration: car.registration,
            ownership: car.ownership,
            owner: ownerFullName(car),
            license_valid_to: car.license_valid_to,
          },
        })
        commit()
        return publicCar(car)
      },

      async update(id, patch, actor) {
        const data = await db()
        const car = assertFound(data.cars.find((item) => item.id === id), 'Vehicle')
        const previousStatus = car.status
        Object.assign(car, patch, { updated_at: new Date().toISOString() })
        applyOwnershipFields(car, patch)
        applyLicenseDates(car, patch)
        if (patch.registration) car.registration = String(patch.registration).trim().toUpperCase()
        if (patch.daily_rate !== undefined) car.daily_rate = Number(patch.daily_rate) || 0
        const duplicate = data.cars.find(
          (item) =>
            item.id !== id &&
            item.company_id === car.company_id &&
            item.registration.toUpperCase() === car.registration.toUpperCase(),
        )
        if (duplicate) throw new Error(`Registration ${car.registration} already exists in the fleet.`)
        logActivity(data, {
          company_id: car.company_id,
          user_id: actor?.id || null,
          action: 'car.updated',
          entity: 'car',
          entity_id: car.id,
          summary:
            previousStatus !== car.status
              ? `Moved ${car.make} ${car.model} (${car.registration}) to ${car.status}`
              : `Updated ${car.make} ${car.model} (${car.registration})`,
          metadata: {
            status: car.status,
            ownership: car.ownership,
            owner: ownerFullName(car),
            license_valid_to: car.license_valid_to,
          },
        })
        commit()
        return publicCar(car)
      },

      async remove(id, actor) {
        const data = await db()
        const car = assertFound(data.cars.find((item) => item.id === id), 'Vehicle')
        const rentals = data.rentals.filter((rental) => rental.car_id === id)
        if (rentals.length > 0) {
          throw new Error(
            `This vehicle has ${rentals.length} rental record(s). Mark it inactive instead of deleting it.`,
          )
        }
        data.cars = data.cars.filter((item) => item.id !== id)
        logActivity(data, {
          company_id: car.company_id,
          user_id: actor?.id || null,
          action: 'car.deleted',
          entity: 'car',
          entity_id: id,
          summary: `Removed ${car.make} ${car.model} (${car.registration}) from the fleet`,
        })
        commit()
        return { removed: true }
      },

      async categories({ companyId }) {
        const data = await db()
        const rows = data.cars.filter((car) => car.company_id === companyId)
        return [...new Set(rows.map((car) => car.category))].sort()
      },

      /**
       * Records the licence payment and restarts the Zinara window: the new
       * term runs for 90 days from the day the subscription is confirmed.
       *
       * `onDate` is the subscriber's own calendar day (`YYYY-MM-DD`); it comes
       * from the browser so a renewal made just after midnight is dated the
       * same way in the mock and in Neon.
       */
      async renewLicense(id, onDate, actor) {
        const data = await db()
        const car = assertFound(data.cars.find((item) => item.id === id), 'Vehicle')
        const today = startOfDay(toDate(onDate) || new Date())
        car.license_valid_from = toDateInput(today)
        car.license_valid_to = toDateInput(addDays(today, LICENSE_RENEWAL_DAYS))
        car.license_renewed_at = new Date().toISOString()
        car.updated_at = car.license_renewed_at
        logActivity(data, {
          company_id: car.company_id,
          user_id: actor?.id || null,
          action: 'car.license_renewed',
          entity: 'car',
          entity_id: car.id,
          summary: `Subscribed to a new Zinara licence for ${car.registration} — valid to ${car.license_valid_to}`,
          metadata: { valid_to: car.license_valid_to, days: LICENSE_RENEWAL_DAYS },
        })
        commit()
        return publicCar(car)
      },
    },

    /* ========================================================== customers */
    customers: {
      async list({ companyId, search } = {}) {
        const data = await db()
        let rows = data.customers.filter((customer) => customer.company_id === companyId)
        if (search) {
          rows = rows.filter(
            (customer) =>
              matchesSearch(customer.full_name, search) ||
              matchesSearch(customer.phone, search) ||
              matchesSearch(customer.email, search) ||
              matchesSearch(customer.id_number, search) ||
              matchesSearch(customer.driver_license, search),
          )
        }
        const stats = new Map()
        data.rentals
          .filter((rental) => rental.company_id === companyId && rental.status !== 'cancelled')
          .forEach((rental) => {
            const entry = stats.get(rental.customer_id) || { rentals: 0, spend: 0, last_rental: null }
            entry.rentals += 1
            entry.spend += rentalTotal(rental)
            if (!entry.last_rental || toDate(rental.pickup_at) > toDate(entry.last_rental)) {
              entry.last_rental = rental.pickup_at
            }
            stats.set(rental.customer_id, entry)
          })
        return sortBy(rows, 'full_name').map((customer) => ({
          ...clone(customer),
          ...(stats.get(customer.id) || { rentals: 0, spend: 0, last_rental: null }),
        }))
      },

      async get(id) {
        const data = await db()
        return clone(data.customers.find((item) => item.id === id) || null)
      },

      async create(input, actor) {
        const data = await db()
        const timestamp = new Date().toISOString()
        const customer = {
          id: input.id || uid('cus_'),
          company_id: input.company_id,
          full_name: input.full_name.trim(),
          phone: input.phone || '',
          email: input.email || '',
          id_number: input.id_number || '',
          driver_license: input.driver_license || '',
          address: input.address || '',
          notes: input.notes || '',
          created_at: timestamp,
          updated_at: timestamp,
        }
        data.customers.push(customer)
        logActivity(data, {
          company_id: input.company_id,
          user_id: actor?.id || null,
          action: 'customer.created',
          entity: 'customer',
          entity_id: customer.id,
          summary: `Added customer ${customer.full_name}`,
        })
        commit()
        return clone(customer)
      },

      async update(id, patch, actor) {
        const data = await db()
        const customer = assertFound(data.customers.find((item) => item.id === id), 'Customer')
        Object.assign(customer, patch, { updated_at: new Date().toISOString() })
        logActivity(data, {
          company_id: customer.company_id,
          user_id: actor?.id || null,
          action: 'customer.updated',
          entity: 'customer',
          entity_id: id,
          summary: `Updated customer ${customer.full_name}`,
        })
        commit()
        return clone(customer)
      },

      async remove(id, actor) {
        const data = await db()
        const customer = assertFound(data.customers.find((item) => item.id === id), 'Customer')
        const rentals = data.rentals.filter((rental) => rental.customer_id === id)
        if (rentals.length > 0) {
          throw new Error(`This customer has ${rentals.length} rental record(s) and cannot be deleted.`)
        }
        data.customers = data.customers.filter((item) => item.id !== id)
        logActivity(data, {
          company_id: customer.company_id,
          user_id: actor?.id || null,
          action: 'customer.deleted',
          entity: 'customer',
          entity_id: id,
          summary: `Deleted customer ${customer.full_name}`,
        })
        commit()
        return { removed: true }
      },

      async history(customerId, { companyId } = {}) {
        const data = await db()
        return data.rentals
          .filter((rental) => rental.customer_id === customerId)
          .filter((rental) => !companyId || rental.company_id === companyId)
          .sort((a, b) => toDate(b.pickup_at) - toDate(a.pickup_at))
          .map((rental) => hydrateRental(data, rental))
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
        const data = await db()
        let rows = data.rentals.filter((rental) => rental.company_id === companyId)
        if (carId) rows = rows.filter((rental) => rental.car_id === carId)
        if (customerId) rows = rows.filter((rental) => rental.customer_id === customerId)
        if (createdBy) rows = rows.filter((rental) => rental.created_by === createdBy)
        if (from) {
          const start = toDate(from)
          rows = rows.filter((rental) => toDate(rental.expected_return_at) >= start)
        }
        if (to) {
          const end = toDate(to)
          rows = rows.filter((rental) => toDate(rental.pickup_at) <= end)
        }
        if (status && status !== 'all') {
          rows = rows.filter((rental) => {
            const computed = isOverdue(rental) ? 'overdue' : rental.status
            return status === 'overdue' ? computed === 'overdue' : rental.status === status
          })
        }
        if (search) {
          const carIndex = byId(data.cars)
          const customerIndex = byId(data.customers)
          rows = rows.filter((rental) => {
            const car = carIndex.get(rental.car_id)
            const customer = customerIndex.get(rental.customer_id)
            return (
              matchesSearch(rental.reference, search) ||
              matchesSearch(rental.notes, search) ||
              matchesSearch(customer?.full_name, search) ||
              matchesSearch(customer?.phone, search) ||
              matchesSearch(car?.registration, search) ||
              matchesSearch(`${car?.make ?? ''} ${car?.model ?? ''}`, search)
            )
          })
        }
        rows = sortBy(rows, 'pickup_at', 'desc')
        const limited = limit ? rows.slice(0, limit) : rows
        return limited.map((rental) => hydrateRental(data, rental))
      },

      async get(id, { companyId } = {}) {
        const data = await db()
        const rental = data.rentals.find((item) => item.id === id)
        if (!rental) return null
        if (companyId && rental.company_id !== companyId) return null
        return hydrateRental(data, rental)
      },

      async create(input, actor) {
        const data = await db()
        const car = assertFound(data.cars.find((item) => item.id === input.car_id), 'Vehicle')
        const customer = assertFound(
          data.customers.find((item) => item.id === input.customer_id),
          'Customer',
        )
        if (car.status === 'maintenance' || car.status === 'inactive') {
          throw new Error(`${car.registration} is ${car.status} and cannot be rented out.`)
        }
        if (car.status === 'rented') {
          const activeRental = data.rentals.find(
            (rental) =>
              rental.car_id === car.id &&
              (rental.status === 'active' || rental.status === 'overdue') &&
              toDate(input.pickup_at) < toDate(rental.expected_return_at) &&
              toDate(input.expected_return_at) > toDate(rental.pickup_at),
          )
          if (activeRental) {
            throw new Error(
              `${car.registration} is already on rental ${activeRental.reference} until ${activeRental.expected_return_at}.`,
            )
          }
        }
        const clash = data.rentals.find(
          (rental) =>
            rental.car_id === car.id &&
            (rental.status === 'active' || rental.status === 'overdue') &&
            toDate(input.pickup_at) < toDate(rental.expected_return_at) &&
            toDate(input.expected_return_at) > toDate(rental.pickup_at),
        )
        if (clash) {
          throw new Error(
            `${car.registration} is already on rental ${clash.reference} until ${clash.expected_return_at}.`,
          )
        }

        const days = Math.max(1, daysBetween(input.pickup_at, input.expected_return_at))
        const dailyRate = Number(input.daily_rate ?? car.daily_rate) || 0
        const timestamp = new Date().toISOString()
        const rental = {
          id: input.id || uid('rnt_'),
          company_id: car.company_id,
          car_id: car.id,
          customer_id: customer.id,
          created_by: actor?.id || input.created_by,
          reference: input.reference || nextReference(data, car.company_id),
          pickup_at: input.pickup_at,
          expected_return_at: input.expected_return_at,
          actual_return_at: null,
          daily_rate: dailyRate,
          days,
          total_amount: Number(input.total_amount ?? dailyRate * days) || 0,
          deposit_amount: Number(input.deposit_amount) || 0,
          additional_charges: Array.isArray(input.additional_charges) ? clone(input.additional_charges) : [],
          status: 'active',
          notes: input.notes || '',
          created_at: timestamp,
          updated_at: timestamp,
        }
        data.rentals.push(rental)
        car.status = 'rented'
        car.updated_at = timestamp

        if (Number(input.amount_paid) > 0) {
          data.payments.push({
            id: uid('pay_'),
            company_id: rental.company_id,
            rental_id: rental.id,
            amount: Number(input.amount_paid),
            method: input.payment_method || 'cash',
            reference: '',
            note: 'Deposit / initial payment at booking',
            received_by: actor?.id || input.created_by,
            received_at: timestamp,
          })
        }

        logActivity(data, {
          company_id: rental.company_id,
          user_id: actor?.id || null,
          action: 'rental.created',
          entity: 'rental',
          entity_id: rental.id,
          summary: `Captured rental ${rental.reference} for ${customer.full_name} (${car.make} ${car.model})`,
          metadata: { reference: rental.reference, total: rental.total_amount },
        })
        commit()
        return hydrateRental(data, rental)
      },

      async update(id, patch, actor) {
        const data = await db()
        const rental = assertFound(data.rentals.find((item) => item.id === id), 'Rental')
        const previousCarId = rental.car_id

        if (patch.pickup_at || patch.expected_return_at) {
          const pickup = patch.pickup_at ?? rental.pickup_at
          const expected = patch.expected_return_at ?? rental.expected_return_at
          rental.days = Math.max(1, daysBetween(pickup, expected))
        }
        Object.assign(rental, patch, { updated_at: new Date().toISOString() })
        if (patch.daily_rate !== undefined) rental.daily_rate = Number(patch.daily_rate) || 0
        if (patch.total_amount !== undefined) rental.total_amount = Number(patch.total_amount) || 0
        if (patch.deposit_amount !== undefined) rental.deposit_amount = Number(patch.deposit_amount) || 0
        if (patch.additional_charges !== undefined) rental.additional_charges = clone(patch.additional_charges)

        if (previousCarId !== rental.car_id) {
          const previousCar = data.cars.find((car) => car.id === previousCarId)
          if (previousCar && previousCar.status === 'rented') previousCar.status = 'available'
        }
        const car = data.cars.find((item) => item.id === rental.car_id)
        if (car) {
          car.status = rental.status === 'active' || rental.status === 'overdue' ? 'rented' : car.status === 'rented' ? 'available' : car.status
          car.updated_at = new Date().toISOString()
        }

        logActivity(data, {
          company_id: rental.company_id,
          user_id: actor?.id || null,
          action: 'rental.updated',
          entity: 'rental',
          entity_id: id,
          summary: `Updated rental ${rental.reference}`,
          metadata: { fields: Object.keys(patch) },
        })
        commit()
        return hydrateRental(data, rental)
      },

      /** Marks a car as returned, recalculates the bill and frees the vehicle. */
      async returnCar(id, { actual_return_at, additional_charges, notes }, actor) {
        const data = await db()
        const rental = assertFound(data.rentals.find((item) => item.id === id), 'Rental')
        if (rental.actual_return_at) throw new Error('This rental has already been closed.')

        const returnedAt = actual_return_at || new Date().toISOString()
        const days = Math.max(1, daysBetween(rental.pickup_at, returnedAt))
        const lateDays = Math.max(0, daysBetween(rental.expected_return_at, returnedAt) - 1)
        const charges = clone(additional_charges ?? rental.additional_charges ?? [])
        if (lateDays > 0 && !charges.some((charge) => /late/i.test(charge.label))) {
          charges.push({
            label: `Late return fee (${lateDays} day${lateDays > 1 ? 's' : ''})`,
            amount: Math.round(rental.daily_rate * 0.5 * lateDays),
          })
        }

        rental.actual_return_at = returnedAt
        rental.days = days
        rental.additional_charges = charges
        rental.total_amount = rental.daily_rate * days
        rental.status = 'completed'
        rental.notes = notes ?? rental.notes
        rental.updated_at = new Date().toISOString()

        const car = data.cars.find((item) => item.id === rental.car_id)
        if (car) {
          car.status = 'available'
          car.updated_at = new Date().toISOString()
        }

        logActivity(data, {
          company_id: rental.company_id,
          user_id: actor?.id || null,
          action: 'rental.returned',
          entity: 'rental',
          entity_id: id,
          summary: `Returned ${car ? `${car.make} ${car.model} ${car.registration}` : 'vehicle'} for rental ${rental.reference}`,
          metadata: { reference: rental.reference, days, lateDays },
        })
        commit()
        return hydrateRental(data, rental)
      },

      async cancel(id, reason, actor) {
        const data = await db()
        const rental = assertFound(data.rentals.find((item) => item.id === id), 'Rental')
        if (rental.actual_return_at) throw new Error('A completed rental cannot be cancelled.')
        rental.status = 'cancelled'
        rental.notes = reason ? `${rental.notes ? `${rental.notes}\n` : ''}Cancelled: ${reason}` : rental.notes
        rental.updated_at = new Date().toISOString()
        const car = data.cars.find((item) => item.id === rental.car_id)
        if (car && car.status === 'rented') car.status = 'available'
        logActivity(data, {
          company_id: rental.company_id,
          user_id: actor?.id || null,
          action: 'rental.cancelled',
          entity: 'rental',
          entity_id: id,
          summary: `Cancelled rental ${rental.reference}${reason ? ` — ${reason}` : ''}`,
        })
        commit()
        return hydrateRental(data, rental)
      },

      async remove(id, actor) {
        const data = await db()
        const rental = assertFound(data.rentals.find((item) => item.id === id), 'Rental')
        data.rentals = data.rentals.filter((item) => item.id !== id)
        data.payments = data.payments.filter((payment) => payment.rental_id !== id)
        logActivity(data, {
          company_id: rental.company_id,
          user_id: actor?.id || null,
          action: 'rental.deleted',
          entity: 'rental',
          entity_id: id,
          summary: `Deleted rental ${rental.reference}`,
        })
        commit()
        return { removed: true }
      },
    },

    /* =========================================================== payments */
    payments: {
      async list({ companyId, rentalId, method, from, to } = {}) {
        const data = await db()
        let rows = data.payments.filter((payment) => payment.company_id === companyId)
        if (rentalId) rows = rows.filter((payment) => payment.rental_id === rentalId)
        if (method) rows = rows.filter((payment) => payment.method === method)
        if (from) rows = rows.filter((payment) => toDate(payment.received_at) >= toDate(from))
        if (to) rows = rows.filter((payment) => toDate(payment.received_at) <= toDate(to))

        const carIndex = byId(data.cars)
        const customerIndex = byId(data.customers)
        const userIndex = byId(data.users)
        return sortBy(rows, 'received_at', 'desc').map((payment) => {
          const rental = data.rentals.find((item) => item.id === payment.rental_id)
          return {
            ...clone(payment),
            rental_reference: rental?.reference || null,
            customer_name: rental ? customerIndex.get(rental.customer_id)?.full_name : null,
            car_label: rental
              ? `${carIndex.get(rental.car_id)?.make ?? ''} ${carIndex.get(rental.car_id)?.model ?? ''}`.trim()
              : null,
            received_by_user: publicUser(userIndex.get(payment.received_by)),
          }
        })
      },

      async create({ id, companyId, rental_id, amount, method, reference, note }, actor) {
        const data = await db()
        const rental = assertFound(data.rentals.find((item) => item.id === rental_id), 'Rental')
        const value = Number(amount)
        if (!(value > 0)) throw new Error('Payment amount must be greater than zero.')

        const payment = {
          id: id || uid('pay_'),
          company_id: companyId || rental.company_id,
          rental_id,
          amount: value,
          method: method || 'cash',
          reference: reference || '',
          note: note || '',
          received_by: actor?.id || null,
          received_at: new Date().toISOString(),
        }
        data.payments.push(payment)
        logActivity(data, {
          company_id: payment.company_id,
          user_id: actor?.id || null,
          action: 'payment.recorded',
          entity: 'payment',
          entity_id: payment.id,
          summary: `Recorded ${method} payment on rental ${rental.reference}`,
          metadata: { amount: value, method: payment.method, reference: rental.reference },
        })
        commit()
        return clone(payment)
      },

      async remove(id, actor) {
        const data = await db()
        const payment = assertFound(data.payments.find((item) => item.id === id), 'Payment')
        data.payments = data.payments.filter((item) => item.id !== id)
        logActivity(data, {
          company_id: payment.company_id,
          user_id: actor?.id || null,
          action: 'payment.deleted',
          entity: 'payment',
          entity_id: id,
          summary: 'Removed a payment record',
          metadata: { amount: payment.amount },
        })
        commit()
        return { removed: true }
      },
    },

    /* =========================================================== activity */
    activity: {
      async list({ companyId, userId, action, search, limit = 200 } = {}) {
        const data = await db()
        let rows = data.activity.filter((entry) => entry.company_id === companyId)
        if (userId) rows = rows.filter((entry) => entry.user_id === userId)
        if (action && action !== 'all') rows = rows.filter((entry) => entry.action.startsWith(action))
        if (search) {
          rows = rows.filter(
            (entry) =>
              matchesSearch(entry.summary, search) || matchesSearch(entry.action, search),
          )
        }
        const userIndex = byId(data.users)
        return sortBy(rows, 'created_at', 'desc')
          .slice(0, limit)
          .map((entry) => ({ ...clone(entry), user: publicUser(userIndex.get(entry.user_id)) }))
      },
    },

    /* ============================================================ reports */
    reports: {
      async dashboard(companyId) {
        const data = await db()
        const company = data.companies.find((item) => item.id === companyId)
        const cars = data.cars.filter((car) => car.company_id === companyId)
        const rentals = data.rentals.filter((rental) => rental.company_id === companyId)
        const payments = data.payments.filter((payment) => payment.company_id === companyId)
        const users = data.users.filter((user) => user.company_id === companyId)
        const monthStart = startOfDay(addMonths(new Date(), 0))
        monthStart.setDate(1)

        const withinMonth = (value) => toDate(value) >= monthStart

        const openRentals = rentals.filter((rental) => rental.status === 'active')
        const overdueRentals = rentals.filter((rental) => isOverdue(rental))
        const dueSoon = openRentals.filter(
          (rental) =>
            toDate(rental.expected_return_at) <= addDays(new Date(), 1) && !isOverdue(rental),
        )

        // Zinara licences at or past the warning window, soonest first.
        const expiringLicenses = cars
          .map((car) => ({ car, days_left: licenseDaysLeft(car.license_valid_to) }))
          .filter((entry) => entry.days_left !== null && entry.days_left <= LICENSE_WARNING_DAYS)
          .sort((left, right) => left.days_left - right.days_left)
          .map(({ car, days_left }) => ({
            id: car.id,
            registration: car.registration,
            make: car.make,
            model: car.model,
            ownership: car.ownership || 'owned',
            owner: ownerFullName(car),
            license_valid_from: car.license_valid_from,
            license_valid_to: car.license_valid_to,
            license_renewed_at: car.license_renewed_at,
            days_left,
          }))

        return {
          currency: company?.currency || 'USD',
          counts: {
            cars_total: cars.length,
            cars_available: cars.filter((car) => car.status === 'available').length,
            cars_rented: cars.filter((car) => car.status === 'rented').length,
            cars_maintenance: cars.filter((car) => car.status === 'maintenance').length,
            cars_inactive: cars.filter((car) => car.status === 'inactive').length,
            rentals_total: rentals.length,
            rentals_active: openRentals.length,
            rentals_overdue: overdueRentals.length,
            rentals_completed: rentals.filter((rental) => rental.status === 'completed').length,
            rentals_cancelled: rentals.filter((rental) => rental.status === 'cancelled').length,
            customers_total: data.customers.filter((item) => item.company_id === companyId).length,
            members_active: users.filter((user) => user.status === 'active' && user.role === 'member').length,
          },
          money: {
            revenue_this_month: payments
              .filter((payment) => withinMonth(payment.received_at))
              .reduce((sum, payment) => sum + Number(payment.amount), 0),
            revenue_total: payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
            billed_total: rentals
              .filter((rental) => rental.status !== 'cancelled')
              .reduce((sum, rental) => sum + rentalTotal(rental), 0),
            outstanding: rentals
              .filter((rental) => rental.status !== 'cancelled')
              .reduce(
                (sum, rental) =>
                  sum + rentalBalance({ ...rental, payments: data.payments.filter((p) => p.rental_id === rental.id) }),
                0,
              ),
            deposits_held: rentals
              .filter((rental) => rental.status === 'active')
              .reduce((sum, rental) => sum + (Number(rental.deposit_amount) || 0), 0),
          },
          attention: {
            due_soon: dueSoon.map((rental) => hydrateRental(data, rental)),
            overdue: overdueRentals.map((rental) => hydrateRental(data, rental)),
            licenses: expiringLicenses,
          },
          upcoming: sortBy(openRentals.filter((rental) => !isOverdue(rental)), 'expected_return_at')
            .slice(0, 6)
            .map((rental) => hydrateRental(data, rental)),
          recent: sortBy(rentals, 'created_at', 'desc')
            .slice(0, 6)
            .map((rental) => hydrateRental(data, rental)),
          top_cars: (await this.utilization(companyId)).slice(0, 5),
          recent_activity: sortBy(data.activity.filter((entry) => entry.company_id === companyId), 'created_at', 'desc')
            .slice(0, 8)
            .map((entry) => ({ ...clone(entry), user: publicUser(data.users.find((u) => u.id === entry.user_id)) })),
        }
      },

      async revenue(companyId, { from, to } = {}) {
        const data = await db()
        const start = from ? startOfDay(toDate(from)) : startOfDay(addDays(new Date(), -29))
        const end = to ? startOfDay(toDate(to)) : startOfDay(new Date())
        const span = Math.max(0, Math.round((end - start) / 86_400_000))
        const buckets = new Map()

        for (let i = 0; i <= span; i += 1) {
          const day = addDays(start, i)
          buckets.set(day.toDateString(), { date: day.toISOString(), collected: 0, billed: 0, rentals: 0 })
        }

        data.payments
          .filter((payment) => payment.company_id === companyId)
          .forEach((payment) => {
            const key = toDate(payment.received_at)?.toDateString()
            const bucket = buckets.get(key)
            if (bucket) bucket.collected += Number(payment.amount)
          })

        data.rentals
          .filter((rental) => rental.company_id === companyId && rental.status !== 'cancelled')
          .forEach((rental) => {
            const key = toDate(rental.pickup_at)?.toDateString()
            const bucket = buckets.get(key)
            if (bucket) {
              bucket.billed += rentalTotal(rental)
              bucket.rentals += 1
            }
          })

        const series = [...buckets.values()].sort((a, b) => toDate(a.date) - toDate(b.date))
        const rentalsInRange = data.rentals.filter((rental) => {
          if (rental.company_id !== companyId || rental.status === 'cancelled') return false
          const pickup = toDate(rental.pickup_at)
          return pickup >= start && pickup <= addDays(end, 1)
        })

        const byStatus = ['active', 'completed', 'overdue', 'cancelled'].map((status) => ({
          status,
          count: rentalsInRange.filter((rental) => (isOverdue(rental) ? 'overdue' : rental.status) === status)
            .length,
        }))

        const byMethod = {}
        data.payments
          .filter((payment) => payment.company_id === companyId)
          .filter((payment) => {
            const at = toDate(payment.received_at)
            return at >= start && at <= addDays(end, 1)
          })
          .forEach((payment) => {
            byMethod[payment.method] = (byMethod[payment.method] || 0) + Number(payment.amount)
          })

        return {
          from: start.toISOString(),
          to: end.toISOString(),
          series,
          totals: {
            collected: series.reduce((sum, bucket) => sum + bucket.collected, 0),
            billed: series.reduce((sum, bucket) => sum + bucket.billed, 0),
            rentals: rentalsInRange.length,
            average_rental_value: rentalsInRange.length
              ? rentalsInRange.reduce((sum, rental) => sum + rentalTotal(rental), 0) / rentalsInRange.length
              : 0,
            outstanding: rentalsInRange.reduce(
              (sum, rental) =>
                sum +
                rentalBalance({
                  ...rental,
                  payments: data.payments.filter((payment) => payment.rental_id === rental.id),
                }),
              0,
            ),
          },
          by_status: byStatus,
          by_method: Object.entries(byMethod).map(([method, amount]) => ({ method, amount })),
        }
      },

      async utilization(companyId, { from, to } = {}) {
        const data = await db()
        const start = from ? startOfDay(toDate(from)) : startOfDay(addDays(new Date(), -89))
        const end = to ? startOfDay(toDate(to)) : startOfDay(new Date())
        const windowDays = Math.max(1, Math.round((end - start) / 86_400_000) + 1)
        const cars = data.cars.filter((car) => car.company_id === companyId)

        return cars
          .map((car) => {
            const rentals = data.rentals.filter(
              (rental) =>
                rental.car_id === car.id &&
                rental.company_id === companyId &&
                rental.status !== 'cancelled' &&
                toDate(rental.pickup_at) <= end,
            )
            const daysRented = rentals.reduce((sum, rental) => {
              const from_ = toDate(rental.pickup_at)
              const to_ = toDate(rental.actual_return_at || rental.expected_return_at)
              const days = Math.max(1, daysBetween(from_ < start ? start : from_, to_ > end ? end : to_))
              return sum + days
            }, 0)
            const revenue = rentals.reduce((sum, rental) => sum + rentalTotal(rental), 0)
            const outstanding = rentals.reduce(
              (sum, rental) =>
                sum +
                rentalBalance({
                  ...rental,
                  payments: data.payments.filter((payment) => payment.rental_id === rental.id),
                }),
              0,
            )
            return {
              id: car.id,
              registration: car.registration,
              label: `${car.make} ${car.model}`,
              category: car.category,
              status: car.status,
              daily_rate: Number(car.daily_rate),
              rentals: rentals.length,
              days_rented: daysRented,
              utilization: Math.min(100, Math.round((daysRented / windowDays) * 100)),
              revenue,
              outstanding,
            }
          })
          .sort((a, b) => b.revenue - a.revenue)
      },

      /**
       * Revenue earned per vehicle in a period, split between the company and
       * the owner of a sub-leased vehicle.
       *
       * `carId`, `owner` and `ownership` narrow which vehicles are reported on
       * — "show me Ronald's fleet" is `owner: 'Ronald Munyebvu'` — but they can
       * never widen the read past `companyId`, which is forced by the manifest.
       */
      async fleetPerformance(companyId, { from, to, carId, owner, ownership } = {}) {
        const data = await db()
        const start = from ? startOfDay(toDate(from)) : startOfDay(addDays(new Date(), -29))
        const end = to ? startOfDay(toDate(to)) : startOfDay(new Date())
        const windowDays = Math.max(1, Math.round((end - start) / 86_400_000) + 1)

        let fleet = data.cars.filter((car) => car.company_id === companyId)
        if (carId) fleet = fleet.filter((car) => car.id === carId)
        if (ownership === 'owned' || ownership === 'sub_lease') {
          fleet = fleet.filter((car) => (car.ownership || 'owned') === ownership)
        }
        if (owner) {
          const needle = String(owner).trim().toLowerCase()
          fleet = fleet.filter((car) => ownerFullName(car).toLowerCase() === needle)
        }

        return fleet
          .map((car) => {
            const rentals = data.rentals.filter(
              (rental) =>
                rental.car_id === car.id &&
                rental.company_id === companyId &&
                rental.status !== 'cancelled' &&
                toDate(rental.pickup_at) >= start &&
                toDate(rental.pickup_at) < addDays(end, 1),
            )
            const daysRented = rentals.reduce((sum, rental) => {
              const from_ = toDate(rental.pickup_at)
              const to_ = toDate(rental.actual_return_at || rental.expected_return_at)
              const days = Math.max(1, daysBetween(from_ < start ? start : from_, to_ > end ? end : to_))
              return sum + days
            }, 0)
            const revenue = rentals.reduce((sum, rental) => sum + rentalTotal(rental), 0)
            const outstanding = rentals.reduce(
              (sum, rental) =>
                sum +
                rentalBalance({
                  ...rental,
                  payments: data.payments.filter((payment) => payment.rental_id === rental.id),
                }),
              0,
            )
            const split = splitRevenue(revenue, car)
            return {
              id: car.id,
              registration: car.registration,
              label: `${car.make} ${car.model}`,
              category: car.category,
              status: car.status,
              daily_rate: Number(car.daily_rate),
              ownership: car.ownership || 'owned',
              owner: ownerFullName(car),
              company_share_percent: split.company_percent,
              owner_share_percent: split.owner_percent,
              rentals: rentals.length,
              days_rented: daysRented,
              utilization: Math.min(100, Math.round((daysRented / windowDays) * 100)),
              revenue,
              company_revenue: split.company_amount,
              owner_revenue: split.owner_amount,
              outstanding,
            }
          })
          .sort((a, b) => b.revenue - a.revenue)
      },

      async memberActivity(companyId, { from, to } = {}) {
        const data = await db()
        const start = from ? startOfDay(toDate(from)) : startOfDay(addDays(new Date(), -29))
        const end = to ? startOfDay(toDate(to)) : startOfDay(new Date())
        const users = data.users.filter((user) => user.company_id === companyId)

        return users
          .map((user) => {
            const rentals = data.rentals.filter(
              (rental) =>
                rental.created_by === user.id &&
                rental.company_id === companyId &&
                toDate(rental.pickup_at) >= start &&
                toDate(rental.pickup_at) <= addDays(end, 1),
            )
            const collected = data.payments
              .filter((payment) => payment.received_by === user.id && toDate(payment.received_at) >= start)
              .filter((payment) => toDate(payment.received_at) <= addDays(end, 1))
              .reduce((sum, payment) => sum + Number(payment.amount), 0)
            return {
              id: user.id,
              full_name: user.full_name,
              email: user.email,
              role: user.role,
              status: user.status,
              rentals_captured: rentals.length,
              active: rentals.filter((rental) => rental.status === 'active').length,
              completed: rentals.filter((rental) => rental.status === 'completed').length,
              billed: rentals.reduce((sum, rental) => sum + rentalTotal(rental), 0),
              collected,
              actions: data.activity.filter((entry) => entry.user_id === user.id).length,
            }
          })
          .sort((a, b) => b.rentals_captured - a.rentals_captured)
      },
    },
  }
}

export { buildSeed }