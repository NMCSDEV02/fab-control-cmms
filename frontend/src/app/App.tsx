import { useCallback, useEffect, useState } from 'react'
import { AppHeader, type ConnectionState } from '../components/AppHeader'
import { BottomNavigation, type AppSection } from '../components/BottomNavigation'
import { mockAsset } from '../mocks/operator'
import { ActionDetailPage } from '../pages/ActionDetailPage'
import { ChecklistExecutionPage } from '../pages/ChecklistExecutionPage'
import { OperatorHome } from '../pages/OperatorHome'
import { QrPage } from '../pages/QrPage'
import { SettingsPage } from '../pages/SettingsPage'
import { hasApiConfiguration } from '../services/api/config'
import {
  getOperatorActionDetail,
  finalizeOperatorAction,
  getOperatorActions,
  getSystemHealth,
  registerOperatorEvidence,
  saveOperatorChecklistBatch,
  startOperatorAction,
  validateOperatorFinalization,
} from '../services/api/operator'
import type { ChecklistBatchItemInput, EvidenceInput, FinalizationValidationData, OperatorActionDetailData } from '../types/api'
import type { OperatorAction } from '../types/operator'

type AppView = 'navigation' | 'action-detail' | 'checklist'

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
  const [savingChecklist, setSavingChecklist] = useState(false)
  const [savingEvidence, setSavingEvidence] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [validation, setValidation] = useState<FinalizationValidationData | null>(null)

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
    setValidation(null)
    void refresh()
  }

  async function startAction() {
    if (!selectedActionId) return
    setStarting(true)
    try {
      await startOperatorAction(selectedActionId)
      notify('Execução iniciada')
      await Promise.all([loadActionDetail(selectedActionId), refresh()])
      setView('checklist')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Falha ao iniciar execução.'
      setDetailError(message)
      notify(message)
    } finally {
      setStarting(false)
    }
  }



  async function refreshCurrentDetail() {
    if (!selectedActionId) return
    await loadActionDetail(selectedActionId)
  }

  async function saveChecklist(items: ChecklistBatchItemInput[]) {
    if (!selectedActionId) return
    setSavingChecklist(true)
    setDetailError('')
    try {
      const result = await saveOperatorChecklistBatch(selectedActionId, items)
      if (result.error_count > 0) {
        const first = result.erros?.[0]?.message || 'Alguns itens não foram salvos.'
        throw new Error(first)
      }
      notify(`${result.saved_count} item(ns) sincronizado(s)`)
      await refreshCurrentDetail()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Falha ao salvar o checklist.'
      setDetailError(message)
      notify(message)
      throw cause
    } finally {
      setSavingChecklist(false)
    }
  }

  async function saveEvidence(input: EvidenceInput) {
    if (!selectedActionId || !actionDetail?.execucao?.id) {
      throw new Error('Execução não identificada para registrar evidência.')
    }
    setSavingEvidence(true)
    setDetailError('')
    try {
      await registerOperatorEvidence(selectedActionId, actionDetail.execucao.id, input)
      notify('Evidência registrada')
      await refreshCurrentDetail()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Falha ao registrar evidência.'
      setDetailError(message)
      notify(message)
      throw cause
    } finally {
      setSavingEvidence(false)
    }
  }

  async function validateFinalization() {
    if (!selectedActionId) return
    setDetailError('')
    try {
      const result = await validateOperatorFinalization(selectedActionId)
      setValidation(result)
      notify(result.can_finalize ? 'Finalização liberada' : 'Checklist possui pendências')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Falha ao validar a finalização.'
      setDetailError(message)
      notify(message)
      throw cause
    }
  }

  async function finalizeAction(resultado: 'OK' | 'NOK', observacao: string, durationSeconds: number) {
    if (!selectedActionId) return
    setFinalizing(true)
    setDetailError('')
    try {
      const result = await finalizeOperatorAction(selectedActionId, {
        resultado,
        observacao,
        duracao_segundos: durationSeconds,
      })
      notify(`Ação finalizada: ${result.status_acao}`)
      setView('navigation')
      setSection('home')
      setSelectedActionId('')
      setActionDetail(null)
      setValidation(null)
      await refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Falha ao finalizar a ação.'
      setDetailError(message)
      notify(message)
    } finally {
      setFinalizing(false)
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
              onContinue={() => { setValidation(null); setView('checklist') }}
            />
          ) : view === 'checklist' && actionDetail ? (
            <ChecklistExecutionPage
              detail={actionDetail}
              saving={savingChecklist}
              evidenceSaving={savingEvidence}
              finalizing={finalizing}
              error={detailError}
              validation={validation}
              onBack={() => setView('action-detail')}
              onRefresh={refreshCurrentDetail}
              onSave={saveChecklist}
              onRegisterEvidence={saveEvidence}
              onValidate={validateFinalization}
              onFinalize={finalizeAction}
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
