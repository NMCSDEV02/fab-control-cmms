const API_URL_KEY = 'fab-control.api-url'
const OPERATOR_TOKEN_KEY = 'fab-control.operator-token'

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
  return sessionStorage.getItem(OPERATOR_TOKEN_KEY)?.trim() ?? ''
}

export function saveOperatorToken(value: string): void {
  const normalized = value.trim()
  if (normalized) sessionStorage.setItem(OPERATOR_TOKEN_KEY, normalized)
  else sessionStorage.removeItem(OPERATOR_TOKEN_KEY)
}

export function hasApiConfiguration(): boolean {
  return Boolean(getApiUrl() && getOperatorToken())
}
