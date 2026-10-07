import { buildSeed } from './seed'

const STORAGE_KEY = 'carrental.db.v1'
const EVENT_NAME = 'carrental:db-change'

let cache = null
let loading = null

function emit() {
  window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

export function onDatabaseChange(handler) {
  window.addEventListener(EVENT_NAME, handler)
  return () => window.removeEventListener(EVENT_NAME, handler)
}

export function getSnapshot() {
  return cache
}

export function hydrateDatabase(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.companies) || !Array.isArray(snapshot.users)) {
    throw new Error('The server returned an invalid offline data snapshot.')
  }
  cache = structuredClone(snapshot)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  emit()
  return cache
}

export function hasStoredDatabase() {
  return Boolean(localStorage.getItem(STORAGE_KEY))
}

export async function loadDatabase({ force = false } = {}) {
  if (cache && !force) return cache
  if (loading) return loading

  loading = (async () => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        cache = JSON.parse(raw)
        return cache
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    cache = await buildSeed()
    persist()
    return cache
  })()

  try {
    return await loading
  } finally {
    loading = null
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  emit()
}

export function commit() {
  persist()
  return cache
}

export async function resetDatabase() {
  localStorage.removeItem(STORAGE_KEY)
  cache = null
  const fresh = await loadDatabase({ force: true })
  emit()
  return fresh
}

export function exportDatabase() {
  return JSON.parse(JSON.stringify(cache))
}