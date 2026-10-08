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

/** Handle passed to the Neon repository. A missing handle simply means no mail. */
export const mail = {
  enabled: mailEnabled,
  confirmation: sendConfirmationMail,
  resetCode: sendResetCodeMail,
}
