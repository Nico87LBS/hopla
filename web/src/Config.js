export const API_URL =
  import.meta.env.VITE_APP_API_URL === 'AUTO'
    ? `${window.location.hostname}/api`
    : import.meta.env.VITE_APP_API_URL
