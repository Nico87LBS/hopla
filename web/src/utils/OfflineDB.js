import { isOfflineFeatureEnabled } from './OfflineFeatureToggle'

const IDB_NAME = 'hopla_offline'
const IDB_VERSION = 2

// ── IndexedDB backend ──
class IndexedDBBackend {
  constructor() {
    this.db = null
    this.initialized = false
  }

  _open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION)

      request.onupgradeneeded = event => {
        const db = event.target.result

        if (!db.objectStoreNames.contains('cached_chores')) {
          db.createObjectStore('cached_chores', { keyPath: 'id' })
        }

        if (!db.objectStoreNames.contains('command_queue')) {
          const cmdStore = db.createObjectStore('command_queue', {
            keyPath: 'id',
            autoIncrement: true,
          })
          cmdStore.createIndex('entity_id', 'entityId', { unique: false })
          cmdStore.createIndex('created_at', 'createdAt', { unique: false })
          cmdStore.createIndex('status', 'status', { unique: false })
        }

        if (!db.objectStoreNames.contains('sync_meta')) {
          db.createObjectStore('sync_meta', { keyPath: 'key' })
        }

        if (!db.objectStoreNames.contains('cached_history')) {
          const histStore = db.createObjectStore('cached_history', {
            keyPath: 'id',
          })
          histStore.createIndex('chore_id', 'choreId', { unique: false })
          histStore.createIndex('performed_at', 'performedAt', {
            unique: false,
          })
          histStore.createIndex('pending', 'pending', { unique: false })
        }
      }

      request.onsuccess = event => resolve(event.target.result)
      request.onerror = event => reject(event.target.error)
    })
  }

  async init() {
    if (this.initialized) return
    this.db = await this._open()
    // Re-open if browser closes the connection (e.g. after device sleep)
    this.db.onclose = () => {
      this.initialized = false
    }
    this.initialized = true
  }

  async _tx(storeName, mode = 'readonly') {
    // If the connection was closed (e.g. laptop sleep), re-open transparently
    if (!this.initialized || !this.db) {
      await this.init()
    }
    try {
      const tx = this.db.transaction(storeName, mode)
      const store = tx.objectStore(storeName)
      return { tx, store }
    } catch (err) {
      // InvalidStateError = connection closed; re-open once and retry
      if (
        err.name === 'InvalidStateError' ||
        err.name === 'TransactionInactiveError'
      ) {
        this.initialized = false
        await this.init()
        const tx = this.db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        return { tx, store }
      }
      throw err
    }
  }

  _request(idbRequest) {
    return new Promise((resolve, reject) => {
      idbRequest.onsuccess = () => resolve(idbRequest.result)
      idbRequest.onerror = () => reject(idbRequest.error)
    })
  }

  // ── Chore cache ──

  async saveChores(chores) {
    if (!chores.length) return

    const { store, tx } = await this._tx('cached_chores', 'readwrite')

    for (const chore of chores) {
      store.put({
        id: chore.id,
        data: chore,
        syncVersion: chore.syncVersion || 0,
        cachedAt: Date.now(),
      })
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async getChores(includeArchive = false) {
    const { store } = await this._tx('cached_chores')
    const rows = await this._request(store.getAll())
    const chores = rows.map(row => row.data)
    if (includeArchive) {
      return chores
    }
    return chores.filter(chore => chore.isActive !== false)
  }

  async getChore(id) {
    const { store } = await this._tx('cached_chores')
    // Try numeric ID first (chores are stored with numeric keys from the server)
    // URL params are strings so we need to coerce
    const numericId = Number(id)
    const row = await this._request(
      store.get(isNaN(numericId) ? id : numericId),
    )
    return row ? row.data : null
  }

  async deleteChores(ids) {
    if (!ids.length) return
    const { store, tx } = await this._tx('cached_chores', 'readwrite')
    for (const id of ids) {
      store.delete(id)
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async clearChores() {
    const { store } = await this._tx('cached_chores', 'readwrite')
    await this._request(store.clear())
  }

  // ── History cache ──

  async saveHistory(entries) {
    if (!entries.length) return
    // Delete pending entries for the affected chore IDs first
    const choreIds = [...new Set(entries.map(e => Number(e.choreId)))]
    await this._deletePendingHistoryByChoreIds(choreIds)
    // Upsert real entries
    const { store, tx } = await this._tx('cached_history', 'readwrite')
    for (const entry of entries) {
      store.put({
        id: entry.id,
        choreId: Number(entry.choreId),
        data: entry,
        performedAt: new Date(entry.performedAt).getTime(),
        pending: 0,
        cachedAt: Date.now(),
      })
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async savePendingHistory(entry) {
    const { store } = await this._tx('cached_history', 'readwrite')
    await this._request(
      store.put({
        id: entry.id,
        choreId: Number(entry.choreId),
        data: entry,
        performedAt: new Date(entry.performedAt).getTime(),
        pending: 1,
        cachedAt: Date.now(),
      }),
    )
  }

  async _deletePendingHistoryByChoreIds(choreIds) {
    if (!choreIds.length) return
    const choreIdSet = new Set(choreIds)
    // Tx 1: read all pending entries
    const { store: readStore } = await this._tx('cached_history')
    const index = readStore.index('pending')
    const rows = await this._request(index.getAll(1))
    const toDelete = rows
      .filter(row => choreIdSet.has(Number(row.choreId)))
      .map(row => row.id)
    if (!toDelete.length) return
    // Tx 2: delete them
    const { store: writeStore, tx } = await this._tx(
      'cached_history',
      'readwrite',
    )
    for (const id of toDelete) {
      writeStore.delete(id)
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async getHistoryByChore(choreId) {
    const { store } = await this._tx('cached_history')
    const index = store.index('chore_id')
    const rows = await this._request(index.getAll(Number(choreId)))
    return rows
      .map(row => row.data)
      .sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt))
  }

  async getHistoryByDays(days) {
    const since = days >= 365 ? 0 : Date.now() - days * 24 * 60 * 60 * 1000
    const { store } = await this._tx('cached_history')
    const rows = await this._request(store.getAll())
    return rows
      .map(row => row.data)
      .filter(entry =>
        since === 0 ? true : new Date(entry.performedAt).getTime() >= since,
      )
      .sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt))
  }

  async deleteHistory(ids) {
    if (!ids.length) return
    const { store, tx } = await this._tx('cached_history', 'readwrite')
    for (const id of ids) {
      store.delete(id)
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async updateHistoryEntry(choreId, historyId, updates) {
    const { store } = await this._tx('cached_history')
    const existing = await this._request(store.get(historyId))
    if (!existing) return

    const merged = {
      ...existing,
      choreId: Number(choreId),
      data: {
        ...existing.data,
        ...updates,
        id: historyId,
        choreId: Number(choreId),
      },
    }
    merged.performedAt = new Date(merged.data.performedAt).getTime()
    merged.cachedAt = Date.now()

    const { store: writeStore } = await this._tx('cached_history', 'readwrite')
    await this._request(writeStore.put(merged))
  }

  async deleteHistoryEntry(historyId) {
    const { store } = await this._tx('cached_history', 'readwrite')
    await this._request(store.delete(historyId))
  }

  async clearHistory() {
    const { store } = await this._tx('cached_history', 'readwrite')
    await this._request(store.clear())
  }

  // ── Command queue ──

  async enqueueCommand(command) {
    const { store } = await this._tx('command_queue', 'readwrite')
    const id = await this._request(
      store.add({
        commandType: command.commandType,
        entityId: command.entityId,
        payload: command.payload,
        createdAt: command.createdAt,
        status: command.status,
        error: command.error,
        retryCount: 0,
      }),
    )
    return id
  }

  async getCommands() {
    const { store } = await this._tx('command_queue')
    const index = store.index('created_at')
    const rows = await this._request(index.getAll())
    return rows
  }

  async getCommandsByEntity(entityId) {
    const { store } = await this._tx('command_queue')
    const index = store.index('entity_id')
    const rows = await this._request(index.getAll(entityId))
    return rows.sort((a, b) => a.createdAt - b.createdAt)
  }

  async updateCommandStatus(id, status, error) {
    const { store } = await this._tx('command_queue', 'readwrite')
    const row = await this._request(store.get(id))
    if (row) {
      row.status = status
      row.error = error
      await this._request(store.put(row))
    }
  }

  async updateCommand(id, updates) {
    const { store } = await this._tx('command_queue', 'readwrite')
    const row = await this._request(store.get(id))
    if (row) {
      await this._request(
        store.put({
          ...row,
          ...updates,
        }),
      )
    }
  }

  async incrementCommandRetry(id) {
    const { store } = await this._tx('command_queue', 'readwrite')
    const row = await this._request(store.get(id))
    if (row) {
      row.retryCount = (row.retryCount ?? 0) + 1
      await this._request(store.put(row))
    }
  }

  async removeCommand(id) {
    const { store } = await this._tx('command_queue', 'readwrite')
    await this._request(store.delete(id))
  }

  async clearCommands() {
    const { store } = await this._tx('command_queue', 'readwrite')
    await this._request(store.clear())
  }

  // ── Sync metadata ──

  async getSyncCursor() {
    const { store } = await this._tx('sync_meta')
    const row = await this._request(store.get('sync_cursor'))
    return row ? Number(row.value) : 0
  }

  async setSyncCursor(cursor) {
    const { store } = await this._tx('sync_meta', 'readwrite')
    await this._request(
      store.put({ key: 'sync_cursor', value: String(cursor) }),
    )
  }

  async getLastSyncTime() {
    const { store } = await this._tx('sync_meta')
    const row = await this._request(store.get('last_sync_time'))
    return row ? Number(row.value) : null
  }

  async setLastSyncTime(time) {
    const { store } = await this._tx('sync_meta', 'readwrite')
    await this._request(
      store.put({ key: 'last_sync_time', value: String(time) }),
    )
  }

  async saveKV(key, value) {
    const { store } = await this._tx('sync_meta', 'readwrite')
    await this._request(store.put({ key, value: JSON.stringify(value) }))
  }

  async getKV(key) {
    const { store } = await this._tx('sync_meta')
    const row = await this._request(store.get(key))
    if (row) {
      try {
        return JSON.parse(row.value)
      } catch {
        return null
      }
    }
    return null
  }

  async clearAll() {
    const storeNames = [
      'cached_chores',
      'command_queue',
      'sync_meta',
      'cached_history',
    ]
    for (const storeName of storeNames) {
      const { store } = await this._tx(storeName, 'readwrite')
      await this._request(store.clear())
    }
  }
}

// ── OfflineDB facade ──

class OfflineDB {
  constructor() {
    this.backend = null
    this.initialized = false

    // When the tab becomes visible after being hidden (laptop wake/tab switch),
    // reset so the next operation re-validates the IDB connection.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.backend) {
          // Signal the IDB backend to re-open on next use
          this.backend.initialized = false
        }
      })
    }
  }

  async init() {
    if (this.initialized) return
    if (this._initPromise) return this._initPromise

    this._initPromise = (async () => {
      this.backend = new IndexedDBBackend()
      await this.backend.init()
      this.initialized = true
      this._initPromise = null
    })()

    return this._initPromise
  }

  async _ensureInit() {
    if (!this.initialized) {
      await this.init()
    }
  }

  // Chore cache
  async saveChores(chores) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.saveChores(chores)
  }

  async getChores(includeArchive = false) {
    if (!isOfflineFeatureEnabled()) return []
    await this._ensureInit()
    return this.backend.getChores(includeArchive)
  }

  async getChore(id) {
    if (!isOfflineFeatureEnabled()) return null
    await this._ensureInit()
    return this.backend.getChore(id)
  }

  async deleteChores(ids) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.deleteChores(ids)
  }

  async clearChores() {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.clearChores()
  }

  // Command queue
  async enqueueCommand(command) {
    if (!isOfflineFeatureEnabled()) return null
    await this._ensureInit()
    return this.backend.enqueueCommand(command)
  }

  async getCommands() {
    if (!isOfflineFeatureEnabled()) return []
    await this._ensureInit()
    return this.backend.getCommands()
  }

  async getCommandsByEntity(entityId) {
    if (!isOfflineFeatureEnabled()) return []
    await this._ensureInit()
    return this.backend.getCommandsByEntity(entityId)
  }

  async updateCommandStatus(id, status, error) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.updateCommandStatus(id, status, error)
  }

  async updateCommand(id, updates) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.updateCommand(id, updates)
  }

  async incrementCommandRetry(id) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.incrementCommandRetry(id)
  }

  async removeCommand(id) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.removeCommand(id)
  }

  async clearCommands() {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.clearCommands()
  }

  // Sync metadata
  async getSyncCursor() {
    if (!isOfflineFeatureEnabled()) return 0
    await this._ensureInit()
    return this.backend.getSyncCursor()
  }

  async setSyncCursor(cursor) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.setSyncCursor(cursor)
  }

  async getLastSyncTime() {
    if (!isOfflineFeatureEnabled()) return null
    await this._ensureInit()
    return this.backend.getLastSyncTime()
  }

  async setLastSyncTime(time) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.setLastSyncTime(time)
  }

  // History cache
  async saveHistory(entries) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.saveHistory(entries)
  }

  async savePendingHistory(entry) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.savePendingHistory(entry)
  }

  async getHistoryByChore(choreId) {
    if (!isOfflineFeatureEnabled()) return []
    await this._ensureInit()
    return this.backend.getHistoryByChore(choreId)
  }

  async getHistoryByDays(days) {
    if (!isOfflineFeatureEnabled()) return []
    await this._ensureInit()
    return this.backend.getHistoryByDays(days)
  }

  async deleteHistory(ids) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.deleteHistory(ids)
  }

  async updateHistoryEntry(choreId, historyId, updates) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.updateHistoryEntry(choreId, historyId, updates)
  }

  async deleteHistoryEntry(historyId) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.deleteHistoryEntry(historyId)
  }

  async clearHistory() {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.clearHistory()
  }

  // General key-value cache (uses sync_meta store)
  async saveKV(key, value) {
    if (!isOfflineFeatureEnabled()) return
    await this._ensureInit()
    return this.backend.saveKV(key, value)
  }

  async getKV(key) {
    if (!isOfflineFeatureEnabled()) return null
    await this._ensureInit()
    return this.backend.getKV(key)
  }

  async clearAll() {
    await this._ensureInit()
    return this.backend.clearAll()
  }
}

export const offlineDB = new OfflineDB()
