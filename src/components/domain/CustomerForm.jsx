import { useState } from 'react'
import { Info } from 'lucide-react'
import { Alert, Button, Field, Input, Modal, Textarea } from '@/components/ui'

export const EMPTY_CUSTOMER = {
  full_name: '',
  phone: '',
  email: '',
  id_number: '',
  driver_license: '',
  address: '',
  notes: '',
}

/** Validates a customer payload; returns `{ field: message }` for invalid entries. */
export function validateCustomer(values) {
  const errors = {}
  if (!values.full_name?.trim()) errors.full_name = 'Customer name is required.'
  if (!values.phone?.trim() && !values.email?.trim()) {
    errors.phone = 'Provide at least a phone number or an email address.'
  }
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Enter a valid email address.'
  }
  if (values.phone && !/^[+()\-\s\d]{6,20}$/.test(values.phone)) {
    errors.phone = 'Enter a valid phone number.'
  }
  return errors
}

export function CustomerFields({ values, errors = {}, onChange, idPrefix = 'customer' }) {
  const set = (field) => (event) => onChange({ ...values, [field]: event.target.value })

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" required error={errors.full_name} className="sm:col-span-2">
        <Input
          id={`${idPrefix}-name`}
          value={values.full_name}
          onChange={set('full_name')}
          placeholder="Grace Mutasa"
          invalid={Boolean(errors.full_name)}
        />
      </Field>
      <Field label="Phone number" error={errors.phone}>
        <Input
          id={`${idPrefix}-phone`}
          type="tel"
          value={values.phone}
          onChange={set('phone')}
          placeholder="+263 771 000 000"
          invalid={Boolean(errors.phone)}
        />
      </Field>
      <Field label="Email address" error={errors.email}>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={values.email}
          onChange={set('email')}
          placeholder="grace@example.com"
          invalid={Boolean(errors.email)}
        />
      </Field>
      <Field label="ID / Passport number" hint="Used for driver verification.">
        <Input
          id={`${idPrefix}-id`}
          value={values.id_number}
          onChange={set('id_number')}
          placeholder="63-0712345 A"
        />
      </Field>
      <Field label="Driver's licence number" hint="Required before handing over the keys.">
        <Input
          id={`${idPrefix}-licence`}
          value={values.driver_license}
          onChange={set('driver_license')}
          placeholder="DL-88213"
        />
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <Textarea
          id={`${idPrefix}-address`}
          rows={2}
          value={values.address}
          onChange={set('address')}
        />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea
          id={`${idPrefix}-notes`}
          rows={2}
          value={values.notes}
          onChange={set('notes')}
          placeholder="Corporate account, invoiced monthly…"
        />
      </Field>
    </div>
  )
}

export function CustomerFormModal({ open, onClose, onSubmit, title = 'Add customer' }) {
  const [values, setValues] = useState(EMPTY_CUSTOMER)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState(null)

  const close = () => {
    setValues(EMPTY_CUSTOMER)
    setErrors({})
    setServerError(null)
    onClose()
  }

  const submit = async (event) => {
    event.preventDefault()
    const found = validateCustomer(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setBusy(true)
    setServerError(null)
    try {
      await onSubmit(values)
      close()
    } catch (cause) {
      setServerError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title={title} size="lg">
      <form onSubmit={submit} className="space-y-4">
        {serverError && (
          <Alert tone="danger" icon={Info}>
            {serverError}
          </Alert>
        )}
        <CustomerFields values={values} errors={errors} onChange={setValues} idPrefix="new-customer" />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save customer
          </Button>
        </div>
      </form>
    </Modal>
  )
}