import { useCallback, useEffect, useState } from 'react'
import {
  AppNavigation,
  type GestorSection,
} from '../components/AppNavigation'
import { AdminWorkspace } from '../components/AdminWorkspace'
import { PlatformMotorWorkspace } from '../components/PlatformMotorWorkspace'
import { WorkspaceStartupGate } from '../components/WorkspaceStartupGate'
import { AssetsPage } from '../pages/AssetsPage'
import type { AdminModule } from '../pages/AdminPage'
import { DashboardPage } from '../pages/DashboardPage'
import { LoginPage } from '../pages/LoginPage'
import { MaintenanceAccessPage } from '../pages/MaintenanceAccessPage'
import { MorePage } from '../pages/MorePage'
import { ValidationsPage } from '../pages/ValidationsPage'
import { APP_RELEASE_VERSION } from '../release'
import {
  revokeGestorSession,
  type GestorSession,
} from '../services/api/auth'
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
  const [maintenanceEntry, setMaintenanceEntry] = useState(
    () => new URLSearchParams(window.location.search).get('maintenance') === '1',
  )
  const [section, setSection] = useState<GestorSection>('home')
  const [adminModule, setAdminModule] = useState<AdminModule>('overview')
  const [validationCount, setValidationCount] = useState(0)
  const [loggingOut, setLoggingOut] = useState(false)
  const [workspaceReady, setWorkspaceReady] = useState(hasCompletedStartup)
  const isAdmin = session?.user.perfil.trim().toUpperCase() === 'ADMIN'
  const isSystem = session?.user.perfil.trim().toUpperCase() === 'SISTEMA'

  const expireSession = useCallback(() => {
    markExpiredGestorSession()
    setSession(null)
    setSection('home')
    setWorkspaceReady(false)
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

  function leaveMaintenanceEntry() {
    const url = new URL(window.location.href)
    url.searchParams.delete('maintenance')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    setMaintenanceEntry(false)
  }

  function handleAuthenticated(nextSession: GestorSession) {
    saveGestorSession(nextSession)
    setSession(nextSession)
    setSection('home')
    setAdminModule('overview')
    setWorkspaceReady(false)
  }

  const completeWorkspaceStartup = useCallback(() => {
    markStartupCompleted()
    setWorkspaceReady(true)
  }, [])

  function handleNavigate(nextSection: GestorSection) {
    setSection(nextSection)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleLogout() {
    if (!session || loggingOut) return

    const systemSession = session.user.perfil.trim().toUpperCase() === 'SISTEMA'
    setLoggingOut(true)
    try {
      await revokeGestorSession(session.token)
    } catch {
      // O encerramento local continua mesmo sem resposta da API.
    } finally {
      clearGestorSession()
      setSession(null)
      setSection('home')
      setWorkspaceReady(false)
      if (systemSession) leaveMaintenanceEntry()
      setLoggingOut(false)
    }
  }

  if (!session) {
    if (maintenanceEntry) {
      return (
        <MaintenanceAccessPage
          onAuthenticated={handleAuthenticated}
          onReturn={leaveMaintenanceEntry}
        />
      )
    }
    return <LoginPage onAuthenticated={handleAuthenticated} />
  }

  if (isSystem) {
    return (
      <PlatformMotorWorkspace
        session={session}
        loggingOut={loggingOut}
        onSessionExpired={expireSession}
        onLogout={() => void handleLogout()}
      />
    )
  }

  if (!workspaceReady) {
    return (
      <WorkspaceStartupGate
        session={session}
        onReady={completeWorkspaceStartup}
        onSessionExpired={expireSession}
        onLogout={() => void handleLogout()}
      />
    )
  }

  if (isAdmin) {
    return (
      <AdminWorkspace
        session={session}
        activeModule={adminModule}
        loggingOut={loggingOut}
        onModuleChange={setAdminModule}
        onSessionExpired={expireSession}
        onLogout={() => void handleLogout()}
      />
    )
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
        showAdmin={false}
        onNavigate={handleNavigate}
      />
    </div>
  )
}
