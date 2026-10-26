/**
 * Commercial terms for a new car rental company.
 *
 * These values are shown on the setup confirmation screen and in the message a
 * pending owner sees when they try to sign in. They are also written into the
 * company row when it is created, so the super admin dashboard has the terms
 * that applied at signup even if these defaults change later.
 */

export const INITIAL_FEE = 250
export const MONTHLY_SUBSCRIPTION_FEE = 7.5
export const PLATFORM_CURRENCY = 'USD'

export const SUPPORT_PHONES = [
  '+263 788 031 274',
  '+263 715 484 082',
  '+263 782 235 442',
]

export const SUPPORT_PHONE_LINKS = [
  { label: '+263 788 031 274', tel: '+263788031274' },
  { label: '+263 715 484 082', tel: '+263715484082' },
  { label: '+263 782 235 442', tel: '+263782235442' },
]

export const SUPPORT_PHONE_TEXT = SUPPORT_PHONES.join(' or ')

export const INITIAL_FEE_TEXT = `$${INITIAL_FEE}`
export const MONTHLY_FEE_TEXT = `$${MONTHLY_SUBSCRIPTION_FEE.toFixed(2)}`

export const APPROVAL_TERMS = `${INITIAL_FEE_TEXT} once-off and ${MONTHLY_FEE_TEXT} per month for system maintenance`

/**
 * The message shown to an owner whose company is not yet approved.
 *
 * `status` is the company's `approval_status`; anything other than `approved`
 * is blocked, and rejected/suspended get wording that matches their state.
 */
export function approvalMessage(status = 'pending') {
  if (status === 'rejected') {
    return (
      `Your company registration was not approved. Please contact the super admin on ` +
      `${SUPPORT_PHONE_TEXT} to resolve this.`
    )
  }
  if (status === 'suspended') {
    return (
      `Your company account is suspended. Please contact the super admin on ` +
      `${SUPPORT_PHONE_TEXT} to restore access.`
    )
  }
  return (
    `Your company is awaiting super admin approval. The initial fee is ${INITIAL_FEE_TEXT} ` +
    `(once-off) and the subscription is ${MONTHLY_FEE_TEXT} per month for system maintenance. ` +
    `Please contact the super admin on ${SUPPORT_PHONE_TEXT} for approval.`
  )
}
