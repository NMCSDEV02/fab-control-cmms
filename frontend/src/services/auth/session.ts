import { clearOperatorToken } from '../api/config'

const AUTH_PREVIEW_SESSION_KEY = 'fab-control.auth-preview-session'
const AUTH_PREVIEW_STARTED_AT_KEY = 'fab-control.auth-preview-started-at'
const AUTH_PREVIEW_EXPIRES_AT_KEY = 'fab-control.auth-preview-expires-at'
const AUTH_NOTICE_KEY = 'fab-control.auth-notice'
const STARTUP_COMPLETED_KEY = 'fab-control.startup-completed'

export type AuthenticationNotice = 'session-expired'

function removePreviewSessionData(): void {
  window.sessionStorage.removeItem(AUTH_PREVIEW_SESSION_KEY)
  window.sessionStorage.removeItem(AUTH_PREVIEW_STARTED_AT_KEY)
  window.sessionStorage.removeItem(AUTH_PREVIEW_EXPIRES_AT_KEY)
}

export function markExpiredPreviewSession(): void {
  try {
    removePreviewSessionData()
    clearOperatorToken()
    window.sessionStorage.setItem(AUTH_NOTICE_KEY, 'session-expired')
  } catch {
    // O estado em memória ainda será encerrado pelo aplicativo.
  }
}

export function readPreviewSession(): string {
  try {
    const registration =
      window.sessionStorage.getItem(AUTH_PREVIEW_SESSION_KEY)?.trim() ?? ''

    if (!registration) return ''

    const expiresAt = Number(
      window.sessionStorage.getItem(AUTH_PREVIEW_EXPIRES_AT_KEY) ?? '0',
    )

    if (expiresAt > 0 && expiresAt <= Date.now()) {
      markExpiredPreviewSession()
      return ''
    }

    return registration
  } catch {
    return ''
  }
}

export function readPreviewSessionStartedAt(): string {
  try {
    const existing =
      window.sessionStorage.getItem(AUTH_PREVIEW_STARTED_AT_KEY)?.trim() ?? ''

    if (existing) return existing
    if (!readPreviewSession()) return ''

    const createdAt = new Date().toISOString()
    window.sessionStorage.setItem(AUTH_PREVIEW_STARTED_AT_KEY, createdAt)
    return createdAt
  } catch {
    return ''
  }
}

export function readPreviewSessionExpiresAt(): number {
  try {
    const expiresAt = Number(
      window.sessionStorage.getItem(AUTH_PREVIEW_EXPIRES_AT_KEY) ?? '0',
    )
    return Number.isFinite(expiresAt) ? expiresAt : 0
  } catch {
    return 0
  }
}

export function savePreviewSession(
  registration: string,
  startedAt: string,
  expiresAt: number,
): void {
  try {
    window.sessionStorage.setItem(AUTH_PREVIEW_SESSION_KEY, registration)
    window.sessionStorage.setItem(AUTH_PREVIEW_STARTED_AT_KEY, startedAt)
    window.sessionStorage.setItem(AUTH_PREVIEW_EXPIRES_AT_KEY, String(expiresAt))
    window.sessionStorage.removeItem(AUTH_NOTICE_KEY)
  } catch {
    // A sessão de homologação continua em memória quando o storage está indisponível.
  }
}

export function clearPreviewSession(): void {
  try {
    removePreviewSessionData()
    clearOperatorToken()
    window.sessionStorage.removeItem(AUTH_NOTICE_KEY)
    window.sessionStorage.removeItem(STARTUP_COMPLETED_KEY)
  } catch {
    // O recarregamento ainda encerra a sessão mantida apenas em memória.
  }
}

export function hasCompletedStartup(): boolean {
  try {
    return window.sessionStorage.getItem(STARTUP_COMPLETED_KEY) === '1'
  } catch {
    return false
  }
}

export function markStartupCompleted(): void {
  try {
    window.sessionStorage.setItem(STARTUP_COMPLETED_KEY, '1')
  } catch {
    // Sem impacto funcional; o pré-carregamento poderá repetir com storage bloqueado.
  }
}

export function consumeAuthenticationNotice(): AuthenticationNotice | '' {
  try {
    const notice = window.sessionStorage.getItem(AUTH_NOTICE_KEY) ?? ''
    window.sessionStorage.removeItem(AUTH_NOTICE_KEY)
    return notice === 'session-expired' ? notice : ''
  } catch {
    return ''
  }
}
