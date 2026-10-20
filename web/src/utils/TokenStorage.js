// Token storage keys
const TOKEN_KEYS = {
  ACCESS_TOKEN: 'token',
  ACCESS_TOKEN_EXPIRY: 'token_expiry',
  REFRESH_TOKEN_EXPIRY: 'refresh_token_expiry',
}

// Track if we're currently clearing tokens to prevent race conditions
let clearingTokens = false

/**
 * Save access tokens to localStorage. The refresh token itself lives in an
 * HTTP-only cookie set by the server.
 */
export const saveTokens = async ({
  accessToken,
  accessTokenExpiry,
  refreshTokenExpiry,
}) => {
  try {
    if (accessToken) {
      localStorage.setItem(TOKEN_KEYS.ACCESS_TOKEN, accessToken)
    }
    if (accessTokenExpiry) {
      localStorage.setItem(TOKEN_KEYS.ACCESS_TOKEN_EXPIRY, accessTokenExpiry)
    }
    if (refreshTokenExpiry) {
      localStorage.setItem(TOKEN_KEYS.REFRESH_TOKEN_EXPIRY, refreshTokenExpiry)
    }
  } catch (error) {
    console.error('Error saving tokens:', error)
    throw error
  }
}

/**
 * The browser keeps the refresh token in an HTTP-only cookie, so the backend
 * decides when it has expired.
 */
export const isRefreshTokenExpired = async () => false

/**
 * Clear all tokens from all storage locations
 * Idempotent - safe to call multiple times
 */
export const clearAllTokens = async () => {
  if (clearingTokens) {
    return // Already clearing, don't run concurrently
  }

  clearingTokens = true

  try {
    localStorage.removeItem(TOKEN_KEYS.ACCESS_TOKEN)
    localStorage.removeItem(TOKEN_KEYS.ACCESS_TOKEN_EXPIRY)
    localStorage.removeItem(TOKEN_KEYS.REFRESH_TOKEN_EXPIRY)
    // Clean up legacy keys
    localStorage.removeItem('ca_token')
    localStorage.removeItem('ca_expiration')
    localStorage.removeItem('access_token')
  } catch (error) {
    console.error('Error clearing tokens:', error)
  } finally {
    clearingTokens = false
  }
}
