import { useCallback, useEffect, useState } from 'react'
import { AppHeader, type ConnectionState } from '../components/AppHeader'
import { BottomNavigation, type AppSection } from '../components/BottomNavigation'
import { mockAsset } from '../mocks/operator'
import { ActionDetailPage } from '../pages/ActionDetailPage'
import { OperatorHome } from '../pages/OperatorHome'
import { QrPage } from '../pages/QrPage'
import { SettingsPage } from '../pages/SettingsPage'
import { hasApiConfiguration } from '../services/api/config'
import {
  getOperatorActionDetail,
  getOperatorActions,
  getSystemHealth,
  startOperatorAction,
} from '../services/api/operator'
import type { OperatorActionDetailData } from '../types/api'
import type { OperatorAction } from '../types/operator'

type AppView = 'navigation' | 'action-detail'

export function App() {
  const [section, setSection] = useState<AppSection>('home')
  const [view, setView] = useState<AppView>('navigation')
  const [toast, setToast] = useState('')
  const [actions, setActions] = useState<OperatorAction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [connectionState, setConnectionState] =
    useState<ConnectionState>(hasApiConfiguration() ? 'checking' : 'unconfigured')
  const [apiVersion, setApiVersion] = useState('')
  const [configurationRevision, setConfigurationRevision] = useState(0)

  const [selectedActionId, setSelectedActionId] = useState('')
  const [actionDetail, setActionDetail] = useState<OperatorActionDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [starting, setStarting] = useState(false)

  const configured = hasApiConfiguration()

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  const refresh = useCallback(async () => {
    if (!hasApiConfiguration()) {
      setConnectionState('unconfigured')
      setActions([])
      setError('')
      return
    }

    setLoading(true)
    setError('')
    setConnectionState('checking')

    try {
      const health = await getSystemHealth()
      setApiVersion(health.version)
      setConnectionState('online')

      try {
        const operatorActions = await getOperatorActions()
        setActions(operatorActions)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Falha ao carregar ações.'
        setError(message)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Erro desconhecido na integração.'
      setError(message)
      setConnectionState('offline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, configurationRevision])

  const loadActionDetail = useCallback(async (actionId: string) => {
    setDetailLoading(true)
    setDetailError('')
    try {
      const detail = await getOperatorActionDetail(actionId)
      setActionDetail(detail)
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : 'Falha ao abrir a ação.')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  function openAction(action: OperatorAction) {
    setSelectedActionId(action.id)
    setActionDetail(null)
    setView('action-detail')
    void loadActionDetail(action.id)
  }

  function closeAction() {
    setView('navigation')
    setSelectedActionId('')
    setActionDetail(null)
    setDetailError('')
    void refresh()
  }

  async function startAction() {
    if (!selectedActionId) return
    setStarting(true)
    try {
      await startOperatorAction(selectedActionId)
      notify('Execução iniciada')
      await Promise.all([loadActionDetail(selectedActionId), refresh()])
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Falha ao iniciar execução.'
      setDetailError(message)
      notify(message)
    } finally {
      setStarting(false)
    }
  }

  async function testConnection() {
    try {
      const health = await getSystemHealth()
      setApiVersion(health.version)
      setConnectionState('online')
      notify(`API ${health.version} conectada`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Falha ao testar a API.'
      setConnectionState('offline')
      notify(message)
      throw cause
    }
  }

  function configurationSaved() {
    setConfigurationRevision((value) => value + 1)
    setSection('home')
    setView('navigation')
    notify('Configuração salva')
  }

  function changeSection(next: AppSection) {
    setView('navigation')
    setSection(next)
  }

  return (
    <div className="app-stage">
      <section className="app-frame">
        <AppHeader
          operatorName="Carlos"
          shift="Turno A"
          connectionState={connectionState}
        />

        <main className="app-content">
          {view === 'action-detail' ? (
            <ActionDetailPage
              detail={actionDetail}
              loading={detailLoading}
              error={detailError}
              starting={starting}
              onBack={closeAction}
              onRetry={() => void loadActionDetail(selectedActionId)}
              onStart={startAction}
              onContinue={() => notify('Checklist será conectado na próxima fase.')}
            />
          ) : (
            <>
              {section === 'home' && (
                <OperatorHome
                  actions={actions}
                  loading={loading}
                  error={error}
                  configured={configured}
                  onRetry={() => void refresh()}
                  onOpenSettings={() => setSection('settings')}
                  onOpenAction={openAction}
                  onOpenQr={() => setSection('qr')}
                />
              )}
              {section === 'qr' && <QrPage asset={mockAsset} onNotify={notify} />}
              {section === 'settings' && (
                <SettingsPage
                  apiOnline={connectionState === 'online'}
                  apiVersion={apiVersion}
                  onConfigurationSaved={configurationSaved}
                  onTestConnection={testConnection}
                />
              )}
            </>
          )}
        </main>

        {view === 'navigation' && (
          <BottomNavigation active={section} onChange={changeSection} />
        )}

        <div className={toast ? 'toast toast--visible' : 'toast'} role="status" aria-live="polite">
          {toast}
        </div>
      </section>
    </div>
  )
}
