import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Car, Receipt, Wrench } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRepository, useResource } from '@/hooks/useRepository'
import { useToast } from '@/context/ToastContext'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Modal,
  Select,
  Spinner,
  TableWrapper,
} from '@/components/ui'
import { CarStatusBadge, StatCard, PaymentMethodBadge } from '@/components/domain/Badges'
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  titleCase,
  toDateInput,
} from '@/lib/utils'
/**
 * Maintenance: vehicles taken off the road and the fleet costs booked
 * against them in the cashbook. Status changes reuse `cars.update`; the
 * cost ledger is read from `cashbook_entries` where scope = fleet.
 */
export default function MaintenancePage() {
  const { user, company } = useAuth()
  const { repository } = useRepository()
  const toast = useToast()
  const companyId = company?.id
  const currency = company?.currency || 'USD'

  const [sending, setSending] = useState(false)
  const [targetCar, setTargetCar] = useState('')
  const [busy, setBusy] = useState(false)

  const monthStart = `${toDateInput(new Date()).slice(0, 7)}-01`

  const cars = useResource(
    () => repository.cars.list({ companyId }),
    `maintenance.cars|${Boolean(repository)}|${companyId}`,
  )
  const expenses = useResource(
    () => repository.cashbook.list({ companyId, from: monthStart, to: toDateInput(new Date()) }),
    `maintenance.costs|${Boolean(repository)}|${companyId}|${monthStart}`,
  )

  const allCars = cars.data || []
  const inService = allCars.filter((car) => car.status === 'maintenance')
  const readyToSend = allCars.filter((car) => car.status === 'available')
  const fleetCosts = (expenses.data || []).filter(
    (row) => row.direction === 'expense' && row.expense_scope === 'fleet',
  )
  const monthTotal = fleetCosts.reduce((sum, row) => sum + Number(row.amount), 0)

  const markStatus = async (car, status) => {
    setBusy(true)
    try {
      await repository.cars.update(car.id, { status }, user)
      toast.success(`${car.registration} marked ${titleCase(status)}.`)
      cars.reload()
    } catch (cause) {
      toast.error(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const sendToMaintenance = async (event) => {
    event.preventDefault()
    const car = readyToSend.find((value) => value.id === targetCar)
    if (!car) return
    await markStatus(car, 'maintenance')
    setSending(false)
    setTargetCar('')
  }

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Take vehicles off the road for servicing and track the fleet costs booked against them."
        actions={
          <Button onClick={() => setSending(true)} disabled={readyToSend.length === 0}>
            <Wrench size={15} />
            Send for maintenance
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="In maintenance"
          value={inService.length}
          sublabel={`of ${allCars.length} vehicles`}
          icon={Wrench}
          tone="warning"
        />
        <StatCard
          label="Fleet costs this month"
          value={monthTotal}
          currency={currency}
          sublabel={`${fleetCosts.length} expenses`}
          icon={Receipt}
          tone="danger"
        />
        <StatCard
          label="Ready to rent"
          value={allCars.filter((car) => car.status === 'available').length}
          sublabel="Available vehicles"
          icon={Car}
          tone="success"
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Vehicles in maintenance"
          description="Mark a vehicle available again once the work is done."
        />
        {cars.loading ? (
          <Spinner label="Loading fleet…" />
        ) : inService.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="Nothing in the workshop"
            message="Vehicles sent for maintenance will show up here."
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Status</th>
                <th className="text-right">Mileage</th>
                <th className="text-right">Daily rate</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inService.map((car) => (
                <tr key={car.id}>
                  <td>
                    <div className="font-medium text-ink-800">
                      {car.make} {car.model}
                    </div>
                    <div className="font-mono text-xs text-ink-400">{car.registration}</div>
                  </td>
                  <td>
                    <CarStatusBadge status={car.status} size="sm" />
                  </td>
                  <td className="text-right tabular-nums">
                    {formatNumber(car.mileage || 0)} km
                  </td>
                  <td className="text-right tabular-nums">
                    {formatMoney(car.daily_rate, currency)}
                  </td>
                  <td className="text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => markStatus(car, 'available')}
                    >
                      Back to service
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Fleet costs this month"
          description="Cashbook expenses booked against a single vehicle."
        />
        {expenses.loading ? (
          <Spinner label="Loading costs…" />
        ) : fleetCosts.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No fleet expenses yet"
            message={
              <>
                Record repairs, fuel or servicing from the{' '}
                <Link to="/app/cashbook" className="text-brand-600 underline">
                  Cashbook
                </Link>{' '}
                with scope “One vehicle”.
              </>
            }
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <th>Date</th>
                <th>Vehicle</th>
                <th>Category</th>
                <th>Method</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {[...fleetCosts]
                .sort((left, right) => new Date(right.occurred_at) - new Date(left.occurred_at))
                .map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-ink-700">{formatDateTime(row.occurred_at)}</td>
                    <td className="font-mono text-xs">
                      {row.car_registration
                        ? `${row.car_registration}${row.car_label ? ` — ${row.car_label}` : ''}`
                        : row.car_label || '—'}
                    </td>
                    <td className="text-ink-700">
                      {row.category}
                      {row.description && (
                        <span className="block text-xs text-ink-400">{row.description}</span>
                      )}
                    </td>
                    <td>
                      <PaymentMethodBadge method={row.method} />
                    </td>
                    <td className="text-right font-semibold tabular-nums text-rose-700">
                      −{formatMoney(row.amount, currency)}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50/60">
                <td colSpan={4} className="px-4 py-2.5 text-sm font-semibold text-ink-700">
                  Total this month ({formatDate(monthStart)} — {formatDate(toDateInput(new Date()))})
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-ink-900">
                  {formatMoney(monthTotal, currency)}
                </td>
              </tr>
            </tfoot>
          </TableWrapper>
        )}
      </Card>

      <Modal
        open={sending}
        onClose={() => setSending(false)}
        title="Send a vehicle for maintenance"
        description="It will be hidden from new bookings until you mark it available again."
        size="sm"
      >
        <form onSubmit={sendToMaintenance} className="space-y-4">
          {readyToSend.length === 0 ? (
            <Alert tone="info">No available vehicles to send right now.</Alert>
          ) : (
            <>
              <Field label="Vehicle" required>
                <Select
                  value={targetCar}
                  onChange={(event) => setTargetCar(event.target.value)}
                  required
                >
                  <option value="">Choose a vehicle…</option>
                  {readyToSend.map((car) => (
                    <option key={car.id} value={car.id}>
                      {car.registration} — {car.make} {car.model}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setSending(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={busy} disabled={!targetCar}>
                  <Wrench size={15} />
                  Send for maintenance
                </Button>
              </div>
            </>
          )}
        </form>
      </Modal>
    </>
  )
}
