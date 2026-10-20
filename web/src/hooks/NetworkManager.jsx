import { isOfflineFeatureEnabled } from '../utils/OfflineFeatureToggle'

class NetworkManager {
  constructor() {
    this.deviceOnline = true
    this.serverReachable = true
    this.offlineReason = null // 'device' | 'server' | null
    this.connectionStatusListeners = []
    this.queueSyncListeners = []
    this.lastChecked = null
    this.offlineSince = null
    this.init()
  }

  // Effective online status: both device network AND server must be reachable
  get isOnline() {
    return this.deviceOnline && this.serverReachable
  }

  get isNetworkOn() {
    return this.deviceOnline
  }

  init() {
    this.deviceOnline = navigator.onLine
    this.lastChecked = Date.now()
    if (!this.deviceOnline) {
      this.offlineReason = 'device'
      this.offlineSince = Date.now()
    }

    const onChange = () => {
      const connected = navigator.onLine
      if (this.deviceOnline !== connected) {
        this.deviceOnline = connected
        this.lastChecked = Date.now()

        if (!connected) {
          this.offlineReason = 'device'
          this.offlineSince = Date.now()
        } else {
          // Device came back online — update reason based on server state
          this.offlineReason = this.serverReachable ? null : 'server'
        }
        this.notifyConnectionStatus()
      }
    }
    window.addEventListener('online', onChange)
    window.addEventListener('offline', onChange)
  }

  // Called when a fetch() response is received (any HTTP status = server is up)
  setServerReachable() {
    if (!this.serverReachable) {
      this.serverReachable = true
      this.offlineReason = this.deviceOnline ? null : 'device'
      this.notifyConnectionStatus()
    }
  }

  // Called when fetch() throws a network error (server unreachable)
  // Only takes effect when offline mode is enabled
  setServerUnreachable() {
    if (!isOfflineFeatureEnabled()) return
    if (this.serverReachable) {
      this.serverReachable = false
      this.offlineReason = 'server'
      this.offlineSince = Date.now()
      this.notifyConnectionStatus()
    }
  }

  // Legacy methods kept for compatibility
  setOffline() {
    this.setServerUnreachable()
  }
  setOnline() {
    this.setServerReachable()
  }

  notifyConnectionStatus() {
    this.connectionStatusListeners.forEach(callback => {
      callback(this.isOnline)
    })
  }

  notifyBackendSync() {
    this.queueSyncListeners.forEach(callback => {
      callback()
    })
  }

  registerNetworkListener(callback) {
    this.connectionStatusListeners.push(callback)
  }
  unregisterNetworkListener(callback) {
    this.connectionStatusListeners = this.connectionStatusListeners.filter(
      cb => cb !== callback,
    )
  }
  registerBackendSyncListener(callback) {
    if (!this.queueSyncListeners.includes(callback)) {
      this.queueSyncListeners.push(callback)
    }
  }
}

export const networkManager = new NetworkManager()
