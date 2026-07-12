import { useCallback, useEffect, useState } from 'react'
import { AppHeader, type ConnectionState } from '../components/AppHeader'
import { BottomNavigation, type AppSection } from '../components/BottomNavigation'
import { mockAsset } from '../mocks/operator'
import { OperatorHome } from '../pages/OperatorHome'
import { QrPage } from '../pages/QrPage'
import { SettingsPage } from '../pages/SettingsPage'
import { hasApiConfiguration } from '../services/api/config'
import { getOperatorActions, getSystemHealth } from '../services/api/operator'
import type { OperatorAction } from '../types/operator'

export function App() {
  const [section, setSection] = useState<AppSection>('home')
  const [toast, setToast] = useState('')
  const [actions, setActions] = useState<OperatorAction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [connectionState, setConnectionState] =
    useState<ConnectionState>(hasApiConfiguration() ? 'checking' : 'unconfigured')
  const [apiVersion, setApiVersion] = useState('')
  const [configurationRevision, setConfigurationRevision] = useState(0)

  const configured = hasApiConfiguration()

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  const refresh = useCallback(async () => {
    if (!hasApiConfiguration()) {
      setConnectionState('unconfigured')
      setActions([])
      setError('')
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError('')
    setConnectionState('checking')

    try {
      const [health, operatorActions] = await Promise.all([
        getSystemHealth(controller.signal),
        getOperatorActions(controller.signal),
      ])
      setApiVersion(health.version)
      setActions(operatorActions)
      setConnectionState('online')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Erro desconhecido na integração.'
      setError(message)
      setConnectionState('offline')
    } finally {
      setLoading(false)
    }

    return () => controller.abort()
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, configurationRevision])

  function openAction(action: OperatorAction) {
    notify(`Ação ${action.id} carregada. A tela técnica será integrada na próxima fase.`)
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
    notify('Configuração salva')
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
        </main>

        <BottomNavigation active={section} onChange={setSection} />
        <div className={toast ? 'toast toast--visible' : 'toast'} role="status" aria-live="polite">
          {toast}
        </div>
      </section>
    </div>
  )
}
