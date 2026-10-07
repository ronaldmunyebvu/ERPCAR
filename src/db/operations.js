/**
 * The operation manifest: the single source of truth for which repository
 * operations may cross the network, and how each one is constrained.
 *
 * This module is imported by BOTH sides of the wire, which is the point:
 *
 *   - The browser builds its proxy object straight from these keys, so a method
 *     can never be called client-side without also being declared here.
 *   - The API dispatcher iterates the same keys, so an operation the client can
 *     reach is by construction an operation the server has authorised.
 *
 * It must stay free of Node imports and of any secret, because it ships to the
 * browser. Enforcement logic lives in `api/_lib/scope.js`.
 *
 * Entry fields
 * -------------
 * auth      'public' | 'member' | 'admin' - minimum role. 'public' still
 *           requires no session, and must be safe for anonymous callers.
 * force     Tenant rewrite applied to the arguments before the query runs.
 *           `from` names the session field to take the value from, so a client
 *           can never nominate its own company or user. `key: null` replaces
 *           the whole argument (used when the argument *is* the companyId).
 * own       Table whose row at `args[0].id` must belong to the session company.
 *           Guards the methods that look a row up by bare primary key, which
 *           would otherwise be a cross-tenant read/write if an id were guessed.
 * owner     Like `own`, but the table row at `args[n].id` for a nested payload.
 * actor     Index of the trailing `actor` argument, replaced with the real
 *           signed-in user so activity logs cannot be forged.
 * guard     Name of an extra precondition checked in `api/_lib/scope.js`.
 * replace   Fully substitute the call (used for methods that are unsafe as
 *           written and are re-implemented against the session company).
 */

/** `from` values resolve against the verified session. */
export const FROM = {
  COMPANY: 'companyId',
  USER: 'userId',
}

/** `owner` entries: [argument index, id field on that argument]. */
function ownsArg(index, key = 'id') {
  return { arg: index, key }
}

