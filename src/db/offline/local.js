import { hasStoredDatabase, hydrateDatabase } from '../mock/store'

const ACCOUNT_KEY = 'rentflow.offline.account.v1'
const OUTBOX_KEY = 'rentflow.offline.outbox.v1'
const STATUS_EVENT = 'rentflow:offline-status'
const MUTATIONS = new Set([
  'cars.create',
  'cars.update',
  'cars.remove',
  'cars.renewLicense',
  'customers.create',
  'customers.update',
  'customers.remove',
  'rentals.create',
  'rentals.update',
  'rentals.returnCar',
  'rentals.cancel',
  'rentals.remove',
  'payments.create',
  'payments.remove',
])

let localRepositoryPromise = null

function emitStatus() {
  window.dispatchEvent(new CustomEvent(STATUS_EVENT))
}

function readJson(key, fallback) {
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch (cause) {
    throw new Error(`Offline data could not be read (${key}). Clear this device's offline data and sign in again.`, {
      cause,
    })
  }
}

export function saveOfflineAccount(account) {
  if (!account?.user?.id || !account?.company?.id) return
  const { password_hash, ...user } = account.user
  void password_hash
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ user, company: account.company }))
}

export function getOfflineAccount() {
  return readJson(ACCOUNT_KEY, null)
}

export function clearOfflineAccount() {
  localStorage.removeItem(ACCOUNT_KEY)
  emitStatus()
}

export function saveOfflineSnapshot(snapshot) {
  if (!snapshot?.companies?.length) return false
  hydrateDatabase(snapshot)
  localRepositoryPromise = null
  localStorage.setItem('rentflow.offline.snapshotAt', snapshot.seeded_at || new Date().toISOString())
  emitStatus()
  return true
}

export function hasOfflineData() {
  return hasStoredDatabase()
}

export function readOutbox() {
  const value = readJson(OUTBOX_KEY, [])
  if (!Array.isArray(value)) throw new Error('The offline sync queue is invalid.')
  return value
}

function writeOutbox(items) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items))
  emitStatus()
}

export function offlineStatus() {
  const items = readOutbox()
  return {
    online: navigator.onLine,
    pending: items.filter((item) => item.status === 'pending').length,
    conflicts: items.filter((item) => item.status === 'conflict').length,
    failed: items.filter((item) => item.status === 'failed').length,
    lastUpdated: localStorage.getItem('rentflow.offline.snapshotAt'),
  }
}

export function subscribeOfflineStatus(handler) {
  window.addEventListener(STATUS_EVENT, handler)
  window.addEventListener('online', handler)
  window.addEventListener('offline', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(STATUS_EVENT, handler)
    window.removeEventListener('online', handler)
    window.removeEventListener('offline', handler)
    window.removeEventListener('storage', handler)
  }
}

async function localRepository() {
  if (!hasOfflineData()) {
    throw new Error('Offline data is not ready on this device. Connect to the internet once to load your company data.')
  }
  if (!localRepositoryPromise) {
    localRepositoryPromise = import('../mock/repo.mock').then(({ createMockRepository }) =>
      createMockRepository(),
    )
  }
  return localRepositoryPromise
}

function partsFor(operation, repository) {
  const dot = operation.indexOf('.')
  const group = dot === -1 ? '' : operation.slice(0, dot)
  const method = dot === -1 ? operation : operation.slice(dot + 1)
  const target = group ? repository[group] : repository
  const fn = target?.[method]
  if (typeof fn !== 'function') throw new Error(`Offline operation ${operation} is not available.`)
  return { target, fn }
}

function targetRecord(operation, args, repository) {
  const [id, options] = args
  const [group, method] = operation.split('.')
  if (method === 'create') return Promise.resolve(null)
  if (group === 'cars' || group === 'customers') return repository[group].get(id)
  if (group === 'rentals') return repository.rentals.get(id, options)
  if (group === 'payments') {
    const companyId = getOfflineAccount()?.company?.id
    return repository.payments
      .list({ companyId })
      .then((items) => items.find((item) => item.id === id) || null)
  }
  return Promise.resolve(null)
}

export async function invokeOffline(operation, args, { queue = false, syncMeta = null } = {}) {
  const repository = await localRepository()
  const { target, fn } = partsFor(operation, repository)
  if (!queue) return fn.apply(target, args)
  if (!MUTATIONS.has(operation)) {
    throw new Error('This action requires an internet connection and was not saved.')
  }

  const before = await targetRecord(operation, args, repository)
  const item = {
    id: syncMeta?.mutationId || crypto.randomUUID(),
    operation,
    args,
    baseVersion: syncMeta?.baseVersion ?? before?.updated_at ?? null,
    createdAt: new Date().toISOString(),
    status: 'pending',
    message: null,
  }
  const outbox = readOutbox()
  outbox.push(item)
  writeOutbox(outbox)
  try {
    const result = await fn.apply(target, args)
    if (operation === 'rentals.create' && result?.reference) {
      updateOutboxItem(item.id, { args: [{ ...args[0], reference: result.reference }, ...args.slice(1)] })
    }
    return result
  } catch (error) {
    writeOutbox(readOutbox().filter((queued) => queued.id !== item.id))
    throw error
  }
}

export async function restorePendingOfflineChanges() {
  for (const item of readOutbox()) {
    if (!['pending', 'conflict', 'failed'].includes(item.status)) continue
    try {
      await invokeOffline(item.operation, item.args)
    } catch (error) {
      console.error(`[offline] could not restore queued ${item.operation}`, error)
    }
  }
}

export function updateOutboxItem(id, update) {
  writeOutbox(readOutbox().map((item) => (item.id === id ? { ...item, ...update } : item)))
}

export function removeOutboxItem(id) {
  writeOutbox(readOutbox().filter((item) => item.id !== id))
}

export function retryOutboxItem(id) {
  updateOutboxItem(id, { status: 'pending', message: null, remote: null })
}

export function isOfflineMutation(operation) {
  return MUTATIONS.has(operation)
}
