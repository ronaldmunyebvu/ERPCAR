import { useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRepository, useResource } from '@/hooks/useRepository'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  TableWrapper,
  Textarea,
} from '@/components/ui'
import { StatCard, PaymentMethodBadge } from '@/components/domain/Badges'
import { AreaChart } from '@/components/ui/Charts'
import {
  PAYMENT_METHODS,
  currencySymbol,
  downloadCsv,
  formatDate,
  formatDateTime,
  formatMoney,
  titleCase,
  toDateInput,
  addDays,
} from '@/lib/utils'

const CATEGORIES = [
  'Fuel',
  'Repairs',
  'Servicing',
  'Insurance',
  'Licences & fees',
  'Salaries',
  'Office & rent',
  'Advertising',
  'Other income',
  'Other',
]

/**
 * Cashbook: every money movement in one ledger.
 *
 * Rental payments (inflows from `payments`) are shown alongside manual
 * inflows and company/fleet expenses from `cashbook_entries`, so the page
 * answers "how much cash came in, how much went out, what is left" without
 * hopping between screens.
 */
export default function CashbookPage() {
  const { company } = useAuth()
  const { repository } = useRepository()
  const companyId = company?.id
  const currency = company?.currency || 'USD'

  const [from, setFrom] = useState(() => toDateInput(addDays(new Date(), -29)))
  const [to, setTo] = useState(() => toDateInput(new Date()))
  const [entryOpen, setEntryOpen] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [entry, setEntry] = useState({
    direction: 'expense',
    expense_scope: 'company',
    car_id: '',
    category: '',
    description: '',
    amount: '',
    method: 'cash',
    reference: '',
    occurred_at: toDateInput(new Date()),
  })

  const key = `${Boolean(repository)}|${companyId}|${from}|${to}`
  const payments = useResource(
    () => repository.payments.list({ companyId, from, to }),
    `cashbook.payments|${key}`,
  )
  const manual = useResource(
    () => repository.cashbook.list({ companyId, from, to }),
    `cashbook.entries|${key}`,
  )
  const cars = useResource(
    () => repository.cars.list({ companyId }),
    `cashbook.cars|${Boolean(repository)}|${companyId}`,
  )

  const rentalInflows = (payments.data || []).map((row) => ({
    id: `pay_${row.id}`,
    kind: 'rental',
    at: row.received_at,
    direction: 'inflow',
    category: 'Rental payment',
    description: row.note || '',
    amount: Number(row.amount),
    method: row.method,
    reference: row.reference || '',
    rental_reference: row.rental_reference,
    customer_name: row.customer_name,
    car_label: row.car_label,
    recorded_by: row.received_by_user,
    removable: false,
  }))

  const manualRows = (manual.data || []).map((row) => ({
    id: row.id,
    kind: 'entry',
    at: row.occurred_at,
    direction: row.direction,
    category: row.category,
    description: row.description || '',
    amount: Number(row.amount),
    method: row.method,
    reference: row.reference || '',
    expense_scope: row.expense_scope || 'company',
    car_label: row.car_label
      ? `${row.car_label}${row.car_registration ? ` (${row.car_registration})` : ''}`
      : null,
    recorded_by: row.recorded_by_user,
    removable: true,
  }))

  const rows = [...rentalInflows, ...manualRows].sort(
    (left, right) => new Date(right.at) - new Date(left.at),
  )

  const cashIn = rows
    .filter((row) => row.direction === 'inflow')
    .reduce((sum, row) => sum + row.amount, 0)
  const cashOut = rows
    .filter((row) => row.direction === 'expense')
    .reduce((sum, row) => sum + row.amount, 0)

  const byDay = {}
  for (const row of rows) {
    const day = formatDate(row.at).slice(0, 6)
    byDay[day] = byDay[day] || { label: day, inflow: 0, outflow: 0 }
    if (row.direction === 'inflow') byDay[day].inflow += row.amount
    else byDay[day].outflow += row.amount
  }
  const series = Object.values(byDay)

  const exportCsv = () =>
    downloadCsv(`cashbook-${from}-to-${to}`, [
      { label: 'Date', value: (row) => row.at },
      { label: 'Type', value: (row) => (row.direction === 'inflow' ? 'Inflow' : 'Expense') },
      { label: 'Source', value: (row) => (row.kind === 'rental' ? 'Rental payment' : row.expense_scope === 'fleet' ? 'Fleet expense' : 'Cashbook') },
      { label: 'Category', value: (row) => row.category },
      { label: 'Description', value: (row) => row.description },
      { label: 'Vehicle', value: (row) => row.car_label ?? '' },
      { label: 'Rental', value: (row) => row.rental_reference ?? '' },
      { label: 'Customer', value: (row) => row.customer_name ?? '' },
      { label: 'Method', value: (row) => row.method },
      { label: 'Reference', value: (row) => row.reference ?? '' },
      { label: 'Amount', value: (row) => row.amount },
      { label: 'Recorded by', value: (row) => row.recorded_by?.full_name ?? '' },
    ], rows)

  const submitEntry = async (event) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await repository.cashbook.create({
        direction: entry.direction,
        expense_scope: entry.expense_scope,
        car_id: entry.car_id || null,
        category: entry.category,
        description: entry.description,
        amount: Number(entry.amount),
        method: entry.method,
        reference: entry.reference,
        occurred_at: entry.occurred_at ? new Date(`${entry.occurred_at}T12:00:00`).toISOString() : undefined,
      })
      setEntryOpen(false)
      setEntry({
        direction: 'expense',
        expense_scope: 'company',
        car_id: '',
        category: '',
        description: '',
        amount: '',
        method: 'cash',
        reference: '',
        occurred_at: toDateInput(new Date()),
      })
      manual.reload()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const confirmRemove = async () => {
    if (!removing) return
    setBusy(true)
    setError(null)
    try {
      await repository.cashbook.remove(removing.id)
      setRemoving(null)
      manual.reload()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Cashbook"
        description="Rental income, manual inflows and company or fleet expenses in one ledger."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
              <Download size={15} />
              Export CSV
            </Button>
            <Button onClick={() => setEntryOpen(true)}>
              <Plus size={15} />
              Record entry
            </Button>
          </>
        }
      />

      {error && !entryOpen && !removing && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="From" className="w-40">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="To" className="w-40">
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <div className="pb-2 text-xs text-ink-500">
            {formatDate(from)} — {formatDate(to)}
          </div>
        </div>
      </Card>

      {payments.loading || manual.loading ? (
        <Spinner label="Loading cashbook…" />
      ) : payments.error || manual.error ? (
        <Alert tone="danger" title="Could not load the cashbook">
          {payments.error?.message || manual.error?.message}
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Cash in"
              value={cashIn}
              currency={currency}
              sublabel="Rentals and inflows"
              icon={ArrowDownLeft}
              tone="success"
            />
            <StatCard
              label="Cash out"
              value={cashOut}
              currency={currency}
              sublabel="Company and fleet costs"
              icon={ArrowUpRight}
              tone="danger"
            />
            <StatCard
              label="Net"
              value={cashIn - cashOut}
              currency={currency}
              sublabel="In range"
              icon={Wallet}
              tone={cashIn - cashOut >= 0 ? 'brand' : 'danger'}
            />
          </div>

          <Card className="mt-4">
            <CardHeader title="Cash movement" description="Inflow and outflow per day in this period." />
            <div className="p-5">
              {series.length ? (
                <AreaChart
                  data={series}
                  series={[
                    { key: 'inflow', label: 'In', color: 'var(--color-emerald-500)' },
                    { key: 'outflow', label: 'Out', color: 'var(--color-rose-500)' },
                  ]}
                  formatValue={(value) => currencySymbol(currency) + Math.round(value).toLocaleString('en-US')}
                  height={200}
                  currency={currency}
                />
              ) : (
                <EmptyState title="No movement in this period" />
              )}
            </div>
          </Card>

          <Card className="mt-4">
            <CardHeader title="Ledger" description="Newest first." />
            {rows.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No entries in this period"
                message="Rental payments and manual entries recorded in this range will show up here."
              />
            ) : (
              <TableWrapper>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Details</th>
                    <th>Method</th>
                    <th>Recorded by</th>
                    <th className="text-right">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap text-ink-700">{formatDateTime(row.at)}</td>
                      <td>
                        <Badge tone={row.direction === 'inflow' ? 'success' : 'danger'} size="sm">
                          {row.kind === 'rental'
                            ? 'Rental payment'
                            : row.direction === 'inflow'
                              ? 'Inflow'
                              : row.expense_scope === 'fleet'
                                ? 'Fleet expense'
                                : 'Expense'}
                        </Badge>
                      </td>
                      <td className="text-ink-700">{row.category}</td>
                      <td className="max-w-56 text-xs text-ink-500">
                        {row.description}
                        {row.car_label && <span className="block text-ink-400">{row.car_label}</span>}
                        {row.rental_reference && (
                          <span className="block font-mono text-ink-400">
                            {row.rental_reference}
                            {row.customer_name ? ` · ${row.customer_name}` : ''}
                          </span>
                        )}
                      </td>
                      <td>
                        <PaymentMethodBadge method={row.method} />
                      </td>
                      <td className="text-ink-600">{row.recorded_by?.full_name ?? '—'}</td>
                      <td
                        className={`text-right font-semibold tabular-nums ${
                          row.direction === 'inflow' ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {row.direction === 'inflow' ? '+' : '−'}
                        {formatMoney(row.amount, currency)}
                      </td>
                      <td className="text-right">
                        {row.removable && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete entry"
                            onClick={() => setRemoving(row)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-ink-50/60">
                    <td colSpan={6} className="px-4 py-2.5 text-sm font-semibold text-ink-700">
                      Net in range
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-ink-900">
                      {formatMoney(cashIn - cashOut, currency)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </TableWrapper>
            )}
          </Card>
        </>
      )}

      <Modal
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        title="Record a cashbook entry"
        description="Cash movements that are not rental payments."
      >
        <form onSubmit={submitEntry} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          <Field label="Direction" required>
            <Select
              value={entry.direction}
              onChange={(event) =>
                setEntry({ ...entry, direction: event.target.value, car_id: '', expense_scope: 'company' })
              }
            >
              <option value="expense">Expense — money out</option>
              <option value="inflow">Inflow — money in</option>
            </Select>
          </Field>

          {entry.direction === 'expense' && (
            <Field label="Scope" required>
              <Select
                value={entry.expense_scope}
                onChange={(event) => setEntry({ ...entry, expense_scope: event.target.value, car_id: '' })}
              >
                <option value="company">Company overhead</option>
                <option value="fleet">One vehicle (fleet cost)</option>
              </Select>
            </Field>
          )}

          {entry.direction === 'expense' && entry.expense_scope === 'fleet' && (
            <Field label="Vehicle" required>
              <Select
                value={entry.car_id}
                onChange={(event) => setEntry({ ...entry, car_id: event.target.value })}
                required
              >
                <option value="">Choose a vehicle…</option>
                {(cars.data || []).map((car) => (
                  <option key={car.id} value={car.id}>
                    {car.registration} — {car.make} {car.model}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Category" required>
            <Select
              value={entry.category}
              onChange={(event) => setEntry({ ...entry, category: event.target.value })}
              required
            >
              <option value="">Choose a category…</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Description">
            <Textarea
              rows={2}
              placeholder="What was this for?"
              value={entry.description}
              onChange={(event) => setEntry({ ...entry, description: event.target.value })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" required>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={entry.amount}
                onChange={(event) => setEntry({ ...entry, amount: event.target.value })}
                required
              />
            </Field>
            <Field label="Method" required>
              <Select
                value={entry.method}
                onChange={(event) => setEntry({ ...entry, method: event.target.value })}
              >
                {PAYMENT_METHODS.map((option) => (
                  <option key={option} value={option}>
                    {titleCase(option)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required>
              <Input
                type="date"
                value={entry.occurred_at}
                onChange={(event) => setEntry({ ...entry, occurred_at: event.target.value })}
                required
              />
            </Field>
            <Field label="Reference">
              <Input
                placeholder="Invoice / receipt no."
                value={entry.reference}
                onChange={(event) => setEntry({ ...entry, reference: event.target.value })}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEntryOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save entry
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title="Delete this entry?"
        description={
          removing
            ? `${removing.category} — ${formatMoney(removing.amount, currency)} will be removed from the cashbook.`
            : ''
        }
        confirmLabel="Delete"
        tone="danger"
      />
    </>
  )
}