export const OPERATIONS = {
  /* ------------------------------------------------------------- top level */
  'bootstrap': { auth: 'public' },
  'offline.snapshot': { auth: 'member', force: [{ index: 0, key: null, from: FROM.COMPANY }] },

  /* ------------------------------------------------------------------ auth */
  'auth.isSetupComplete': { auth: 'public' },
  // Bootstrapping a tenant is anonymous by nature, so it is gated on the
  // database being empty rather than on a session. Without this check the
  // public endpoint would let anyone create a second company.
  'auth.createCompanyWithOwner': { auth: 'public', guard: 'noCompaniesExist' },
  'auth.signIn': { auth: 'public' },
  'auth.requestPasswordReset': { auth: 'public', guard: 'resetTokenPolicy' },
  'auth.completePasswordReset': { auth: 'public' },
  'auth.findUserById': { auth: 'member', force: [{ index: 0, key: null, from: FROM.USER }] },
  'auth.changeOwnPassword': {
    auth: 'member',
    force: [{ index: 0, key: 'userId', from: FROM.USER }],
  },
  'auth.createUser': {
    auth: 'admin',
    force: [{ index: 0, key: 'company_id', from: FROM.COMPANY }],
    actor: 1,
  },
  'auth.updateUser': { auth: 'admin', own: 'users', actor: 2 },
  'auth.removeUser': { auth: 'admin', own: 'users', actor: 1 },

  /* ------------------------------------------------------------- companies */
  // `companies.list()` selects every row in the table. As a multi-tenant app
  // that must never run, so it is re-pointed at the session's own company. The
  // `force` is stated explicitly as well as inherited from the target, so the
  // entry still audits as scoped on its own.
  'companies.list': {
    auth: 'member',
    replace: 'companies.get',
    force: [{ index: 0, key: null, from: FROM.COMPANY }],
  },
  'companies.get': { auth: 'member', force: [{ index: 0, key: null, from: FROM.COMPANY }] },
  'companies.update': {
    auth: 'member',
    force: [{ index: 0, key: null, from: FROM.COMPANY }],
    actor: 2,
  },

  /* ----------------------------------------------------------------- users */
  'users.list': { auth: 'member', force: [{ index: 0, key: 'companyId', from: FROM.COMPANY }] },
  'users.get': { auth: 'member', force: [{ index: 0, key: null, from: FROM.USER }] },

  /* ------------------------------------------------------------------ cars */
  'cars.list': { auth: 'member', force: [{ index: 0, key: 'companyId', from: FROM.COMPANY }] },
  'cars.categories': { auth: 'member', force: [{ index: 0, key: 'companyId', from: FROM.COMPANY }] },
  'cars.get': { auth: 'member', own: 'cars' },
  'cars.create': {
    auth: 'member',
    force: [{ index: 0, key: 'company_id', from: FROM.COMPANY }],
    actor: 1,
  },
  'cars.update': { auth: 'member', own: 'cars', actor: 2 },
  'cars.remove': { auth: 'member', own: 'cars', actor: 1 },
  // Restarting the Zinara licence window is a write against one known vehicle,
  // so ownership of that row and the acting user are both pinned.
  'cars.renewLicense': { auth: 'member', own: 'cars', actor: 2 },

  /* ------------------------------------------------------------- customers */
  'customers.list': { auth: 'member', force: [{ index: 0, key: 'companyId', from: FROM.COMPANY }] },
  'customers.get': { auth: 'member', own: 'customers' },
  'customers.create': {
    auth: 'member',
    force: [{ index: 0, key: 'company_id', from: FROM.COMPANY }],
    actor: 1,
  },
  'customers.update': { auth: 'member', own: 'customers', actor: 2 },
  'customers.remove': { auth: 'member', own: 'customers', actor: 1 },
  'customers.history': {
    auth: 'member',
    own: 'customers',
    force: [{ index: 1, key: 'companyId', from: FROM.COMPANY }],
  },

  /* --------------------------------------------------------------- rentals */
  'rentals.list': { auth: 'member', force: [{ index: 0, key: 'companyId', from: FROM.COMPANY }] },
  'rentals.get': {
    auth: 'member',
    own: 'rentals',
    force: [{ index: 1, key: 'companyId', from: FROM.COMPANY }],
  },
  // A rental pulls in a car, a customer and a member, none of which the client
  // is allowed to nominate, so all three are checked against the tenant first.
  'rentals.create': {
    auth: 'member',
    force: [{ index: 0, key: 'company_id', from: FROM.COMPANY }],
    owner: [ownsArg(0, 'car_id'), ownsArg(0, 'customer_id')],
    actor: 1,
  },
  'rentals.update': {
    auth: 'member',
    own: 'rentals',
    owner: [ownsArg(1, 'car_id'), ownsArg(1, 'customer_id')],
    actor: 2,
  },
  'rentals.returnCar': { auth: 'member', own: 'rentals', actor: 2 },
  'rentals.cancel': { auth: 'member', own: 'rentals', actor: 2 },
  'rentals.remove': { auth: 'member', own: 'rentals', actor: 1 },

  /* -------------------------------------------------------------- payments */
  'payments.list': { auth: 'member', force: [{ index: 0, key: 'companyId', from: FROM.COMPANY }] },
  'payments.create': {
    auth: 'member',
    force: [{ index: 0, key: 'companyId', from: FROM.COMPANY }],
    owner: [ownsArg(0, 'rental_id')],
    actor: 1,
  },
  'payments.remove': { auth: 'member', own: 'payments', actor: 1 },

  /* -------------------------------------------------------------- activity */
  'activity.list': { auth: 'member', force: [{ index: 0, key: 'companyId', from: FROM.COMPANY }] },

  /* --------------------------------------------------------------- reports */
  'reports.dashboard': { auth: 'member', force: [{ index: 0, key: null, from: FROM.COMPANY }] },
  'reports.revenue': { auth: 'member', force: [{ index: 0, key: null, from: FROM.COMPANY }] },
  'reports.utilization': { auth: 'member', force: [{ index: 0, key: null, from: FROM.COMPANY }] },
  // Per-vehicle revenue split between the company and a sub-lease owner. The
  // optional car/owner/ownership filters are filters only: the tenant itself is
  // still forced from the session, so they cannot widen the read.
  'reports.fleetPerformance': {
    auth: 'member',
    force: [{ index: 0, key: null, from: FROM.COMPANY }],
  },
  // Exposes per-member billing and collection totals, so it is admin-only even
  // though the page is not currently gated in the router.
  'reports.memberActivity': { auth: 'admin', force: [{ index: 0, key: null, from: FROM.COMPANY }] },
}

/** `cars` -> `cars`, used to walk the repository object by group name. */
export function groupOf(operation) {
  const dot = operation.indexOf('.')
  return dot === -1 ? '' : operation.slice(0, dot)
}

/** `cars.list` -> `list`, used to pick the method within a group. */
export function methodOf(operation) {
  const dot = operation.indexOf('.')
  return dot === -1 ? operation : operation.slice(dot + 1)
}

export const OPERATION_KEYS = Object.freeze(Object.keys(OPERATIONS))