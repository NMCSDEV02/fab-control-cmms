import type { OperatorActionDetailData, OperatorQrContextData } from '../../types/api'
import type { OperatorAction } from '../../types/operator'

type CacheRecord<T> = {
  key: string
  value: T
  savedAt: number
}

const DB_NAME = 'fab-control-operator-cache'
const DB_VERSION = 1
const STORE = 'records'
const ACTIONS_KEY = 'operator-actions'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function writeRecord<T>(key: string, value: T): Promise<void> {
  if (!('indexedDB' in window)) return
  try {
    const database = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put({ key, value, savedAt: Date.now() } satisfies CacheRecord<T>)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  } catch {
    // Cache é uma otimização. A operação online continua normalmente.
  }
}

async function readRecord<T>(key: string): Promise<T | null> {
  if (!('indexedDB' in window)) return null
  try {
    const database = await openDatabase()
    const record = await new Promise<CacheRecord<T> | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly')
      const request = transaction.objectStore(STORE).get(key)
      request.onsuccess = () => resolve(request.result as CacheRecord<T> | undefined)
      request.onerror = () => reject(request.error)
    })
    database.close()
    if (!record || Date.now() - record.savedAt > MAX_AGE_MS) return null
    return record.value
  } catch {
    return null
  }
}

async function deleteRecord(key: string): Promise<void> {
  if (!('indexedDB' in window)) return
  try {
    const database = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).delete(key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  } catch {
    // Sem impacto operacional.
  }
}

export function readActionsCache(): Promise<OperatorAction[] | null> {
  return readRecord<OperatorAction[]>(ACTIONS_KEY)
}

export function writeActionsCache(actions: OperatorAction[]): Promise<void> {
  return writeRecord(ACTIONS_KEY, actions)
}

export function readActionDetailCache(actionId: string): Promise<OperatorActionDetailData | null> {
  return readRecord<OperatorActionDetailData>(`action-detail:${actionId}`)
}

export function writeActionDetailCache(actionId: string, detail: OperatorActionDetailData): Promise<void> {
  return writeRecord(`action-detail:${actionId}`, detail)
}

export function removeActionDetailCache(actionId: string): Promise<void> {
  return deleteRecord(`action-detail:${actionId}`)
}

export function readQrContextCache(qrPayload: string): Promise<OperatorQrContextData | null> {
  return readRecord<OperatorQrContextData>(`qr-context:${qrPayload.trim().toUpperCase()}`)
}

export function writeQrContextCache(qrPayload: string, context: OperatorQrContextData): Promise<void> {
  return writeRecord(`qr-context:${qrPayload.trim().toUpperCase()}`, context)
}

export async function clearOperatorCache(): Promise<void> {
  if (!('indexedDB' in window)) return
  await new Promise<void>((resolve) => {
    const request = window.indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}
