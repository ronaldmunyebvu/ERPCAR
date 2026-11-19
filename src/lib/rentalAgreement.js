import {
  currencySymbol,
  formatDate,
  formatNumber,
  fuelLevelLabel,
  toDate,
} from '@/lib/utils'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 48
const MARGIN_TOP = 50
const MARGIN_BOTTOM = 54
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

const FONT_WIDTHS = `278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278
556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015
667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611
278 278 278 469 556 333
556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500
334 260 334 584`
  .trim()
  .split(/\s+/)
  .map(Number)

const ONES = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

const ASCII_REPLACEMENTS = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2022': '-',
  '\u00B7': '-',
  '\u00D7': 'x',
  '\u20AC': 'EUR ',
  '\u00A3': 'GBP ',
  '\u20A6': 'NGN ',
  '\u20B5': 'GHS ',
  '\u00A5': 'JPY ',
}

function pdfText(value) {
  return String(value ?? '')
    .replace(/[\u2018\u2019\u201C\u201D\u2013\u2014\u2022\u00B7\u00D7\u20AC\u00A3\u20A6\u20B5\u00A5]/g, (char) =>
      ASCII_REPLACEMENTS[char],
    )
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function measure(text, size, bold) {
  let units = 0
  for (let index = 0; index < text.length; index += 1) {
    units += FONT_WIDTHS[text.charCodeAt(index) - 32] ?? 556
  }
  return (units * size) / 1000 * (bold ? 1.03 : 1)
}

function wrapText(text, maxWidth, size, bold) {
  const result = []
  for (const rawLine of String(text ?? '').split('\n')) {
    const words = rawLine.trim().split(/\s+/).filter(Boolean)
    if (!words.length) {
      result.push('')
      continue
    }
    let current = words[0]
    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`
      if (measure(candidate, size, bold) <= maxWidth) {
        current = candidate
      } else {
        result.push(current)
        current = word
      }
    }
    result.push(current)
  }
  return result
}

function createLayout(reference) {
  const pages = []
  let lines = []
  let y = 0

  const newPage = () => {
    lines = []
    pages.push(lines)
    y = PAGE_HEIGHT - MARGIN_TOP
  }
  newPage()

  const ensure = (height) => {
    if (y - height < MARGIN_BOTTOM) newPage()
  }

  const pushLine = (text, x, size, bold, lineY = y) => {
    lines.push({ text, x, y: lineY, size, bold })
  }

  const line = (text, options = {}) => {
    const {
      x = MARGIN_X,
      size = 9.3,
      bold = false,
      leading = size * 1.42,
      gap = 0,
      center = false,
    } = options
    ensure(leading + gap)
    const drawX = center ? Math.max(MARGIN_X, (PAGE_WIDTH - measure(text, size, bold)) / 2) : x
    pushLine(text, drawX, size, bold)
    y -= leading + gap
  }

  const space = (amount = 6) => {
    y -= amount
    if (y < MARGIN_BOTTOM) newPage()
  }

  const paragraph = (text, options = {}) => {
    const { indent = 0, ...rest } = options
    const size = rest.size ?? 9.3
    const bold = rest.bold ?? false
    wrapText(text, CONTENT_WIDTH - indent, size, bold).forEach((part) => {
      line(part, { ...rest, x: MARGIN_X + indent })
    })
  }

  const row = (label, value, options = {}) => {
    const size = options.size ?? 9.3
    const labelWidth = options.labelWidth ?? 165
    const leading = size * 1.42
    ensure(leading)
    pushLine(label, MARGIN_X, size, true)
    pushLine(value, MARGIN_X + labelWidth, size, false)
    y -= leading
  }

  const clause = (number, body) => {
    const size = 9.3
    const indentWidth = 34
    const leading = size * 1.42
    wrapText(body, CONTENT_WIDTH - indentWidth, size, false).forEach((part, index) => {
      ensure(leading)
      if (index === 0) pushLine(number, MARGIN_X, size, true)
      pushLine(part, MARGIN_X + indentWidth, size, false)
      y -= leading
    })
  }

  return {
    line,
    space,
    paragraph,
    row,
    clause,
    finish() {
      pages.forEach((pageLines, index) => {
        const footer = `Agreement ${reference} - Page ${index + 1} of ${pages.length}`
        pageLines.push({
          text: footer,
          x: (PAGE_WIDTH - measure(footer, 8, false)) / 2,
          y: 28,
          size: 8,
          bold: false,
        })
      })
      return pages
    },
  }
}

function renderPdf(pages, title) {
  const objects = []
  const reserve = () => {
    objects.push(null)
    return objects.length
  }

  const catalogId = reserve()
  const pagesId = reserve()
  const infoId = reserve()
  const regularFontId = reserve()
  const boldFontId = reserve()

  objects[regularFontId] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objects[boldFontId] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  objects[infoId] = `<< /Title (${pdfText(title)}) /Producer (Car Rental ERP) >>`

  const contentIds = pages.map(() => reserve())
  const pageIds = pages.map(() => reserve())

  pages.forEach((pageLines, index) => {
    const operations = pageLines
      .map(
        (item) =>
          `BT /${item.bold ? 'F2' : 'F1'} ${item.size.toFixed(1)} Tf 0 0 0 rg 1 0 0 1 ${item.x.toFixed(
            2,
          )} ${item.y.toFixed(2)} Tm (${pdfText(item.text)}) Tj ET`,
      )
      .join('\n')

    objects[contentIds[index]] = `<< /Length ${operations.length} >>\nstream\n${operations}\nendstream`
    objects[pageIds[index]] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(
        2,
      )}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${
        contentIds[index]
      } 0 R >>`
  })

  objects[pagesId] = `<< /Type /Pages /Kids [${pageIds
    .map((id) => `${id} 0 R`)
    .join(' ')}] /Count ${pages.length} >>`
  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`

  let pdf = '%PDF-1.4\n'
  const offsets = []
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return pdf
}

function blank(value, dots = 14) {
  const text = String(value ?? '').trim()
  return text || '.'.repeat(dots)
}

function belowThousand(value) {
  const parts = []
  const hundreds = Math.floor(value / 100)
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`)
  const rest = value % 100
  if (rest < 20 && rest > 0) {
    parts.push(ONES[rest])
  } else if (rest >= 20) {
    const tens = Math.floor(rest / 10)
    const units = rest % 10
    parts.push(units ? `${TENS[tens]}-${ONES[units]}` : TENS[tens])
  }
  return parts.join(' and ')
}

