const API_URL_KEY = 'fab-control.api-url'
const OPERATOR_TOKEN_SESSION_KEY = 'fab-control.operator-token'
const OPERATOR_TOKEN_PERSISTENT_KEY = 'fab-control.operator-token-persistent'

function environmentOperatorToken(): string {
  return (import.meta.env.VITE_OPERATOR_TOKEN as string | undefined)?.trim() ?? ''
}

export function getApiUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (fromEnv) return fromEnv
  return localStorage.getItem(API_URL_KEY)?.trim() ?? ''
}

export function saveApiUrl(value: string): void {
  const normalized = value.trim()
  if (normalized) localStorage.setItem(API_URL_KEY, normalized)
  else localStorage.removeItem(API_URL_KEY)
}

export function getOperatorToken(): string {
  const sessionToken = sessionStorage.getItem(OPERATOR_TOKEN_SESSION_KEY)?.trim() ?? ''
  if (sessionToken) {
    localStorage.setItem(OPERATOR_TOKEN_PERSISTENT_KEY, sessionToken)
    return sessionToken
  }

  const persistentToken =
    localStorage.getItem(OPERATOR_TOKEN_PERSISTENT_KEY)?.trim() ?? ''
  if (persistentToken) return persistentToken

  return environmentOperatorToken()
}

export function saveOperatorToken(value: string): void {
  const normalized = value.trim()
  if (normalized) {
    sessionStorage.setItem(OPERATOR_TOKEN_SESSION_KEY, normalized)
    localStorage.setItem(OPERATOR_TOKEN_PERSISTENT_KEY, normalized)
  } else {
    sessionStorage.removeItem(OPERATOR_TOKEN_SESSION_KEY)
    localStorage.removeItem(OPERATOR_TOKEN_PERSISTENT_KEY)
  }
}

export function hasApiConfiguration(): boolean {
  return Boolean(getApiUrl() && getOperatorToken())
}
