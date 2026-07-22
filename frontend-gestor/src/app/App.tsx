import { useCallback, useEffect, useState } from 'react'
import {
  AppNavigation,
  type GestorSection,
} from '../components/AppNavigation'
import { AssetsPage } from '../pages/AssetsPage'
import { DashboardPage } from '../pages/DashboardPage'
import { LoginPage } from '../pages/LoginPage'
import { MorePage } from '../pages/MorePage'
import { ValidationsPage } from '../pages/ValidationsPage'
import { APP_RELEASE_VERSION } from '../release'
import {
  revokeGestorSession,
  type GestorSession,
} from '../services/api/auth'
import { warmupGestor } from '../services/api/system'
import {
  clearGestorSession,
  hasCompletedStartup,
  markExpiredGestorSession,
  markStartupCompleted,
  readGestorSession,
  saveGestorSession,
} from '../services/auth/session'

export function App() {
  const [session, setSession] = useState<GestorSession | null>(readGestorSession)
  const [section, setSection] = useState<GestorSection>('home')
  const [validationCount, setValidationCount] = useState(0)
  const [loggingOut, setLoggingOut] = useState(false)

  const expireSession = useCallback(() => {
    markExpiredGestorSession()
    setSession(null)
    setSection('home')
  }, [])

  useEffect(() => {
    if (!session) return

    const remaining = session.expiresAt - Date.now()
    if (remaining <= 0) {
      expireSession()
      return
    }

    const timer = window.setTimeout(expireSession, remaining)
    return () => window.clearTimeout(timer)
  }, [expireSession, session])

  useEffect(() => {
    if (!session || hasCompletedStartup()) return

    const controller = new AbortController()
    void warmupGestor(session.token, controller.signal)
      .then(() => markStartupCompleted())
      .catch(() => {
        // O carregamento das telas continua mesmo se o warmup não responder.
      })

    return () => controller.abort()
  }, [session])

  function handleAuthenticated(nextSession: GestorSession) {
    saveGestorSession(nextSession)
    setSession(nextSession)
    setSection('home')
  }

  function handleNavigate(nextSection: GestorSection) {
    setSection(nextSection)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleLogout() {
    if (!session || loggingOut) return

    setLoggingOut(true)
    try {
      await revokeGestorSession(session.token)
    } catch {
      // O encerramento local continua mesmo sem resposta da API.
    } finally {
      clearGestorSession()
      setSession(null)
      setSection('home')
      setLoggingOut(false)
    }
  }

  if (!session) {
    return <LoginPage onAuthenticated={handleAuthenticated} />
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__identity">
          <span className="brand-mark" aria-hidden="true">FC</span>
          <div>
            <strong>Fab Control</strong>
            <span>Visão do gestor</span>
          </div>
        </div>

        <div className="topbar__actions">
          <span className="connection-chip">
            <i aria-hidden="true" />
            Online
          </span>

          <div className="user-badge">
            <strong>{session.user.nome}</strong>
            <span>{session.user.perfil}</span>
          </div>

          <span className="release">v{APP_RELEASE_VERSION}</span>

          <button
            className="logout-button"
            type="button"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
          >
            {loggingOut ? 'Saindo…' : 'Sair'}
          </button>
        </div>
      </header>

      <div className="app-content">
        {section === 'home' ? (
          <DashboardPage
            onNavigate={handleNavigate}
            onQueueCountChange={setValidationCount}
            onSessionExpired={expireSession}
          />
        ) : null}
        {section === 'validations' ? (
          <ValidationsPage
            onQueueCountChange={setValidationCount}
            onSessionExpired={expireSession}
          />
        ) : null}
        {section === 'assets' ? (
          <AssetsPage onSessionExpired={expireSession} />
        ) : null}
        {section === 'more' ? (
          <MorePage session={session} onNavigate={handleNavigate} />
        ) : null}
      </div>

      <AppNavigation
        active={section}
        validationCount={validationCount}
        onNavigate={handleNavigate}
      />
    </div>
  )
}
