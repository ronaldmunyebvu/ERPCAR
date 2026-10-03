export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function uid(prefix = '') {
  return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

export function titleCase(value = '') {
  return String(value)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function initialsOf(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

/* ------------------------------------------------------------------ money */

export function currencySymbol(currency = 'USD') {
  const map = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    ZAR: 'R',
    KES: 'KSh',
    NGN: '₦',
    GHS: 'GH₵',
    ZMW: 'ZK',
    TZS: 'TSh',
    UGX: 'USh',
    BWP: 'P',
    MWK: 'MK',
    AUD: 'A$',
    CAD: 'C$',
  }
  return map[currency] || currency + ' '
}

export function formatMoney(amount, currency = 'USD') {
  const value = Number(amount)
  if (!Number.isFinite(value)) return `${currencySymbol(currency)}0.00`
  return `${currencySymbol(currency)}${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatNumber(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('en-US')
}

/* ------------------------------------------------------------------ dates */

export function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value) {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value) {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Local ISO string (no timezone suffix) suitable for `datetime-local` inputs. */
export function toDateTimeInput(value) {
  const date = toDate(value) ?? new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

export function toDateInput(value) {
  const date = toDate(value) ?? new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function startOfDay(value = new Date()) {
  const date = toDate(value)
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function addDays(value, amount) {
  const date = toDate(value) ?? new Date()
  const copy = new Date(date)
  copy.setDate(copy.getDate() + amount)
  return copy
}

export function addMonths(value, amount) {
  const date = toDate(value) ?? new Date()
  const copy = new Date(date)
  copy.setMonth(copy.getMonth() + amount)
  return copy
}

/** Whole days from `from` to `to`, rounded up for partial days. */
export function daysBetween(from, to) {
  const start = toDate(from)
  const end = toDate(to)
  if (!start || !end) return 0
  const diff = end.getTime() - start.getTime()
  return Math.max(0, Math.ceil(diff / 86_400_000))
}

export function relativeTime(value) {
  const date = toDate(value)
  if (!date) return '—'
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  const steps = [
    [60, 'second', 1],
    [3600, 'minute', 60],
    [86400, 'hour', 3600],
    [604800, 'day', 86400],
    [2629800, 'week', 604800],
    [31557600, 'month', 2629800],
    [Infinity, 'year', 31557600],
  ]
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [limit, unit, divisor] of steps) {
    if (Math.abs(seconds) < limit) return formatter.format(-Math.round(seconds / divisor), unit)
  }
  return formatDate(date)
}

/* ------------------------------------------------------- domain helpers */

export const RENTAL_STATUSES = ['active', 'completed', 'overdue', 'cancelled']
export const CAR_STATUSES = ['available', 'rented', 'maintenance', 'inactive']
export const USER_ROLES = ['admin', 'member']
export const USER_STATUSES = ['active', 'inactive']
export const PAYMENT_METHODS = [
  'cash',
  'card',
  'ecocash',
  'paynow',
  'bank_transfer',
  'mobile_money',
  'stripe',
]

/** A rental is overdue when it has not come back and the expected return has passed. */
export function isOverdue(rental, now = new Date()) {
  if (!rental || rental.status === 'completed' || rental.status === 'cancelled') return false
  if (rental.actual_return_at) return false
  const due = toDate(rental.expected_return_at)
  return Boolean(due && due.getTime() < now.getTime())
}

export function effectiveStatus(rental, now = new Date()) {
  return isOverdue(rental, now) ? 'overdue' : rental.status
}

export function rentalDays(rental) {
  const end = rental.actual_return_at || rental.expected_return_at
  return Math.max(1, daysBetween(rental.pickup_at, end))
}

/** Total bill = rental fee + extras + late/damage fees, minus nothing (payments tracked separately). */
export function rentalTotal(rental) {
  const charges = (rental.additional_charges || []).reduce(
    (sum, charge) => sum + (Number(charge.amount) || 0),
    0,
  )
  return (Number(rental.total_amount) || 0) + charges
}

export function rentalBalance(rental) {
  const paid = (rental.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  return Math.max(0, rentalTotal(rental) - paid)
}

export function matchesSearch(haystack, term) {
  if (!term) return true
  return String(haystack ?? '')
    .toLowerCase()
    .includes(term.trim().toLowerCase())
}

/* ---------------------------------------------------------------- exports */

function escapeCell(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function downloadCsv(filename, columns, rows) {
  const header = columns.map((column) => escapeCell(column.label)).join(',')
  const body = rows
    .map((row) => columns.map((column) => escapeCell(column.value(row))).join(','))
    .join('\r\n')
  const blob = new Blob(['\uFEFF', header, '\r\n', body], {
    type: 'text/csv;charset=utf-8;',
  })
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  triggerDownload(blob, filename.endsWith('.json') ? filename : `${filename}.json`)
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function debounce(fn, wait = 250) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}