import { OPERATIONS, groupOf, methodOf } from '../operations'
import {
  getOfflineAccount,
  hasOfflineData,
  invokeOffline,
  isOfflineMutation,
  readOutbox,
  removeOutboxItem,
  restorePendingOfflineChanges,
  saveOfflineSnapshot,
  updateOutboxItem,
} from '../offline/local'

/**
 * HTTP data source: the browser's view of the repository.
 *
 * The shape it returns is generated from `OPERATIONS`, which is the same
 * manifest the API authorises against. A method the UI calls must therefore
 * exist on both sides by construction, and the client holds no database
 * credential and no session-signing key - only an `httpOnly` cookie the
 * browser attaches on its own.
 */

const ENDPOINT = '/api/data'

/** Server errors carry a message worth showing; transport errors get a generic one. */
export class ApiRequestError extends Error {
  constructor(message, status, payload = null) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.payload = payload
  }
}

async function send(operation, args, sync = null) {
  let response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation, args, ...(sync ? { sync } : {}) }),
    })
  } catch {
    throw new ApiRequestError(
      'Could not reach the server. Check your connection and try again.',
      0,
    )
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new ApiRequestError(
      payload?.error || 'The request could not be completed.',
      response.status,
      payload,
    )
  }
  return payload?.data ?? null
}

function argsWithIds(operation, args) {
  const prepared = structuredClone(args)
  if (operation.endsWith('.create') && prepared[0] && typeof prepared[0] === 'object') {
    prepared[0].id ||= crypto.randomUUID()
  }
  return prepared
}

let syncing = false
let snapshotTimer = null

function entityKey(item) {
  const [group] = item.operation.split('.')
  const id = item.args[0]?.id || item.args[0]
  return `${group}:${id}`
}

export async function syncPendingOfflineChanges() {
  if (!navigator.onLine || syncing) return
  syncing = true
  const versions = new Map()
  try {
    let changed = false
    for (const item of readOutbox()) {
      if (item.status !== 'pending') continue
      try {
        const key = entityKey(item)
        const baseVersion = versions.has(key) ? versions.get(key) : item.baseVersion
        const result = await send(item.operation, item.args, {
          mutationId: item.id,
          baseVersion,
        })
        removeOutboxItem(item.id)
        changed = true
        if (result?.updated_at) versions.set(key, result.updated_at)
      } catch (error) {
        if (error.status === 409) {
          updateOutboxItem(item.id, {
            status: 'conflict',
            message: 'This record changed on the server while this device was offline.',
            remote: error.payload?.conflict?.remote ?? null,
          })
        } else if (error.status === 0) {
          return
        } else {
          updateOutboxItem(item.id, {
            status: 'failed',
            message: error.message,
          })
        }
      }
    }
    if (changed) await refreshOfflineSnapshot()
  } finally {
    syncing = false
  }
}

async function refreshOfflineSnapshot() {
  const companyId = getOfflineAccount()?.company?.id
  if (!companyId || !hasOfflineData()) return
  const snapshot = await send('offline.snapshot', [companyId])
  saveOfflineSnapshot(snapshot)
  await restorePendingOfflineChanges()
}

function scheduleSnapshotRefresh() {
  clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(() => {
    refreshOfflineSnapshot().catch((error) =>
      console.error('[offline] could not refresh the local company cache', error),
    )
  }, 1500)
}

async function sendForSync(item, force) {
  const account = getOfflineAccount()
  if (!account?.user || account.user.role !== 'admin') {
    throw new Error('An admin must be signed in to resolve this conflict.')
  }
  const data = await send(item.operation, item.args, {
    mutationId: item.id,
    baseVersion: item.remote?.updated_at ?? null,
    force,
  })
  removeOutboxItem(item.id)
  await refreshOfflineSnapshot()
  return data
}

export async function resolveOfflineChange(item, keepOfflineVersion) {
  if (keepOfflineVersion) return sendForSync(item, true)
  removeOutboxItem(item.id)
  await refreshOfflineSnapshot()
  return null
}

export function createApiRepository() {
  const repo = {
    mode: 'api',
    onChange() {
      return () => {}
    },
    // Demo tooling has no meaning against a live database.
    async resetDemoData() {
      throw new Error('Demo data cannot be reset once a live database is connected.')
    },
    async importDemoData() {
      throw new Error('Demo data import is only available in demo mode.')
    },
    async bootstrap(companyId) {
      const snapshot = await send('offline.snapshot', [companyId])
      saveOfflineSnapshot(snapshot)
      await restorePendingOfflineChanges()
      return true
    },
    exportData() {
      throw new Error('Raw exports are only available in demo mode.')
    },
  }

  for (const operation of Object.keys(OPERATIONS)) {
    const group = groupOf(operation)
    const method = methodOf(operation)
    const call = async (...inputArgs) => {
      const args = argsWithIds(operation, inputArgs)
      if (!navigator.onLine) {
        return invokeOffline(operation, args, { queue: isOfflineMutation(operation) })
      }
      try {
        const result = await send(operation, args)
        if (operation === 'offline.snapshot' && result) {
          saveOfflineSnapshot(result)
          await restorePendingOfflineChanges()
        }
        if (isOfflineMutation(operation)) scheduleSnapshotRefresh()
        return result
      } catch (error) {
        if (error.status !== 0) throw error
        return invokeOffline(operation, args, { queue: isOfflineMutation(operation) })
      }
    }
    if (!group) {
      repo[method] = call
    } else {
      repo[group] = repo[group] || {}
      repo[group][method] = call
    }
  }

  return repo
}