import { uid, toDateInput, toDateTimeInput, addDays, daysBetween } from '@/lib/utils'
import { hashPassword } from '@/lib/crypto'

/**
 * Sample data so the app is usable immediately in mock mode.
 * Passwords: owner `Admin@123`, staff `Member@123`.
 */
export async function buildSeed() {
  const now = new Date()
  const at = (days, hour = 9, minute = 0) =>
    toDateTimeInput(new Date(addDays(now, days).setHours(hour, minute, 0, 0)))

  const companyId = uid('cmp_')

  const company = {
    id: companyId,
    name: 'Falcon Car Hire',
    email: 'info@falconcarhire.test',
    phone: '+263 712 000 111',
    address: '18 Josiah Tongogara Street',
    city: 'Harare',
    country: 'Zimbabwe',
    logo_url: '',
    currency: 'USD',
    timezone: 'Africa/Harare',
    members_see_all_rentals: false,
    members_edit_own_rentals: true,
    members_manage_fleet: false,
    password_reset_enabled: true,
    created_at: addDays(now, -400).toISOString(),
    updated_at: addDays(now, -3).toISOString(),
  }

  const ownerId = uid('usr_')
  const staffIds = [uid('usr_'), uid('usr_'), uid('usr_')]

  const user = (id, full_name, email, role, status, lastLoginDaysAgo) => ({
    id,
    company_id: companyId,
    full_name,
    email,
    phone: role === 'admin' ? '+263 712 000 111' : '+263 71' + id.slice(-7).padStart(7, '4'),
    password_hash: '',
    role,
    status,
    avatar_url: '',
    last_login_at: lastLoginDaysAgo === null ? null : addDays(now, lastLoginDaysAgo).toISOString(),
    created_at: addDays(now, -300).toISOString(),
    updated_at: addDays(now, lastLoginDaysAgo ?? -300).toISOString(),
  })

  const owner = user(ownerId, 'Tendai Moyo', 'admin@falconcarhire.test', 'admin', 'active', 0)
  owner.password_hash = await hashPassword('Admin@123')

  const staffDefs = [
    ['Rudo Chari', 'rudo@falconcarhire.test', 'active', 1],
    ['Brian Ncube', 'brian@falconcarhire.test', 'active', 2],
    ['Salma Dube', 'salma@falconcarhire.test', 'inactive', null],
  ]

  const users = [owner]
  for (let i = 0; i < staffDefs.length; i += 1) {
    const [full_name, email, status, lastLogin] = staffDefs[i]
    const record = user(staffIds[i], full_name, email, 'member', status, lastLogin)
    record.password_hash = await hashPassword('Member@123')
    users.push(record)
  }

  const carDefs = [
    ['Toyota', 'Corolla', 2022, 'FCH-2214', 'White', 'Sedan', 65, 'available', 'Automatic'],
    ['Toyota', 'Corolla', 2021, 'FCH-2215', 'Silver', 'Sedan', 65, 'rented', 'Automatic'],
    ['Nissan', 'Note', 2023, 'FCH-3391', 'Blue', 'Hatchback', 48, 'available', 'Automatic'],
    ['Honda', 'Fit', 2022, 'FCH-3308', 'Black', 'Hatchback', 52, 'available', 'Automatic'],
    ['Toyota', 'Hiace', 2021, 'FCH-7788', 'White', 'Van', 120, 'available', 'Manual'],
    ['Toyota', 'Hiace', 2020, 'FCH-7789', 'Grey', 'Van', 115, 'maintenance', 'Manual'],
    ['Nissan', 'NV350', 2022, 'FCH-8802', 'Silver', 'Van', 110, 'available', 'Automatic'],
    ['Isuzu', 'D-Max', 2023, 'FCH-4417', 'Red', 'Pickup', 95, 'available', 'Manual'],
    ['Mercedes-Benz', 'C-Class', 2021, 'FCH-5502', 'Black', 'Luxury', 240, 'available', 'Automatic'],
    ['Toyota', 'Fortuner', 2022, 'FCH-6601', 'White', 'SUV', 175, 'available', 'Automatic'],
    ['BMW', '3 Series', 2020, 'FCH-5509', 'Navy', 'Luxury', 235, 'available', 'Automatic'],
    ['Toyota', 'Land Cruiser', 2023, 'FCH-6609', 'White', 'SUV', 320, 'rented', 'Automatic'],
  ]

  const cars = carDefs.map(([make, model, year, registration, color, category, daily_rate, status], i) => ({
    id: uid('car_'),
    company_id: companyId,
    make,
    model,
    year,
    registration,
    color,
    category,
    daily_rate,
    status,
    photo_url: '',
    notes: i === 5 ? 'Front windscreen replacement pending.' : '',
    created_at: addDays(now, -200 + i).toISOString(),
    updated_at: addDays(now, -5).toISOString(),
  }))

  const customerDefs = [
    ['Grace Mutasa', '+263 771 220 145', 'grace.mutasa@example.test', '63-0712345 A', 'DL-88213', '12 Samora Avenue, Harare'],
    ['Peter Ndlovu', '+263 772 998 001', 'pndlovu@example.test', '08-9988776 B', 'DL-77541', '45 Bulawayo Road, Harare'],
    ['Anna Sibanda', '+263 773 441 992', 'anna.sibanda@example.test', '63-5543210 C', 'DL-66012', '7 Borrowdale Road, Harare'],
    ['Michael Dube', '+263 774 220 118', 'm.dube@example.test', '02-3344556 D', 'DL-55490', '88 Nelson Mandela Ave, Harare'],
    ['Lydia Chikore', '+263 775 667 210', 'lydia.chikore@example.test', '63-7788990 A', 'DL-44321', '31 Fleetwood Road, Harare'],
    ['Corporate: Zimlink Traders', '+263 4 887 220', 'fleet@zimlink.test', 'BP-102-556', null, '4 Sam Nujoma Street, Harare'],
  ]

  const customers = customerDefs.map(([full_name, phone, email, id_number, driver_license, address], i) => ({
    id: uid('cus_'),
    company_id: companyId,
    full_name,
    phone,
    email,
    id_number,
    driver_license,
    address,
    notes: full_name.startsWith('Corporate') ? 'Invoiced monthly, account terms 30 days.' : '',
    created_at: addDays(now, -180 + i * 12).toISOString(),
    updated_at: addDays(now, -30).toISOString(),
  }))

  const year = now.getFullYear()
  let counter = 0
  const rental = (carIndex, customerIndex, staffIndex, pickupDay, returnDay, extra = {}) => {
    counter += 1
    const pickup_at = at(pickupDay, 9, 0)
    const expected_return_at = at(returnDay, 18, 0)
    const days = daysBetween(pickup_at, expected_return_at)
    const car = cars[carIndex]
    const total_amount = car.daily_rate * days
    return {
      id: uid('rnt_'),
      company_id: companyId,
      car_id: car.id,
      customer_id: customers[customerIndex].id,
      created_by: users[staffIndex + 1].id,
      reference: `RNT-${year}-${String(counter).padStart(4, '0')}`,
      pickup_at,
      expected_return_at,
      actual_return_at: extra.actual_return_at ?? null,
      daily_rate: car.daily_rate,
      days,
      total_amount,
      deposit_amount: extra.deposit_amount ?? Math.round(car.daily_rate * 2),
      additional_charges: extra.additional_charges ?? [],
      status: extra.status ?? 'completed',
      notes: extra.notes ?? '',
      created_at: new Date(addDays(now, pickupDay).setHours(8, 15, 0, 0)).toISOString(),
      updated_at: addDays(now, extra.actual_return_at ? returnDay : pickupDay).toISOString(),
    }
  }

  const rentals = [
    rental(0, 0, 0, -96, -89, { notes: 'Airport pickup, flight BAW 1172.' }),
    rental(2, 1, 1, -84, -79, { notes: 'Weekly hire, mileage unlimited.' }),
    rental(4, 5, 0, -70, -64, { notes: 'Corporate account — 12 seater airport transfers.' }),
    rental(8, 2, 2, -58, -55, { additional_charges: [{ label: 'Fuel top-up', amount: 45 }] }),
    rental(9, 3, 1, -47, -42, {}),
    rental(1, 0, 0, -40, -35, { notes: 'Extended by 2 days over phone.' }),
    rental(3, 4, 2, -33, -30, { additional_charges: [{ label: 'Late return fee', amount: 25 }] }),
    rental(6, 5, 0, -26, -20, { notes: 'Corporate account.' }),
    rental(7, 3, 1, -21, -16, { additional_charges: [{ label: 'Damage fee — rear bumper', amount: 180 }] }),
    rental(10, 1, 2, -14, -9, {}),
    rental(4, 2, 0, -6, -2, { actual_return_at: at(-2, 17, 20), notes: 'Returned early, balance refunded.' }),
    rental(9, 0, 1, -3, 2, {
      status: 'active',
      notes: 'Long-distance trip to Kariba, deposit held.',
    }),
    rental(11, 3, 0, -1, 4, {
      status: 'active',
      notes: 'Mining contractor — 7 seater extended cab.',
    }),
    rental(2, 4, 1, -8, -5, {
      status: 'overdue',
      notes: 'Customer unreachable, follow up required.',
      additional_charges: [{ label: 'Late return fee', amount: 30 }],
    }),
    rental(5, 5, 2, 2, 7, {
      status: 'active',
      notes: 'Booked for weekend wedding shuttle.',
    }),
  ]

  const payments = []
  const pay = (rentalRecord, amount, method, daysAgo, receivedByIndex = 0) => {
    payments.push({
      id: uid('pay_'),
      company_id: companyId,
      rental_id: rentalRecord.id,
      amount,
      method,
      reference: `${method.toUpperCase().slice(0, 4)}-${String(payments.length + 1).padStart(5, '0')}`,
      note: '',
      received_by: users[receivedByIndex + 1].id,
      received_at: new Date(addDays(now, daysAgo).setHours(11, 30, 0, 0)).toISOString(),
    })
  }

  const extrasOf = (record) =>
    (record.additional_charges || []).reduce((sum, charge) => sum + Number(charge.amount || 0), 0)

  rentals.forEach((record, index) => {
    const bill = record.total_amount + extrasOf(record)
    if (record.status === 'completed') {
      pay(record, bill, ['ecocash', 'card', 'cash', 'bank_transfer'][index % 4], record.days ? -Math.abs(record.days) - 5 : -10)
    } else if (record.status === 'overdue') {
      pay(record, Math.round(bill * 0.4), 'cash', -7)
    } else if (record.status === 'active') {
      pay(record, Math.round(bill * 0.6), index % 2 ? 'ecocash' : 'cash', -2)
    }
  })

  const activity = [
    {
      id: uid('act_'),
      company_id: companyId,
      user_id: ownerId,
      action: 'rental.created',
      entity: 'rental',
      entity_id: rentals[12].id,
      summary: 'Captured rental RNT-…-0013 for Michael Dube (Toyota Fortuner)',
      metadata: {},
      created_at: addDays(now, -1).toISOString(),
    },
    {
      id: uid('act_'),
      company_id: companyId,
      user_id: staffIds[1],
      action: 'rental.returned',
      entity: 'rental',
      entity_id: rentals[10].id,
      summary: 'Returned Toyota Hiace FCH-7788 for Anna Sibanda',
      metadata: {},
      created_at: addDays(now, -2).toISOString(),
    },
    {
      id: uid('act_'),
      company_id: companyId,
      user_id: staffIds[0],
      action: 'customer.created',
      entity: 'customer',
      entity_id: customers[4].id,
      summary: 'Added customer Lydia Chikore',
      metadata: {},
      created_at: addDays(now, -6).toISOString(),
    },
    {
      id: uid('act_'),
      company_id: companyId,
      user_id: ownerId,
      action: 'user.created',
      entity: 'user',
      entity_id: staffIds[1],
      summary: 'Created staff account brian@falconcarhire.test',
      metadata: {},
      created_at: addDays(now, -30).toISOString(),
    },
    {
      id: uid('act_'),
      company_id: companyId,
      user_id: staffIds[0],
      action: 'user.deactivated',
      entity: 'user',
      entity_id: staffIds[2],
      summary: 'Deactivated staff account salma@falconcarhire.test',
      metadata: {},
      created_at: addDays(now, -25).toISOString(),
    },
    {
      id: uid('act_'),
      company_id: companyId,
      user_id: ownerId,
      action: 'car.updated',
      entity: 'car',
      entity_id: cars[5].id,
      summary: 'Moved Toyota Hiace FCH-7789 to maintenance',
      metadata: {},
      created_at: addDays(now, -5).toISOString(),
    },
    {
      id: uid('act_'),
      company_id: companyId,
      user_id: staffIds[2],
      action: 'payment.recorded',
      entity: 'payment',
      entity_id: null,
      summary: 'Recorded payment on rental RNT-…-0004',
      metadata: {},
      created_at: addDays(now, -55).toISOString(),
    },
  ]

  return {
    version: 1,
    seeded_at: new Date().toISOString(),
    today: toDateInput(now),
    companies: [company],
    users,
    cars,
    customers,
    rentals,
    payments,
    activity,
    settings: {},
  }
}