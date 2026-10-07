import { useMemo, useState } from 'react'
import { BarChart3, Car, Download, FileText, Printer, TrendingUp, Users } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRepository, useResource } from '@/hooks/useRepository'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Select,
  Spinner,
  TableWrapper,
  Tabs,
} from '@/components/ui'
import { AreaChart, BarChart, BarList, DonutChart } from '@/components/ui/Charts'
import { StatCard } from '@/components/domain/Badges'
import {
  formatMoney,
  formatDate,
  formatNumber,
  currencySymbol,
  titleCase,
  downloadCsv,
  toDateInput,
  addDays,
  licenseState,
  ownerFullName,
  ownershipLabel,
} from '@/lib/utils'

const PRESETS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '12 months' },
]

const PAYMENT_COLORS = {
  cash: 'var(--color-emerald-500)',
  card: 'var(--color-brand-500)',
  ecocash: 'var(--color-amber-500)',
  paynow: 'var(--color-purple-500)',
  bank_transfer: 'var(--color-sky-500)',
  mobile_money: 'var(--color-teal-500)',
  stripe: 'var(--color-indigo-500)',
}

const STATUS_COLORS = {
  active: 'var(--color-brand-500)',
  completed: 'var(--color-emerald-500)',
  overdue: 'var(--color-red-500)',
  cancelled: 'var(--color-ink-300)',
}

