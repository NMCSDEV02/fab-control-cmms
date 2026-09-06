const API_URL_KEY = 'fab-control.api-url'
const LEGACY_OPERATOR_TOKEN_PERSISTENT_KEY = 'fab-control.operator-token-persistent'
const AUTH_SESSION_KEY = 'fab-control.auth-session'

export type ApiTransport = 'auto' | 'node' | 'apps-script'

function readLocalStorage(key: string): string {
  try {
    return window.localStorage.getItem(key)?.trim() ?? ''
  } catch {
    return ''
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    // Configuração em memória/ambiente continua disponível quando o storage é bloqueado.
  }
}

function clearLegacyPersistentToken(): void {
  writeLocalStorage(LEGACY_OPERATOR_TOKEN_PERSISTENT_KEY, '')
}

export function getApiUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (fromEnv) return fromEnv
  return readLocalStorage(API_URL_KEY)
}

export function getLegacyApiUrl(): string {
  return (import.meta.env.VITE_APPS_SCRIPT_API_URL as string | undefined)?.trim() ?? ''
}

export function getApiTransport(): ApiTransport {
  const value = (import.meta.env.VITE_API_TRANSPORT as string | undefined)?.trim().toLowerCase()
  return value === 'node' || value === 'apps-script' ? value : 'auto'
}

export function saveApiUrl(value: string): void {
  writeLocalStorage(API_URL_KEY, value.trim())
}

export function getOperatorToken(): string {
  clearLegacyPersistentToken()
  try {
    const raw = window.sessionStorage.getItem(AUTH_SESSION_KEY)
    if (!raw) return ''
    const value = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown }
    return typeof value.token === 'string' && Number(value.expiresAt) > Date.now()
      ? value.token.trim()
      : ''
  } catch {
    return ''
  }
}

/** @deprecated The authenticated session is the sole token authority. */
export function saveOperatorToken(_value: string): void {
  clearLegacyPersistentToken()
}

export function clearOperatorToken(): void {
  clearLegacyPersistentToken()
  try {
    window.sessionStorage.removeItem('fab-control.operator-token')
  } catch {
    // A limpeza da sessão continua no chamador.
  }
}

export function hasApiConfiguration(): boolean {
  return Boolean(getApiUrl() && getOperatorToken())
}
