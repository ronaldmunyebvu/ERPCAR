import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Car,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  History,
  Plus,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRepository, useResource, useOverdueTicker } from '@/hooks/useRepository'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, EmptyState, Spinner, TableWrapper, Alert, Badge } from '@/components/ui'
import { StatCard, RentalStatusBadge } from '@/components/domain/Badges'
import { AreaChart, BarList, DonutChart } from '@/components/ui/Charts'
import {
  formatMoney,
  formatDateTime,
  formatDate,
  formatNumber,
  currencySymbol,
  relativeTime,
  daysBetween,
  cn,
} from '@/lib/utils'

export default function DashboardPage() {
  const { user, company, isAdmin } = useAuth()
  const { repository, error: repositoryError } = useRepository()
  const navigate = useNavigate()
  useOverdueTicker()

  const companyId = company?.id

  const dash = useResource(
    () => repository.reports.dashboard(companyId),
    `dash|${companyId}|${repository?.mode}`,
  )
  const revenue = useResource(
    () => repository.reports.revenue(companyId, { from: daysAgoIso(29), to: new Date().toISOString() }),
    `rev|${companyId}|${repository?.mode}`,
  )
  const availableCars = useResource(
    () => repository.cars.list({ companyId, status: 'available' }),
    `availableCars|${companyId}|${repository?.mode}`,
  )
  const activeRentals = useResource(
    () => repository.rentals.list({ companyId, status: 'active' }),
    `activeRentals|${companyId}|${repository?.mode}`,
  )

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])

  if (repositoryError) return <Alert tone="danger" title="Could not connect to data source">{repositoryError.message}</Alert>
  if (dash.error) return <Alert tone="danger" title="Could not load dashboard">{dash.error.message}</Alert>
  if (dash.loading || !dash.data) return <Spinner label="Loading dashboard..." />

  const data = dash.data
  const currency = company?.currency || data.currency
  const money = (value) => formatMoney(value, currency)

  const fleetBreakdown = [
    { label: 'Available', value: data.counts.cars_available, color: 'var(--color-emerald-500)' },
    { label: 'Rented', value: data.counts.cars_rented, color: 'var(--color-brand-500)' },
    { label: 'Maintenance', value: data.counts.cars_maintenance, color: 'var(--color-amber-500)' },
    { label: 'Inactive', value: data.counts.cars_inactive, color: 'var(--color-ink-300)' },
  ].filter((item) => item.value > 0)

  const collectionRate =
    data.money.billed_total > 0
      ? Math.round(((data.money.billed_total - data.money.outstanding) / data.money.billed_total) * 100)
      : 0

  const returningCars = (activeRentals.data || [])
    .filter((rental) => rental.expected_return_at)
    .sort((left, right) => new Date(left.expected_return_at) - new Date(right.expected_return_at))
    .slice(0, 5)

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user?.full_name?.split(' ')[0]}`}
        description={`Here is what is happening at ${company?.name || 'your company'} today.`}
        actions={
          <Button onClick={() => navigate('/app/rentals/new')}>
            <Plus size={16} />
            Capture rental
          </Button>
        }
      />

      {data.attention.overdue.length > 0 && (
        <Alert
          tone="danger"
          icon={AlertTriangle}
          title={`${data.attention.overdue.length} overdue rental${data.attention.overdue.length > 1 ? 's' : ''} need follow-up`}
          className="mb-4"
        >
          <ul className="mt-1 space-y-1">
            {data.attention.overdue.slice(0, 4).map((rental) => (
              <li key={rental.id} className="flex flex-wrap items-center gap-x-2">
                <Link to={`/app/rentals/${rental.id}`} className="font-semibold underline">
                  {rental.reference}
                </Link>
                <span>
                  {rental.customer?.full_name} Â· {rental.car?.registration} Â· due{' '}
                  {formatDateTime(rental.expected_return_at)} Â·{' '}
                  {daysBetween(rental.expected_return_at, new Date())} day(s) late
                </span>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active rentals"
          value={data.counts.rentals_active}
          sublabel={`${data.counts.rentals_overdue} overdue`}
          icon={CalendarClock}
          tone={data.counts.rentals_overdue > 0 ? 'danger' : 'brand'}
          onClick={() => navigate('/app/rentals?status=active')}
        />
        <StatCard
          label="Revenue this month"
          value={data.money.revenue_this_month}
          currency={currency}
          sublabel={`${money(data.money.revenue_total)} all time`}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Outstanding balance"
          value={data.money.outstanding}
          currency={currency}
          sublabel={`${collectionRate}% of billed amount collected`}
          icon={Wallet}
          tone={data.money.outstanding > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Fleet available"
          value={`${data.counts.cars_available}/${data.counts.cars_total}`}
          sublabel={`${data.counts.cars_maintenance} in maintenance`}
          icon={Car}
          tone="sky"
          onClick={() => navigate('/app/fleet')}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Revenue vs billed"
            description="Last 30 days â€” cash collected against amounts invoiced."
            icon={CircleDollarSign}
          />
          <div className="p-5">
            {revenue.data?.series?.length ? (
              <AreaChart
                data={revenue.data.series}
                series={[
                  { key: 'collected', label: 'Collected', color: 'var(--color-brand-500)' },
                  { key: 'billed', label: 'Billed', color: 'var(--color-ink-300)' },
                ]}
                formatValue={(value) => currencySymbol(currency) + Math.round(value).toLocaleString('en-US')}
                formatLabel={(value) => formatDate(value).slice(0, 6)}
                currency={currency}
              />
            ) : (
              <EmptyState title="No transactions in this window" />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Fleet status" icon={Car} />
          <div className="p-5">
            {fleetBreakdown.length ? (
              <>
                <DonutChart
                  data={fleetBreakdown}
                  centerValue={data.counts.cars_total}
                  centerLabel="vehicles"
                  size={150}
                  thickness={20}
                />
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-ink-100 pt-4 text-center">
                  <div>
                    <p className="text-xs text-ink-500">Customers</p>
                    <p className="text-lg font-semibold text-ink-900">{data.counts.customers_total}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">Staff active</p>
                    <p className="text-lg font-semibold text-ink-900">{data.counts.members_active}</p>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState title="No vehicles yet" message="Add vehicles to start renting." />
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Available vehicles" icon={Car} />
          <div className="divide-y divide-ink-100">
            {(availableCars.data || []).length === 0 ? (
              <EmptyState title="No vehicles available" message="All vehicles are currently rented or unavailable." className="py-6" />
            ) : (
              (availableCars.data || []).slice(0, 6).map((car) => (
                <div key={car.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink-800">
                      {car.make} {car.model}
                    </p>
                    <p className="text-xs text-ink-500">
                      {car.registration} · {car.color || 'No colour listed'}
                    </p>
                  </div>
                  <Badge tone="success" size="sm">
                    Available
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Cars returning" icon={CalendarClock} />
          <div className="divide-y divide-ink-100">
            {returningCars.length === 0 ? (
              <EmptyState title="No vehicles due back" message="No rentals are currently coming back in this window." className="py-6" />
            ) : (
              returningCars.map((rental) => (
                <div key={rental.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink-800">{rental.car?.registration}</p>
                    <p className="text-xs text-ink-500">
                      {rental.customer?.full_name} · {rental.car?.make} {rental.car?.model}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-ink-700">{formatDateTime(rental.expected_return_at)}</p>
                    <p className="text-[11px] text-ink-400">{rental.reference}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={isAdmin ? 'All recent rentals' : 'Rentals you captured'}
            icon={CalendarClock}
            actions={
              <Link
                to="/app/rentals"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View all
                <ArrowUpRight size={14} />
              </Link>
            }
          />
          {data.recent.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No rentals yet"
              message="Capture your first rental to see it here."
              action={
                <Link to="/app/rentals/new">
                  <Button>
                    <Plus size={15} />
                    Capture rental
                  </Button>
                </Link>
              }
            />
          ) : (
            <TableWrapper>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Vehicle</th>
                  <th>Due back</th>
                  <th>Status</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((rental) => (
                  <tr key={rental.id}>
                    <td>
                      <Link
                        to={`/app/rentals/${rental.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {rental.reference}
                      </Link>
                    </td>
                    <td className="max-w-40 truncate">{rental.customer?.full_name}</td>
                    <td className="font-mono text-xs">{rental.car?.registration}</td>
                    <td>{formatDate(rental.expected_return_at)}</td>
                    <td>
                      <RentalStatusBadge status={rental.computed_status} size="sm" />
                    </td>
                    <td className="text-right tabular-nums">
                      {rental.computed_balance > 0 ? (
                        <span className="font-medium text-red-600">
                          {money(rental.computed_balance)}
                        </span>
                      ) : (
                        <span className="text-emerald-600">Paid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrapper>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Returns due soon" icon={Clock3} />
            {data.attention.due_soon.length === 0 ? (
              <EmptyState title="Nothing due in the next 24 hours" />
            ) : (
              <ul className="divide-y divide-ink-100">
                {data.attention.due_soon.map((rental) => (
                  <li key={rental.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/app/rentals/${rental.id}`}
                        className="text-sm font-medium text-ink-800 hover:text-brand-700"
                      >
                        {rental.customer?.full_name}
                      </Link>
                      <p className="truncate text-xs text-ink-500">
                        {rental.car?.make} {rental.car?.model} Â· {rental.car?.registration}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium text-ink-700">
                        {formatDateTime(rental.expected_return_at)}
                      </p>
                      <p className="text-[11px] text-ink-400">{rental.reference}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Most rented vehicles"
              icon={Car}
              actions={
                <Link
                  to="/app/reports"
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  Report
                  <ArrowUpRight size={14} />
                </Link>
              }
            />
            <div className="p-5">
              <BarList
                items={data.top_cars.map((car) => ({
                  label: `${car.label} Â· ${car.registration}`,
                  value: car.revenue,
                  suffix: ' revenue',
                }))}
                formatValue={(value) => formatNumber(value)}
                emptyLabel="No rental history yet"
              />
            </div>
          </Card>
        </div>
      </div>

      {isAdmin && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Recent staff activity"
              icon={History}
              actions={
                <Link
                  to="/app/activity"
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  Full log
                  <ArrowUpRight size={14} />
                </Link>
              }
            />
            {data.recent_activity.length === 0 ? (
              <EmptyState title="No activity recorded yet" />
            ) : (
              <ul className="divide-y divide-ink-100">
                {data.recent_activity.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                    <span
                      className={cn(
                        'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full',
                        entry.action.includes('returned')
                          ? 'bg-emerald-50 text-emerald-600'
                          : entry.action.includes('deleted')
                            ? 'bg-red-50 text-red-600'
                            : 'bg-brand-50 text-brand-600',
                      )}
                    >
                      {entry.action.includes('returned') ? (
                        <CheckCircle2 size={14} />
                      ) : entry.action.includes('deleted') ? (
                        <AlertTriangle size={14} />
                      ) : (
                        <History size={14} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink-700">{entry.summary}</p>
                      <p className="text-[11px] text-ink-400">
                        {entry.user?.full_name || 'System'} Â· {relativeTime(entry.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Financial snapshot" icon={Wallet} />
            <dl className="divide-y divide-ink-100">
              {[
                ['Deposits currently held', money(data.money.deposits_held)],
                ['Total billed (excl. cancelled)', money(data.money.billed_total)],
                ['Total collected (all time)', money(data.money.revenue_total)],
                ['Outstanding to customers', money(data.money.outstanding)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-5 py-3">
                  <dt className="text-sm text-ink-600">{label}</dt>
                  <dd className="text-sm font-semibold text-ink-900 tabular-nums">{value}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between px-5 py-3">
                <dt className="text-sm text-ink-600">Completed rentals</dt>
                <dd>
                  <Badge tone="success">{formatNumber(data.counts.rentals_completed)}</Badge>
                </dd>
              </div>
            </dl>
            <div className="border-t border-ink-100 px-5 py-3">
              <div className="flex items-center justify-between text-xs text-ink-500">
                <span className="inline-flex items-center gap-1.5">
                  <Users size={13} /> Customers on file
                </span>
                <span className="font-semibold text-ink-800">{data.counts.customers_total}</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

function daysAgoIso(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}