/**
 * Outgoing mail (nodemailer over Gmail).
 *
 * Credentials live in the server's environment (`MAIL_USER` /
 * `MAIL_APP_PASSWORD`) and never reach the browser: this module is imported by
 * `api/`, which passes a handle to the Neon repository.
 *
 * Mail failure never fails the request that triggered it. A confirmation link
 * that could not be delivered is returned to the caller instead, and a reset
 * code that could not be delivered is logged — otherwise a flaky SMTP relay
 * would take account creation down with it.
 */

import nodemailer from 'nodemailer'

/** Public origin used to build absolute links inside emails. */
export function appOrigin() {
  const explicit = process.env.APP_URL
  if (explicit) return String(explicit).trim().replace(/\/+$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:5173'
}

/**
 * Whether mail can be sent right now. `MAILER_DISABLE` exists so the
 * verification scripts can exercise the auth flows without putting real
 * messages in a real inbox.
 */
export function mailEnabled() {
  if (process.env.MAILER_DISABLE === 'true') return false
  return Boolean(process.env.MAIL_USER && process.env.MAIL_APP_PASSWORD)
}

let transport = null

function transporter() {
  if (!mailEnabled()) return null
  if (!transport) {
    transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_APP_PASSWORD },
    })
  }
  return transport
}

/**
 * Branded shell every message sits in. Deliberately inline-styled: mail
 * clients strip stylesheets and most of the modern CSS the app itself uses.
 */
function layout({ preheader, heading, body, action, note, footer }) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f5f8;font-family:Arial,Helvetica,sans-serif;color:#1a1d26;">
    <p style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #e4e7ee;overflow:hidden;">
          <tr><td style="background:#1f45eb;padding:18px 24px;">
            <span style="font-size:15px;font-weight:bold;color:#ffffff;">VNexus 360</span>
          </td></tr>
          <tr><td style="padding:26px 24px 8px;">
            <h1 style="margin:0;font-size:20px;line-height:1.3;">${heading}</h1>
          </td></tr>
          <tr><td style="padding:0 24px;font-size:14px;line-height:1.6;color:#3c4354;">${body}</td></tr>
          ${
            action
              ? `<tr><td align="center" style="padding:22px 24px 6px;">
                  <a href="${action.href}" style="display:inline-block;background:#1f45eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 22px;border-radius:8px;">${action.label}</a>
                </td></tr>`
              : ''
          }
          ${note ? `<tr><td style="padding:14px 24px 0;font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">${note}</td></tr>` : ''}
          <tr><td style="padding:22px 24px 26px;font-size:12px;line-height:1.6;color:#6b7280;">
            ${footer}
          </td></tr>
        </table>
        <p style="font-size:15px;font-weight:bold;color:#1f45eb;margin-top:18px;text-align:center;">Powered by Skyro Consultancy</p>
        <p style="font-size:13px;font-weight:600;color:#3165f6;margin-top:4px;text-align:center;">A member of Disafrika Group</p>
      </td></tr>
    </table>
  </body>