function numberToWords(value) {
  const amount = Math.abs(Math.floor(Number(value) || 0))
  if (!amount) return 'Zero'
  const parts = []
  let remaining = amount
  for (const [scale, name] of [
    [1_000_000_000, 'Billion'],
    [1_000_000, 'Million'],
    [1_000, 'Thousand'],
  ]) {
    if (remaining >= scale) {
      parts.push(`${belowThousand(Math.floor(remaining / scale))} ${name}`)
      remaining %= scale
    }
  }
  if (remaining) parts.push(belowThousand(remaining))
  return parts.join(' ')
}

function amountInWords(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return ''
  const cents = Math.round(Math.abs(amount - Math.trunc(amount)) * 100)
  return `${numberToWords(amount)} and ${String(cents).padStart(2, '0')}/100`
}

function money(value, currency) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return ''
  const symbol = currencySymbol(currency)
  const prefix = /^[\x20-\x7E]+$/.test(symbol) ? symbol : `${currency || 'USD'} `
  return `${prefix}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function dateParts(value) {
  const date = toDate(value)
  if (!date) return { day: '', month: '', year: '', time: '', full: '' }
  const pad = (part) => String(part).padStart(2, '0')
  return {
    day: pad(date.getDate()),
    month: date.toLocaleString('en-GB', { month: 'long' }),
    year: String(date.getFullYear()),
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    full: formatDate(value),
  }
}

export function buildRentalAgreementPdf(rental, company, currency = 'USD') {
  const customer = rental?.customer || {}
  const car = rental?.car || {}
  const reference = rental?.reference || rental?.id || ''
  const effectiveDate = dateParts(rental?.created_at || rental?.pickup_at)
  const pickup = dateParts(rental?.pickup_at)
  const due = dateParts(rental?.expected_return_at)
  const days = Number(rental?.days) || 0
  const paid = Number(
    rental?.computed_paid ??
      (rental?.payments || []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
  )
  const total = Number(rental?.computed_total ?? rental?.total_amount ?? 0)
  const balance = Number(rental?.computed_balance ?? Math.max(0, total - paid))
  const lessorAddress = [company?.address, company?.city, company?.country].filter(Boolean).join(', ')

  const layout = createLayout(reference)
  const heading = (text) => layout.paragraph(text, { bold: true, gap: 2 })
  const clause = (number, text) => layout.clause(number, text)

  layout.line('CONTRACT FORM FOR VEHICLE HIRE', { size: 12, bold: true, center: true, gap: 4 })
  layout.paragraph(
    `This vehicle Lease Agreement (the "Agreement") is made and entered on ${blank(
      effectiveDate.full,
      16,
    )} (The "Effective Date") by and between:`,
  )
  layout.paragraph(blank(company?.name, 24), { bold: true })
  layout.paragraph(
    `Represented by ${blank(company?.representative_name, 20)}   I.D No. ${blank(
      company?.representative_id,
      18,
    )}`,
  )
  layout.paragraph('(The "Owner" and "Lessor")')
  layout.space(4)
  layout.paragraph('AND', { bold: true })
  layout.paragraph(`${blank(customer.full_name, 22)}   I.D No. ${blank(customer.id_number, 18)}`)
  layout.paragraph('(The "Lessee")')
  layout.space(4)
  layout.paragraph(
    'Subject to the terms and conditions of this agreement stated below, the parties hereby agree as follows:',
  )
  layout.space(4)

  heading('THE VEHICLE')
  layout.row('1.1  Type of vehicle', blank(car.category || car.type, 20))
  layout.row('1.2  Make and Colour', blank([car.make, car.color].filter(Boolean).join(' / '), 20))
  layout.row('1.3  Model', blank(car.model, 20))
  layout.row('1.4  Year', blank(car.year, 20))
  layout.row('1.5  Registration Number', blank(car.registration, 20))
  layout.space(7)

  heading('2. DISCLAIMER')
  clause(
    '2.1',
    'The vehicle is being leased "AS-IS OR VOETSTOOTS" and the Lessor shall not be liable for any defects, patent, latent or otherwise.',
  )
  clause(
    '2.2',
    'The lessee admits having inspected the vehicle to his satisfaction and that no guarantees or warranties of any nature were expressed or implied by the Lessor or his agent regarding its condition or quality.',
  )
  layout.space(7)

  heading('3. LEASE PERIOD')
  clause(
    '3.1',
    `The Lease shall commence on the ${blank(pickup.day, 3)} of ${blank(
      pickup.month,
      10,
    )} ${blank(pickup.year, 4)} @ ${blank(pickup.time, 6)} hrs and shall continue for a period of ${blank(
      days || '',
      3,
    )} day(s) up to ${blank(due.full, 16)} @ ${blank(due.time, 6)} hrs.`,
  )
  clause('3.2', `Away Extensions ${blank(rental?.away_extensions, 40)}`)
  layout.paragraph(blank('', 60))
  layout.paragraph(blank('', 60))
  layout.space(7)

  heading('4. USE OF VEHICLE')
  clause(
    '4.1',
    'The vehicle may not be used for any other purpose other than as agreed to by both parties, which agreement shall be reduced in writing by both parties. (See note 3 at the bottom by the Lessee regarding vehicle usage.)',
  )
  layout.space(7)

  heading('5. LOSS AND DAMAGE TO VEHICLE')
  clause(
    '5.1',
    'The Lessee is responsible for loss or damage to the vehicle and shall be responsible for making good such loss or damages emanating from negligence. THE LESSEE IS EXPECTED TO EXERCISE DUE CARE AND DILIGENCE.',
  )
  layout.space(7)

  heading('6. POSSESSION AND TRANSFER OF RISK')
  clause(
    '6.1',
    'The risk passes to the Lessee once the Lessee or his agent receives the keys to the car or takes possession of the vehicle.',
  )
  layout.space(7)

  heading('7. OBSERVANCE OF THE LAW')
  clause(
    '7.1',
    'The Lessee undertakes that all by-laws, statutory laws and regulations for the time being in force shall be duly observed, and specifically indemnifies the Lessor as a result of the contravention of such laws or regulations by the Lessee or his agent whatsoever. Where these by-laws, traffic laws or regulations are violated by the Lessee, any fines, penalties, or charges arising therefrom shall be payable by the Lessee, and the Lessee agrees to reimburse and settle such fines, penalties, or charges upon demand and sometimes retrospectively.',
  )
  layout.space(7)

  heading('8. LIABILITY')
  clause(
    '8.1',
    "The LESSOR shall not be liable to the LESSEE for any injury, loss or damage of any description which the LESSEE or any member of the lessee's family, any relative, friend or passenger of the LESSEE may sustain in the car even if sustained by reason of defects in the car. The LESSEE indemnifies the LESSOR and any of his agents against any claims arising out of such injury, loss or damage to any such persons. THE LESSEE WILL ALSO MEET THE INSURANCE EXCESS IN THE EVENT OF AN ACCIDENT AND CLAIM PROCESS.",
  )
  clause('8.2  FUEL', '8.2.1  The lessee is responsible for fuel of the vehicle.')
  layout.space(7)

  heading('9. LEASE RATE')
  clause(
    '9.1',
    `The involved parties have agreed a daily rate of ${blank(
      money(rental?.daily_rate, currency),
      12,
    )} per day. This rate comes with an average daily mileage of ${blank(
      rental?.expected_km_per_day != null ? formatNumber(rental.expected_km_per_day) : '',
      6,
    )} kilometers. An excess to the average daily mileage will attract an extra cost of ${money(
      0.25,
      currency,
    )} per kilometer. Excess hours are also chargeable at ${money(
      10,
      currency,
    )} per hour from the agreed return time.`,
  )
  layout.space(7)

  heading('10. WHOLE AGREEMENT')
  clause(
    '10.1',
    'This is the whole agreement between the parties and there have been no warranties, guarantees, representations or conditions precedent save as are specifically recorded in this agreement. No alterations or variations of this agreement shall be of any effect unless in writing and signed by both parties.',
  )
  layout.space(7)

  heading('11. DOMICILIA CITANDI ET EXECUTANDI')
  clause(
    '11.1',
    'For all the purposes of correspondence, statements and notices in connection with this agreement and any of the matters referred to herein for the service of any notices or legal process, the parties hereby choose the addresses set out hereunder to be their respective postal addresses and domicilia citandi et executandi:',
  )
  layout.space(7)

  layout.paragraph(`12. THE LESSOR: ${blank(company?.name, 24)}`, { bold: true })
  layout.paragraph(blank(lessorAddress, 36))
  layout.paragraph(`CELL: ${blank(company?.phone, 18)}`)
  layout.paragraph(blank('', 26))
  layout.space(4)

  layout.paragraph(`13. THE LESSEE: NAME: ${blank(customer.full_name, 22)}`, { bold: true })
  layout.paragraph(`ADDRESS: ${blank(customer.address, 30)}`)
  layout.paragraph(blank('', 55))
  layout.paragraph(`CELL NUMBER: ${blank(customer.phone, 18)}`)
  layout.paragraph(`BUSINESS ADDRESS: ${blank(customer.business_address, 30)}`)
  layout.paragraph(blank('', 50))
  layout.paragraph(`PHONE NUMBER: ${blank(customer.business_phone, 18)}`)
  layout.space(6)

  layout.paragraph(
    `Signed at ${blank(company?.city || company?.address, 20)} on this ${blank(
      pickup.day,
      3,
    )} day of ${blank(pickup.month, 10)} ${blank(pickup.year, 4)}`,
  )
  layout.space(6)

  layout.paragraph('14. WITNESSED BY:', { bold: true })
  layout.paragraph(blank('', 60))
  layout.paragraph(blank('', 60))
  layout.paragraph(blank('', 60))
  layout.paragraph(`SIGNATURE ${blank('', 25)}   CELL NO. ${blank('', 18)}`)
  layout.space(6)

  layout.paragraph(`15. NEXT OF KIN   NAME ${blank(customer.next_of_kin_name, 22)}`, { bold: true })
  layout.paragraph(`ADDRESS ${blank(customer.next_of_kin_address, 30)}`)
  layout.paragraph(blank('', 55))
  layout.paragraph(blank('', 55))
  layout.paragraph(`CELL NUMBERS: ${blank(customer.next_of_kin_phone, 18)}`)
  layout.space(6)

  layout.row(
    'Number of days Leased:',
    `In WORDS: ${blank(days ? numberToWords(days) : '', 30)}`,
    { labelWidth: 130 },
  )
  layout.row(
    'Opening Mileage:',
    `${blank(
      rental?.start_mileage != null ? `${formatNumber(rental.start_mileage)} km` : '',
      14,
    )}   Closing Mileage ${blank(
      rental?.end_mileage != null ? `${formatNumber(rental.end_mileage)} km` : '',
      14,
    )}`,
    { labelWidth: 130 },
  )
  layout.row(
    'Fuel Level:',
    blank(rental?.fuel_level ? fuelLevelLabel(rental.fuel_level, rental.fuel_bars) : '', 24),
    { labelWidth: 130 },
  )
  layout.row(
    'Amount Paid:',
    `${blank(money(paid, currency), 12)}   In WORDS ${blank(amountInWords(paid), 30)}`,
    { labelWidth: 130 },
  )
  layout.row(
    'BALANCE:',
    `${blank(money(balance, currency), 12)}   In WORDS ${blank(amountInWords(balance), 30)}`,
    { labelWidth: 130 },
  )
  layout.space(5)
  layout.paragraph(
    `Received By: ${blank(rental?.created_by_user?.full_name, 20)}   Signature ${blank(
      '',
      14,
    )}   Date ${blank('', 12)}`,
  )
  layout.paragraph('(Name)')
  layout.paragraph(
    `Paid In by: ${blank(customer.full_name, 20)}   Signature ${blank('', 14)}   Date ${blank(
      '',
      12,
    )}`,
  )
  layout.paragraph('(Name)')
  layout.space(7)

  layout.paragraph('NOTE 1 - Refundable Deposit', { bold: true })
  layout.paragraph(
    `The Lessee will pay an upfront refundable deposit of ${blank(
      rental?.deposit_amount ? money(rental.deposit_amount, currency) : '',
      12,
    )}. The amount is meant to cushion the Lessor from the probable abusive usage of the vehicle by the Lessee. This amount is refundable in full on the condition that the vehicle is returned and inspected to the satisfaction of the Lessor. If any damages are recorded, the deposit will be used to make good such damages.`,
  )
  layout.space(5)

  layout.paragraph('NOTE 2 - Cleaning the Vehicle', { bold: true })
  layout.paragraph(
    'Every effort is made to have the vehicle cleaned before it is leased out. The vehicle should be cleaned before return. Failure to do so will result in withholding of $5 from the refundable deposit discussed above in note 1.',
  )
  layout.space(5)

  layout.paragraph('NOTE 3 - Vehicle Usage by Lessee', { bold: true })
  layout.paragraph(blank(rental?.notes, 95))
  layout.paragraph(blank('', 95))
  layout.space(8)
  layout.paragraph(`Signature ${blank('', 45)}   Date ${blank('', 20)}`)
  layout.paragraph('(Lessee)')
  layout.paragraph("NB: ATTACH PHOTOCOPY OF DRIVER'S LICENCE AND NATIONAL ID TO THIS FORM.")

  return new Blob([renderPdf(layout.finish(), `Vehicle hire agreement ${reference}`)], {
    type: 'application/pdf',
  })
}

export function agreementFileName(rental) {
  const reference = rental?.reference || rental?.id || 'rental'
  return `vehicle-hire-agreement-${String(reference).replace(/[^a-z0-9-_]+/gi, '-')}.pdf`
}

export function downloadRentalAgreement(rental, company, currency) {
  const url = URL.createObjectURL(buildRentalAgreementPdf(rental, company, currency))
  const link = document.createElement('a')
  link.href = url
  link.download = agreementFileName(rental)
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function printRentalAgreement(rental, company, currency) {
  const url = URL.createObjectURL(buildRentalAgreementPdf(rental, company, currency))
  const viewer = window.open(url, '_blank')
  if (!viewer) {
    URL.revokeObjectURL(url)
    return false
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}
