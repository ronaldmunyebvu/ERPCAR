import { formatDateTime, formatMoney, formatNumber } from '@/lib/utils'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function detailRow(label, value) {
  const displayValue = value == null || value === '' ? '—' : value
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(displayValue)}</td></tr>`
}

function chargeRows(charges, currency) {
  return (charges || [])
    .map(
      (charge) =>
        `<tr><th>${escapeHtml(charge.label || 'Additional charge')}</th><td>${escapeHtml(
          formatMoney(charge.amount, currency),
        )}</td></tr>`,
    )
    .join('')
}

export function buildRentalAgreementHtml(rental, company, currency) {
  const customer = rental.customer || {}
  const car = rental.car || {}
  const companyName = company?.name || 'Rental Company'
  const agreementNumber = rental.reference || rental.id
  const rentalFee = Number(rental.daily_rate || 0) * Number(rental.days || 0)
  const additionalCharges = (rental.additional_charges || []).reduce(
    (sum, charge) => sum + (Number(charge.amount) || 0),
    0,
  )

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rental Agreement ${escapeHtml(agreementNumber)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; color: #172033; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef1f5; font-size: 13px; line-height: 1.5; }
    main { max-width: 820px; margin: 24px auto; padding: 38px 44px; background: #fff; }
    header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 20px; border-bottom: 2px solid #1f45eb; }
    h1 { margin: 0 0 4px; font-size: 25px; }
    h2 { margin: 24px 0 8px; font-size: 15px; }
    p { margin: 7px 0; }
    .muted { color: #5b6577; }
    .reference { text-align: right; white-space: nowrap; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #dfe3eb; text-align: left; vertical-align: top; }
    th { width: 38%; color: #465166; font-weight: 600; }
    .amount { width: 50%; margin-left: auto; }
    .amount th { width: 65%; }
    .total th, .total td { border-top: 2px solid #172033; font-size: 14px; font-weight: 700; }
    .terms { padding-left: 20px; }
    .terms li { margin: 6px 0; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 34px 28px; margin-top: 48px; }
    .signature { min-height: 65px; border-bottom: 1px solid #172033; }
    .signature-label { margin-top: 5px; color: #465166; }
    footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #dfe3eb; color: #5b6577; font-size: 11px; }
    @media print {
      body { background: #fff; }
      main { max-width: none; margin: 0; padding: 0; }
      @page { margin: 16mm; }
    }
    @media (max-width: 600px) {
      main { margin: 0; padding: 24px 18px; }
      header { flex-direction: column; }
      .reference { text-align: left; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>${escapeHtml(companyName)}</h1>
        ${company?.address ? `<p>${escapeHtml(company.address)}</p>` : ''}
        <p class="muted">${[company?.phone, company?.email].filter(Boolean).map(escapeHtml).join(' · ')}</p>
      </div>
      <div class="reference">
        <h1>Vehicle Rental Agreement</h1>
        <p><strong>Agreement:</strong> ${escapeHtml(agreementNumber)}</p>
        <p><strong>Prepared:</strong> ${escapeHtml(formatDateTime(rental.created_at))}</p>
      </div>
    </header>

    <p>This agreement records the vehicle rental between <strong>${escapeHtml(companyName)}</strong> (the rental company) and the customer identified below. The parties should review the details and sign before the vehicle is handed over.</p>

    <h2>Customer</h2>
    <table>
      ${detailRow('Full name', customer.full_name)}
      ${detailRow('Phone', customer.phone)}
      ${detailRow('Email', customer.email)}
      ${detailRow('Address', customer.address)}
      ${detailRow('ID / passport', customer.id_number)}
      ${detailRow("Driver's licence", customer.driver_license)}
    </table>

    <h2>Vehicle and rental period</h2>
    <table>
      ${detailRow('Vehicle', [car.year, car.make, car.model].filter(Boolean).join(' '))}
      ${detailRow('Registration', car.registration)}
      ${detailRow('Colour', car.color)}
      ${detailRow('Pickup', formatDateTime(rental.pickup_at))}
      ${detailRow('Expected return', formatDateTime(rental.expected_return_at))}
      ${detailRow('Pickup odometer', rental.start_mileage != null ? `${formatNumber(rental.start_mileage)} km` : 'Not recorded')}
      ${detailRow('Mileage allowance', rental.expected_km_per_day != null ? `${formatNumber(rental.expected_km_per_day)} km per day` : 'As agreed')}
    </table>

    <h2>Rental charges</h2>
    <table class="amount">
      ${detailRow(`Rental fee (${rental.days} day${Number(rental.days) === 1 ? '' : 's'} × ${formatMoney(rental.daily_rate, currency)}/day)`, formatMoney(rentalFee, currency))}
      ${chargeRows(rental.additional_charges, currency)}
      ${rental.deposit_amount > 0 ? detailRow('Security deposit', formatMoney(rental.deposit_amount, currency)) : ''}
      <tr class="total"><th>Total rental charges</th><td>${escapeHtml(formatMoney(rental.computed_total ?? rentalFee + additionalCharges, currency))}</td></tr>
      ${detailRow('Paid to date', formatMoney(rental.computed_paid || 0, currency))}
      ${detailRow('Balance outstanding', formatMoney(rental.computed_balance || 0, currency))}
    </table>

    <h2>Terms and acknowledgement</h2>
    <ol class="terms">
      <li>The customer confirms that the details above are correct and that they are authorised and properly licensed to drive the vehicle.</li>
      <li>The customer will use the vehicle lawfully, take reasonable care of it, and not allow an unauthorised person to drive it.</li>
      <li>The customer will return the vehicle by the expected return time and in substantially the same condition as received, fair wear and tear excepted. Any late-return, excess-mileage, fuel, damage, or other additional charges must be explained and agreed by the parties.</li>
      <li>The rental company will record the vehicle condition and odometer at handover and return. The customer may note any existing damage or disagreement below before signing.</li>
      <li>The parties acknowledge the charges shown above. Any change to the rental period or charges should be recorded and accepted by both parties.</li>
    </ol>
    ${rental.notes ? `<p><strong>Additional notes:</strong> ${escapeHtml(rental.notes)}</p>` : ''}
    <p><strong>Customer comments / existing damage:</strong></p>
    <p>________________________________________________________________________________</p>
    <p>________________________________________________________________________________</p>

    <div class="signatures">
      <div><p style="margin:0 0 4px"><strong>Customer:</strong> ${escapeHtml(customer.full_name || '')}</p><div class="signature"></div><div class="signature-label">Signature · Date:</div></div>
      <div><div class="signature"></div><div class="signature-label">Rental company representative · Print name · Date:</div></div>
      <div><div class="signature"></div><div class="signature-label">Witness signature · Print name · Date:</div></div>
      <div><div class="signature"></div><div class="signature-label">Witness signature · Print name · Date:</div></div>
    </div>

    <footer>Agreement ${escapeHtml(agreementNumber)} · Each party should retain a signed copy.</footer>
  </main>
</body>
</html>`
}

export function agreementFileName(rental) {
  const reference = rental?.reference || rental?.id || 'rental'
  return `rental-agreement-${String(reference).replace(/[^a-z0-9-_]+/gi, '-')}.html`
}

export function downloadRentalAgreement(rental, company, currency) {
  const html = buildRentalAgreementHtml(rental, company, currency)
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = agreementFileName(rental)
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function printRentalAgreement(rental, company, currency) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return false

  const html = buildRentalAgreementHtml(rental, company, currency)
  printWindow.addEventListener('load', () => printWindow.print(), { once: true })
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  return true
}