</html>`
}

/** Adds a new account's owner to the app. Returns true when it reached SMTP. */
export async function sendConfirmationMail({ to, name, company, token }) {
  const send = transporter()
  if (!send) return false
  const link = `${appOrigin()}/confirm-email?token=${encodeURIComponent(token)}`
  try {
    await send.sendMail({
      from: `"VNexus 360" <${process.env.MAIL_USER}>`,
      to,
      subject: `Confirm your car rental — ${company}`,
      text: [
        `Hi ${name},`,
        '',
        `Your ${company} account is ready. Confirm your email address to sign in.`,
        '',
        link,
        '',
        'The link expires in 24 hours and can only be used once. If you did not create this account you can ignore this email.',
      ].join('\n'),
      html: layout({
        preheader: 'Confirm your email address to finish setting up your car rental.',
        heading: 'Confirm your email address',
        body: `<p style="margin:0 0 12px;">Hi ${name},</p>
               <p style="margin:0;">Your <strong>${company}</strong> account is ready. Confirm your email address to sign in to the app.</p>`,
        action: { href: link, label: 'Confirm and sign in' },
        note: 'This link expires in 24 hours and can only be used once.',
        footer: 'If you did not create this account you can safely ignore this message.',
      }),
    })
    return true
  } catch (error) {
    console.error('[mail] confirmation email failed', error?.message)
    return false
  }
}

/** Sends the six digit code that unlocks a password reset. */
export async function sendResetCodeMail({ to, name, code }) {
  const send = transporter()
  if (!send) return false
  try {
    await send.sendMail({
      from: `"VNexus 360" <${process.env.MAIL_USER}>`,
      to,
      subject: `Your reset code: ${code}`,
      text: [
        `Hi ${name},`,
        '',
        'Use this code to reset your password:',
        '',
        `   ${code}`,
        '',
        'The code expires in 10 minutes and can only be used once. If you did not ask for it you can ignore this email.',
      ].join('\n'),
      html: layout({
        preheader: `Your password reset code is ${code}`,
        heading: 'Reset your password',
        body: `<p style="margin:0 0 14px;">Hi ${name},</p>
               <p style="margin:0 0 10px;">Enter this code to choose a new password:</p>
               <p style="margin:0;letter-spacing:6px;font-size:30px;font-weight:bold;color:#1f45eb;">${code}</p>`,
        action: null,
        note: 'The code expires in 10 minutes and can only be used once.',
        footer: 'If you did not ask for this code you can safely ignore this message.',
      }),
    })
    return true
  } catch (error) {
    console.error('[mail] reset code email failed', error?.message)
    return false
  }
}

/**
 * Sends the six digit code a new staff member uses to choose their own
 * password the first time they sign in.
 */
export async function sendMemberSetupMail({ to, name, code }) {
  const send = transporter()
  if (!send) return false
  try {
    await send.sendMail({
      from: `"VNexus 360" <${process.env.MAIL_USER}>`,
      to,
      subject: `Set up your account: ${code}`,
      text: [
        `Hi ${name},`,
        '',
        'Your account has been created. Use this code to set your password and sign in:',
        '',
        `   ${code}`,
        '',
        'The code expires in 10 minutes and can only be used once. If you were not expecting this you can ignore this email.',
      ].join('\n'),
      html: layout({
        preheader: `Your account setup code is ${code}`,
        heading: 'Set up your account',
        body: `<p style="margin:0 0 14px;">Hi ${name},</p>
               <p style="margin:0 0 10px;">Your account has been created. Enter this code to choose your password and sign in:</p>
               <p style="margin:0;letter-spacing:6px;font-size:30px;font-weight:bold;color:#1f45eb;">${code}</p>`,
        action: null,
        note: 'The code expires in 10 minutes and can only be used once.',
        footer: 'If you were not expecting this account you can safely ignore this message.',
      }),
    })
    return true
  } catch (error) {
    console.error('[mail] member setup email failed', error?.message)
    return false
  }
}

/**
 * Sends the six digit code a new company owner uses to prove their email
 * address before choosing their password and going on to payment.
 */
export async function sendCompanySetupMail({ to, name, company, code }) {
  const send = transporter()
  if (!send) return false
  try {
    await send.sendMail({
      from: `"VNexus 360" <${process.env.MAIL_USER}>`,
      to,
      subject: `Confirm your email: ${code}`,
      text: [
        `Hi ${name},`,
        '',
        `Use this code to confirm your email address and choose a password for ${company || 'your car rental'}:`,
        '',
        `   ${code}`,
        '',
        'The code expires in 10 minutes and can only be used once. If you were not expecting this you can ignore this email.',
      ].join('\n'),
      html: layout({
        preheader: `Your email confirmation code is ${code}`,
        heading: 'Confirm your email address',
        body: `<p style="margin:0 0 14px;">Hi ${name},</p>
               <p style="margin:0 0 10px;">Use this code to confirm your email address and choose a password for <strong>${company || 'your car rental'}</strong>:</p>
               <p style="margin:0;letter-spacing:6px;font-size:30px;font-weight:bold;color:#1f45eb;">${code}</p>`,
        action: null,
        note: 'The code expires in 10 minutes and can only be used once.',
        footer: 'If you were not expecting this email you can safely ignore it.',
      }),
    })
    return true
  } catch (error) {
    console.error('[mail] company setup email failed', error?.message)
    return false
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDay(value) {
  if (!value) return 'unknown date'
  const text = String(value)
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function licencePhrase(days) {
  const count = Number(days)
  if (!Number.isFinite(count)) return 'expiry soon'
  if (count < 0) {
    return `expired ${Math.abs(count)} day${Math.abs(count) === 1 ? '' : 's'} ago`
  }
  if (count === 0) return 'expires today'
  return `${count} day${count === 1 ? '' : 's'} left`
}

function duePhrase(days) {
  const count = Number(days)
  if (!Number.isFinite(count)) return 'due soon'
  if (count < 0) return `overdue by ${Math.abs(count)} day${Math.abs(count) === 1 ? '' : 's'}`
  if (count === 0) return 'due today'
  return `due in ${count} day${count === 1 ? '' : 's'}`
}

/**
 * Daily fleet reminder. One message per company lists every vehicle whose
 * Zinara licence or scheduled service is inside the five-day warning window.
 * The caller only invokes this after confirming the company has an admin email.
 */
export async function sendFleetReminderMail({ to, company, licenses = [], maintenance = [] }) {
  const send = transporter()
  if (!send) return false
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!recipients.length) return false

  const kinds = []
  if (licenses.length) kinds.push('licence')
  if (maintenance.length) kinds.push('maintenance')
  const subject = `Action needed: ${kinds.join(' and ')} reminder — ${company}`

  const licenceLines = licenses.map(
    (car) =>
      `${car.registration} — ${car.make} ${car.model}: licence expires ${formatDay(car.license_valid_to)} (${licencePhrase(car.license_days_left)})`,
  )
  const maintenanceLines = maintenance.map(
    (car) =>
      `${car.registration} — ${car.make} ${car.model}: service ${formatDay(car.maintenance_due_on)} (${duePhrase(car.maintenance_days_left)})`,
  )

  const section = (title, lines) =>
    lines.length
      ? `<h2 style="margin:18px 0 8px;font-size:15px;">${title}</h2>
         <ul style="margin:0;padding-left:20px;">
           ${lines
             .map((line) => `<li style="margin:0 0 6px;">${escapeHtml(line)}</li>`)
             .join('')}
         </ul>`
      : ''

  try {
    await send.sendMail({
      from: `"VNexus 360" <${process.env.MAIL_USER}>`,
      to: recipients.join(', '),
      subject,
      text: [
        `Hello ${company},`,
        '',
        'The following vehicles need attention:',
        '',
        ...(licenceLines.length ? ['LICENCES', ...licenceLines.map((line) => `- ${line}`), ''] : []),
        ...(maintenanceLines.length
          ? ['MAINTENANCE', ...maintenanceLines.map((line) => `- ${line}`), '']
          : []),
        `Open the fleet page: ${appOrigin()}/app/fleet`,
        '',
        'This reminder is sent once per due date. Update the vehicle record after renewing or servicing it.',
      ].join('\n'),
      html: layout({
        preheader: `${kinds.join(' and ')} reminders for ${licenses.length + maintenance.length} vehicle(s).`,
        heading: 'Fleet reminders',
        body: `<p style="margin:0 0 12px;">Hello <strong>${escapeHtml(company)}</strong>,</p>
               <p style="margin:0;">The following vehicles need attention:</p>
               ${section('Licences', licenceLines)}
               ${section('Scheduled maintenance', maintenanceLines)}`,
        action: { href: `${appOrigin()}/app/fleet`, label: 'Open fleet' },
        note: 'This reminder is sent once per due date.',
        footer:
          'Update the vehicle record after renewing the licence or completing the service so the next reminder is scheduled correctly.',
      }),
    })
    return true
  } catch (error) {
    console.error('[mail] fleet reminder email failed', error?.message)
    return false
  }
}

/** Handle passed to the Neon repository. A missing handle simply means no mail. */
export const mail = {
  enabled: mailEnabled,
  confirmation: sendConfirmationMail,
  resetCode: sendResetCodeMail,
  memberSetupCode: sendMemberSetupMail,
  companySetupCode: sendCompanySetupMail,
  fleetReminder: sendFleetReminderMail,
}
