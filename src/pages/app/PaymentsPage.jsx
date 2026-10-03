import { useState } from 'react'
import { Calendar, Download, Receipt, TrendingUp, Wallet } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRepository, useResource } from '@/hooks/useRepository'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  TableWrapper,
} from '@/components/ui'
import { StatCard } from '@/components/domain/Badges'
import { PaymentMethodBadge } from '@/components/domain/Badges'
import { AreaChart, BarList } from '@/components/ui/Charts'
import {
  PAYMENT_METHODS,
  currencySymbol,
  downloadCsv,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  titleCase,
  toDateInput,
  addDays,
} from '@/lib/utils'

const METHOD_COLORS = {
  cash: 'var(--color-emerald-500)',
  card: 'var(--color-brand-500)',
  ecocash: 'var(--color-amber-500)',
  paynow: 'var(--color-purple-500)',
  bank_transfer: 'var(--color-sky-500)',
  mobile_money: 'var(--color-teal-500)',
  stripe: 'var(--color-indigo-500)',
}

export default function PaymentsPage() {
  const { company } = useAuth()
  const { repository } = useRepository()
  const companyId = company?.id
  const currency = company?.currency || 'USD'

  const [from, setFrom] = useState(() => toDateInput(addDays(new Date(), -29)))
  const [to, setTo] = useState(() => toDateInput(new Date()))
  const [method, setMethod] = useState('')

  const key = `${Boolean(repository)}|${companyId}|${from}|${to}|${method}`
  const list = useResource(
    () => repository.payments.list({ companyId, from, to, method: method || undefined }),
    `payments|${key}`,
  )

  const rows = list.data || []
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0)
  const today = new Date().toDateString()
  const todayTotal = rows
    .filter((row) => new Date(row.received_at).toDateString() === today)
    .reduce((sum, row) => sum + Number(row.amount), 0)

  const byDay = {}
  for (const row of rows) {
    const day = formatDate(row.received_at).slice(0, 6)
    byDay[day] = (byDay[day] || 0) + Number(row.amount)
  }
  const series = Object.entries(byDay).map(([label, value]) => ({ label, value }))

  const byMethod = PAYMENT_METHODS.map((option) => ({
    label: titleCase(option),
    value: rows
      .filter((row) => row.method === option)
      .reduce((sum, row) => sum + Number(row.amount), 0),
    color: METHOD_COLORS[option],
  })).filter((entry) => entry.value > 0)

  const exportCsv = () =>
    downloadCsv(`payments-${from}-to-${to}`, [
      { label: 'Received', value: (row) => row.received_at },
      { label: 'Reference', value: (row) => row.reference ?? '' },
      { label: 'Rental', value: (row) => row.rental_reference ?? '' },
      { label: 'Customer', value: (row) => row.customer_name ?? '' },
      { label: 'Vehicle', value: (row) => row.car_label ?? '' },
      { label: 'Method', value: (row) => row.method },
      { label: 'Amount', value: (row) => Number(row.amount) },
      { label: 'Recorded by', value: (row) => row.received_by_user?.full_name ?? '' },
      { label: 'Note', value: (row) => row.note ?? '' },
    ], rows)

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every payment received, with the rental it settles."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={15} />
            Export CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="From" className="w-40">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="To" className="w-40">
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Field label="Method" className="w-48">
            <Select value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="">All methods</option>
              {PAYMENT_METHODS.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="pb-2 text-xs text-ink-500">
            {formatDate(from)} — {formatDate(to)}
          </div>
        </div>
      </Card>

      {list.loading ? (
        <Spinner label="Loading payments…" />
      ) : list.error ? (
        <Alert tone="danger" title="Could not load payments">
          {list.error.message}
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Received in range"
              value={total}
              currency={currency}
              sublabel={`${rows.length} payments`}
              icon={Wallet}
              tone="success"
            />
            <StatCard
              label="Received today"
              value={todayTotal}
              currency={currency}
              sublabel={formatDate(new Date())}
              icon={Calendar}
              tone="brand"
            />
            <StatCard
              label="Average payment"
              value={rows.length ? total / rows.length : 0}
              currency={currency}
              sublabel="Per transaction"
              icon={TrendingUp}
              tone="purple"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Cash in" description="Payments received per day in this period." />
              <div className="p-5">
                {series.length ? (
                  <AreaChart
                    data={series}
                    series={[{ key: 'value', label: 'Received', color: 'var(--color-emerald-500)' }]}
                    formatValue={(value) => currencySymbol(currency) + Math.round(value).toLocaleString('en-US')}
                    height={200}
                    currency={currency}
                  />
                ) : (
                  <EmptyState title="No payments in this period" />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="By method" icon={Receipt} />
              <div className="p-5">
                {byMethod.length ? (
                  <BarList
                    items={byMethod}
                    formatValue={(value) => `${currencySymbol(currency)}${formatNumber(value)}`}
                  />
                ) : (
                  <EmptyState title="Nothing to show yet" />
                )}
              </div>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader
              title="Payment history"
              description="Newest first."
            />
            {rows.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No payments recorded"
                message="Payments captured against a rental will show up here."
              />
            ) : (
              <TableWrapper>
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Rental</th>
                    <th>Customer</th>
                    <th>Method</th>
                    <th>Recorded by</th>
                    <th>Reference</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap">
                        <span className="block text-ink-700">{formatDateTime(row.received_at)}</span>
                        {row.note && (
                          <span className="block text-xs text-ink-400">{row.note}</span>
                        )}
                      </td>
                      <td className="font-mono text-xs">{row.rental_reference ?? '—'}</td>
                      <td className="text-ink-600">
                        {row.customer_name ?? '—'}
                        {row.car_label && (
                          <span className="block text-xs text-ink-400">{row.car_label}</span>
                        )}
                      </td>
                      <td>
                        <PaymentMethodBadge method={row.method} />
                      </td>
                      <td className="text-ink-600">{row.received_by_user?.full_name ?? '—'}</td>
                      <td className="font-mono text-xs text-ink-500">{row.reference ?? '—'}</td>
                      <td className="text-right font-semibold tabular-nums text-emerald-700">
                        {formatMoney(row.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-ink-50/60">
                    <td colSpan={6} className="px-4 py-2.5 text-sm font-semibold text-ink-700">
                      Total
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-ink-900">
                      {formatMoney(total, currency)}
                    </td>
                  </tr>
                </tfoot>
              </TableWrapper>
            )}
          </Card>
        </>
      )}
    </>
  )
}