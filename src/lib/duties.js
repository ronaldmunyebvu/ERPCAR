/**
 * Duty definitions — which sections of the app a staff member may use.
 *
 * Pure data plus two helpers, imported by the repositories (server and mock)
 * and by the UI. No framework imports, so it loads unchanged in Node.
 *
 * Access rules:
 *   - admins always have every duty, regardless of the stored array;
 *   - a member with an empty (or unknown-only) duties array has full access,
 *     so no pre-existing account is ever locked out by the migration;
 *   - otherwise the stored keys are the only sections reachable.
 */

export const DUTIES = [
  { key: 'rentals', label: 'Rentals', description: 'Capture and manage rental bookings.' },
  { key: 'fleet', label: 'Fleet', description: 'Add, edit and manage vehicles.' },
  { key: 'customers', label: 'Customers', description: 'Manage customer records.' },
  { key: 'cashbook', label: 'Cashbook', description: 'Record inflows and expenses.' },
  { key: 'maintenance', label: 'Maintenance', description: 'Move vehicles in and out of service.' },
  { key: 'reports', label: 'Reports', description: 'View dashboards and performance reports.' },
]

export const DUTY_KEYS = Object.freeze(DUTIES.map((duty) => duty.key))

/** Strips unknown keys; admins are stored unrestricted. */
export function normaliseDuties(value, role) {
  if (role === 'admin') return []
  if (!Array.isArray(value)) return []
  const known = [...new Set(value.filter((key) => DUTY_KEYS.includes(key)))]
  return known
}

/** The duties a user effectively has, applying the empty/full-access rule. */
export function effectiveDuties(user) {
  if (!user) return []
  if (user.role === 'admin') return [...DUTY_KEYS]
  const raw = Array.isArray(user.duties) ? user.duties : []
  const known = raw.filter((key) => DUTY_KEYS.includes(key))
  return known.length ? DUTY_KEYS.filter((key) => known.includes(key)) : [...DUTY_KEYS]
}

export function hasDuty(user, key) {
  return effectiveDuties(user).includes(key)
}