export default function ReportsPage() {
  const { company } = useAuth()
  const { repository } = useRepository()
  const companyId = company?.id
  const currency = company?.currency || 'USD'

  const [preset, setPreset] = useState('30')
  const [from, setFrom] = useState(() => toDateInput(addDays(new Date(), -29)))
  const [to, setTo] = useState(() => toDateInput(new Date()))
  const [tab, setTab] = useState('revenue')
  const [scope, setScope] = useState('all')

  const range = { from, to }
  const key = `${Boolean(repository)}|${companyId}|${from}|${to}`

  const revenue = useResource(
    () => repository.reports.revenue(companyId, range),
    `rev|${key}`,
  )
  const utilization = useResource(
    () => repository.reports.utilization(companyId, range),
    `util|${key}`,
  )
  const members = useResource(
    () => repository.reports.memberActivity(companyId, range),
    `members|${key}`,
  )
  const fleetCars = useResource(
    () => repository.cars.list({ companyId }),
    `carsAll|${Boolean(repository)}|${companyId}`,
  )

  // One control drives the scope of the performance report: the whole fleet,
  // one ownership class, one owner's vehicles, or a single vehicle.
  const scopeFilter = useMemo(() => {
    if (scope.startsWith('owner:')) return { owner: scope.slice('owner:'.length) }
    if (scope.startsWith('car:')) return { carId: scope.slice('car:'.length) }
    if (scope === 'owned' || scope === 'sub_lease') return { ownership: scope }
    return {}
  }, [scope])

  const fleet = useResource(
    () => repository.reports.fleetPerformance(companyId, { ...range, ...scopeFilter }),
    `fleet|${key}|${scope}`,
  )

  const owners = useMemo(
    () =>
      [
        ...new Set(
          (fleetCars.data || [])
            .filter((car) => car.ownership === 'sub_lease')
            .map(ownerFullName)
            .filter(Boolean),
        ),
      ].sort(),
    [fleetCars.data],
  )

  const money = (value) => formatMoney(value, currency)

  const applyPreset = (days) => {
    setPreset(days)
    setFrom(toDateInput(addDays(new Date(), -(Number(days) - 1))))
    setTo(toDateInput(new Date()))
  }

  const customRange = () => {
    setPreset('custom')
  }

  const utilisationBars = (utilization.data || []).slice(0, 14).map((car) => ({
    label: car.registration,
    value: car.utilization,
  }))

  return (
    <>
      <PageHeader
        title="Reports & analytics"
        description="Revenue, fleet utilisation and staff performance for any period."
        actions={
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={15} />
            Print report
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <span className="field-label">Quick range</span>
            <SegmentedControl
              value={preset}
              onChange={applyPreset}
              options={PRESETS.map((option) => ({
                ...option,
                label: option.label,
              }))}
            />
          </div>
          <Field label="From" className="w-40">
            <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); customRange() }} />
          </Field>
          <Field label="To" className="w-40">
            <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); customRange() }} />
          </Field>
          <div className="pb-1 text-xs text-ink-500">
            {formatDate(from)} â€” {formatDate(to)}
          </div>
        </div>
      </Card>

      {revenue.loading ? (
        <Spinner label="Crunching numbersâ€¦" />
      ) : revenue.error ? (
        <Alert tone="danger" title="Could not load reports">
          {revenue.error.message}
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Cash collected"
              value={revenue.data.totals.collected}
              currency={currency}
              sublabel={`${revenue.data.totals.rentals} rentals in period`}
              icon={TrendingUp}
              tone="success"
            />
            <StatCard
              label="Amount billed"
              value={revenue.data.totals.billed}
              currency={currency}
              sublabel={`Avg ${money(revenue.data.totals.average_rental_value)} per rental`}
              icon={BarChart3}
              tone="brand"
            />
            <StatCard
              label="Outstanding"
              value={revenue.data.totals.outstanding}
              currency={currency}
              sublabel="Still owed by customers"
              icon={FileText}
              tone={revenue.data.totals.outstanding > 0 ? 'danger' : 'success'}
            />
            <StatCard
              label="Collected vs billed"
              value={`${
                revenue.data.totals.billed > 0
                  ? Math.round((revenue.data.totals.collected / revenue.data.totals.billed) * 100)
                  : 0
              }%`}
              sublabel="Collection rate for this period"
              icon={Users}
              tone="purple"
            />
          </div>

          <Card className="mt-4">
            <Tabs
              className="px-2"
              tabs={[
                { value: 'revenue', label: 'Revenue', icon: TrendingUp },
                { value: 'utilisation', label: 'Car utilisation', icon: Car },
                { value: 'fleet', label: 'Fleet performance', icon: BarChart3 },
                { value: 'licenses', label: 'Licences', icon: FileText },
                { value: 'staff', label: 'Staff activity', icon: Users },
                { value: 'status', label: 'By status', icon: FileText },
              ]}
              value={tab}
              onChange={setTab}
            />

            <div className="p-5">
              {tab === 'revenue' && (
                <>
                  <AreaChart
                    data={revenue.data.series}
                    series={[
                      { key: 'collected', label: 'Collected', color: 'var(--color-brand-500)' },
                      { key: 'billed', label: 'Billed', color: 'var(--color-ink-300)' },
                    ]}
                    formatValue={(value) => currencySymbol(currency) + Math.round(value).toLocaleString('en-US')}
                    formatLabel={(value) => formatDate(value).slice(0, 6)}
                    currency={currency}
                    height={230}
                  />

                  <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-ink-800">
                        Collection by payment method
                      </h3>
                      {revenue.data.by_method.length ? (
                        <BarList
                          items={revenue.data.by_method.map((row) => ({
                            label: titleCase(row.method),
                            value: row.amount,
                            color: PAYMENT_COLORS[row.method] ?? 'var(--color-brand-500)',
                          }))}
                          formatValue={(value) => `${currencySymbol(currency)}${formatNumber(value)}`}
                        />
                      ) : (
                        <EmptyState title="No payments in this period" />
                      )}
                    </div>
                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-ink-800">
                        Rentals started per day
                      </h3>
                      <BarChart
                        data={revenue.data.series.map((row) => ({ label: formatDate(row.date).slice(3, 6), value: row.rentals }))}
                        valueKey="value"
                        labelKey="label"
                        height={190}
                      />
                    </div>
                  </div>
                </>
              )}

              {tab === 'utilisation' && (
                <UtilisationTab
                  loading={utilization.loading}
                  rows={utilization.data || []}
                  currency={currency}
                  bars={utilisationBars}
                />
              )}

              {tab === 'fleet' && (
                <FleetPerformanceTab
                  loading={fleet.loading}
                  rows={fleet.data || []}
                  currency={currency}
                  scope={scope}
                  onScopeChange={setScope}
                  owners={owners}
                  cars={fleetCars.data || []}
                />
              )}

              {tab === 'licenses' && (
                <LicencesTab
                  loading={fleetCars.loading}
                  rows={fleetCars.data || []}
                  currency={currency}
                />
              )}

              {tab === 'staff' && (
                <StaffTab
                  loading={members.loading}
                  rows={members.data || []}
                  currency={currency}
                />
              )}

              {tab === 'status' && (
                <div className="max-w-md">
                  <DonutChart
                    data={revenue.data.by_status.map((row) => ({
                      label: titleCase(row.status),
                      value: row.count,
                      color: STATUS_COLORS[row.status],
                    }))}
                    centerValue={revenue.data.totals.rentals}
                    centerLabel="rentals"
                  />
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  )
}

function UtilisationTab({ loading, rows, currency, bars }) {
  if (loading) return <Spinner />
  if (rows.length === 0) return <EmptyState icon={Car} title="No fleet data" />

  const exportCsv = () =>
    downloadCsv(`utilisation-${toDateInput(new Date())}`, [
      { label: 'Registration', value: (row) => row.registration },
      { label: 'Vehicle', value: (row) => row.label },
      { label: 'Category', value: (row) => row.category },
      { label: 'Status', value: (row) => row.status },
      { label: 'Rentals', value: (row) => row.rentals },
      { label: 'Days rented', value: (row) => row.days_rented },
      { label: 'Utilisation %', value: (row) => row.utilization },
      { label: 'Revenue', value: (row) => row.revenue },
      { label: 'Outstanding', value: (row) => row.outstanding },
    ], rows)

  return (
    <div>
      <div className="mb-6">
        <h3 className="mb-1 text-sm font-semibold text-ink-800">Utilisation rate</h3>
        <p className="mb-4 text-xs text-ink-500">
          Share of the selected period each vehicle was out on rent.
        </p>
        <BarChart data={bars} valueKey="value" labelKey="label" height={210} formatValue={(v) => `${v}%`} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-800">Fleet performance</h3>
        <Button variant="secondary" size="sm" onClick={exportCsv}>
          <Download size={14} />
          Export CSV
        </Button>
      </div>
      <TableWrapper>
        <thead>
          <tr>
            <th>Vehicle</th>
            <th>Registration</th>
            <th className="text-right">Rentals</th>
            <th className="text-right">Days rented</th>
            <th className="text-right">Utilisation</th>
            <th className="text-right">Revenue</th>
            <th className="text-right">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <span className="font-medium text-ink-800">{row.label}</span>
                <span className="block text-xs text-ink-400">{titleCase(row.category)}</span>
              </td>
              <td className="font-mono text-xs">{row.registration}</td>
              <td className="text-right tabular-nums">{row.rentals}</td>
              <td className="text-right tabular-nums">{row.days_rented}</td>
              <td className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={`h-full rounded-full ${
                        row.utilization >= 60
                          ? 'bg-emerald-500'
                          : row.utilization >= 30
                            ? 'bg-brand-500'
                            : 'bg-amber-500'
                      }`}
                      style={{ width: `${row.utilization}%` }}
                    />
                  </div>
                  <span className="w-9 text-right tabular-nums">{row.utilization}%</span>
                </div>
              </td>
              <td className="text-right font-medium tabular-nums">
                {formatMoney(row.revenue, currency)}
              </td>
              <td className="text-right tabular-nums">
                {row.outstanding > 0 ? (
                  <span className="font-medium text-red-600">
                    {formatMoney(row.outstanding, currency)}
                  </span>
                ) : (
                  <span className="text-ink-300">â€”</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  )
}

function StaffTab({ loading, rows, currency }) {
  if (loading) return <Spinner />

  const exportCsv = () =>
    downloadCsv(`staff-activity-${toDateInput(new Date())}`, [
      { label: 'Name', value: (row) => row.full_name },
      { label: 'Email', value: (row) => row.email },
      { label: 'Role', value: (row) => row.role },
      { label: 'Status', value: (row) => row.status },
      { label: 'Rentals captured', value: (row) => row.rentals_captured },
      { label: 'Active', value: (row) => row.active },
      { label: 'Completed', value: (row) => row.completed },
      { label: 'Billed', value: (row) => row.billed },
      { label: 'Collected', value: (row) => row.collected },
    ], rows)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-ink-500">
          Who captured what in the selected period.
        </p>
        <Button variant="secondary" size="sm" onClick={exportCsv}>
          <Download size={14} />
          Export CSV
        </Button>
      </div>
      <TableWrapper>
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th className="text-right">Rentals captured</th>
            <th className="text-right">Active</th>
            <th className="text-right">Completed</th>
            <th className="text-right">Billed</th>
            <th className="text-right">Collected</th>
            <th className="text-right">Logged actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <span className="font-medium text-ink-800">{row.full_name}</span>
                <span className="block text-xs text-ink-400">{row.email}</span>
              </td>
              <td>{titleCase(row.role)}</td>
              <td className="text-right font-medium tabular-nums">{row.rentals_captured}</td>
              <td className="text-right tabular-nums">{row.active}</td>
              <td className="text-right tabular-nums">{row.completed}</td>
              <td className="text-right tabular-nums">{formatMoney(row.billed, currency)}</td>
              <td className="text-right tabular-nums text-emerald-700">
                {formatMoney(row.collected, currency)}
              </td>
              <td className="text-right tabular-nums text-ink-500">{row.actions}</td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  )
}
/**
 * Revenue per vehicle for the period, split between the company and the owner
 * of a sub-leased vehicle, narrowed to one scope of the fleet.
 */
function FleetPerformanceTab({ loading, rows, currency, scope, onScopeChange, owners, cars }) {
  const totals = rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      company: acc.company + row.company_revenue,
      owner: acc.owner + row.owner_revenue,
      outstanding: acc.outstanding + row.outstanding,
    }),
    { revenue: 0, company: 0, owner: 0, outstanding: 0 },
  )

  const exportCsv = () =>
    downloadCsv(
      `fleet-performance-${toDateInput(new Date())}`,
      [
        { label: 'Registration', value: (row) => row.registration },
        { label: 'Vehicle', value: (row) => row.label },
        { label: 'Ownership', value: (row) => ownershipLabel(row.ownership) },
        { label: 'Owner', value: (row) => row.owner },
        { label: 'Company share %', value: (row) => row.company_share_percent },
        { label: 'Rentals', value: (row) => row.rentals },
        { label: 'Days rented', value: (row) => row.days_rented },
        { label: 'Utilisation %', value: (row) => row.utilization },
        { label: 'Revenue', value: (row) => row.revenue },
        { label: 'Company revenue', value: (row) => row.company_revenue },
        { label: 'Owner revenue', value: (row) => row.owner_revenue },
        { label: 'Outstanding', value: (row) => row.outstanding },
      ],
      rows,
    )

  if (loading) return <Spinner />
  if (rows.length === 0) {
    return <EmptyState icon={Car} title="No vehicles match this scope" />
  }

  const companyPercent =
    totals.revenue > 0 ? Math.round((totals.company / totals.revenue) * 100) : 100

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Scope" className="w-full sm:w-72">
          <Select value={scope} onChange={(event) => onScopeChange(event.target.value)}>
            <option value="all">Entire fleet</option>
            <option value="owned">Owned vehicles</option>
            <option value="sub_lease">Sub-leased vehicles</option>
            {owners.length > 0 && (
              <optgroup label="Owner's fleet">
                {owners.map((owner) => (
                  <option key={owner} value={`owner:${owner}`}>
                    {owner}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="One vehicle">
              {cars.map((car) => (
                <option key={car.id} value={`car:${car.id}`}>
                  {car.registration} — {car.make} {car.model}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        <Button
          variant="secondary"
          size="sm"
          className="mb-1"
          onClick={exportCsv}
          disabled={!rows.length}
        >
          <Download size={14} />
          Export CSV
        </Button>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue in period"
          value={totals.revenue}
          currency={currency}
          sublabel={`${rows.length} vehicle${rows.length === 1 ? '' : 's'} in scope`}
          icon={TrendingUp}
          tone="brand"
        />
        <StatCard
          label="Company share"
          value={totals.company}
          currency={currency}
          sublabel={`${companyPercent}% of revenue`}
          icon={BarChart3}
          tone="success"
        />
        <StatCard
          label="Owner share"
          value={totals.owner}
          currency={currency}
          sublabel={`Paid out to sub-lease owners`}
          icon={Users}
          tone="warning"
        />
        <StatCard
          label="Outstanding"
          value={totals.outstanding}
          currency={currency}
          sublabel="Still owed by customers"
          icon={FileText}
          tone={totals.outstanding > 0 ? 'danger' : 'success'}
        />
      </div>

      <TableWrapper>
        <thead>
          <tr>
            <th>Vehicle</th>
            <th>Ownership</th>
            <th className="text-right">Rentals</th>
            <th className="text-right">Days rented</th>
            <th className="text-right">Utilisation</th>
            <th className="text-right">Revenue</th>
            <th className="text-right">Company share</th>
            <th className="text-right">Owner share</th>
            <th className="text-right">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <span className="font-medium text-ink-800">{row.label}</span>
                <span className="block font-mono text-xs text-ink-400">{row.registration}</span>
              </td>
              <td>
                <Badge tone={row.ownership === 'sub_lease' ? 'warning' : 'info'} size="sm">
                  {ownershipLabel(row.ownership)}
                </Badge>
                {row.ownership === 'sub_lease' && (
                  <span className="mt-1 block text-xs text-ink-500">
                    {row.owner || 'Owner not recorded'} · {row.company_share_percent}%
                  </span>
                )}
              </td>
              <td className="text-right tabular-nums">{row.rentals}</td>
              <td className="text-right tabular-nums">{row.days_rented}</td>
              <td className="text-right tabular-nums">{row.utilization}%</td>
              <td className="text-right font-medium tabular-nums">
                {formatMoney(row.revenue, currency)}
              </td>
              <td className="text-right tabular-nums text-emerald-700">
                {formatMoney(row.company_revenue, currency)}
              </td>
              <td className="text-right tabular-nums text-amber-700">
                {row.ownership === 'sub_lease' ? formatMoney(row.owner_revenue, currency) : '—'}
              </td>
              <td className="text-right tabular-nums">
                {row.outstanding > 0 ? (
                  <span className="font-medium text-red-600">
                    {formatMoney(row.outstanding, currency)}
                  </span>
                ) : (
                  <span className="text-ink-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-ink-50">
            <td colSpan={5} className="px-4 py-3 text-xs text-ink-500">
              Totals for this scope
            </td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink-800">
              {formatMoney(totals.revenue, currency)}
            </td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700">
              {formatMoney(totals.company, currency)}
            </td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-700">
              {formatMoney(totals.owner, currency)}
            </td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink-800">
              {formatMoney(totals.outstanding, currency)}
            </td>
          </tr>
        </tfoot>
      </TableWrapper>
    </div>
  )
}

/**
 * Every Zinara licence in the fleet, soonest to expire first, so a lapsed term
 * never hides behind a vehicle that happens to have no rentals.
 */
function LicencesTab({ loading, rows }) {
  if (loading) return <Spinner />

  const licenceRows = rows
    .map((car) => ({ car, licence: licenseState(car.license_valid_to) }))
    .sort((left, right) => {
      if (left.licence.days === null) return 1
      if (right.licence.days === null) return -1
      return left.licence.days - right.licence.days
    })

  const counts = licenceRows.reduce(
    (acc, entry) => ({ ...acc, [entry.licence.state]: acc[entry.licence.state] + 1 }),
    { valid: 0, expiring: 0, expired: 0, none: 0 },
  )

  const exportCsv = () =>
    downloadCsv(
      `zinara-licences-${toDateInput(new Date())}`,
      [
        { label: 'Registration', value: ({ car }) => car.registration },
        { label: 'Vehicle', value: ({ car }) => `${car.make} ${car.model}` },
        { label: 'Ownership', value: ({ car }) => ownershipLabel(car.ownership) },
        { label: 'Owner', value: ({ car }) => ownerFullName(car) },
        { label: 'Licence from', value: ({ car }) => car.license_valid_from || '' },
        { label: 'Licence to', value: ({ car }) => car.license_valid_to || '' },
        { label: 'Days left', value: ({ licence }) => licence.days ?? '' },
        { label: 'State', value: ({ licence }) => licence.state },
        { label: 'Company share %', value: ({ car }) => car.company_share_percent },
      ],
      licenceRows,
    )

  if (licenceRows.length === 0) {
    return <EmptyState icon={FileText} title="No vehicles yet" message="Add vehicles to record their Zinara licences." />
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-500">
          {counts.valid} valid · {counts.expiring} expiring · {counts.expired} expired ·{' '}
          {counts.none} not recorded
        </p>
        <Button variant="secondary" size="sm" onClick={exportCsv}>
          <Download size={14} />
          Export CSV
        </Button>
      </div>

      <TableWrapper>
        <thead>
          <tr>
            <th>Vehicle</th>
            <th>Ownership</th>
            <th>Owner</th>
            <th>Valid from</th>
            <th>Valid to</th>
            <th className="text-right">Days left</th>
            <th className="text-right">Company share</th>
          </tr>
        </thead>
        <tbody>
          {licenceRows.map(({ car, licence }) => (
            <tr key={car.id}>
              <td>
                <span className="font-medium text-ink-800">{car.make} {car.model}</span>
                <span className="block font-mono text-xs text-ink-400">{car.registration}</span>
              </td>
              <td>
                <Badge tone={car.ownership === 'sub_lease' ? 'warning' : 'info'} size="sm">
                  {ownershipLabel(car.ownership)}
                </Badge>
              </td>
              <td>{ownerFullName(car) || <span className="text-ink-300">—</span>}</td>
              <td>{car.license_valid_from ? formatDate(car.license_valid_from) : <span className="text-ink-300">—</span>}</td>
              <td>
                {car.license_valid_to ? (
                  <Badge
                    tone={
                      licence.state === 'expired'
                        ? 'danger'
                        : licence.state === 'expiring'
                          ? 'warning'
                          : 'success'
                    }
                    size="sm"
                  >
                    {formatDate(car.license_valid_to)}
                  </Badge>
                ) : (
                  <span className="text-ink-300">—</span>
                )}
              </td>
              <td className="text-right tabular-nums">
                {licence.days === null ? (
                  <span className="text-ink-300">—</span>
                ) : (
                  <span
                    className={
                      licence.state === 'expired'
                        ? 'font-medium text-red-600'
                        : licence.state === 'expiring'
                          ? 'font-medium text-amber-700'
                          : 'text-ink-700'
                    }
                  >
                    {licence.days < 0 ? `${Math.abs(licence.days)} over` : licence.days}
                  </span>
                )}
              </td>
              <td className="text-right tabular-nums">
                {car.ownership === 'sub_lease' ? `${car.company_share_percent ?? 100}%` : <span className="text-ink-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  )
}
