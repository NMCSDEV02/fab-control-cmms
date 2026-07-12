import { useCallback, useEffect, useState } from 'react'
import { AppHeader, type ConnectionState } from '../components/AppHeader'
import { BottomNavigation, type AppSection } from '../components/BottomNavigation'
import { ActionDetailPage } from '../pages/ActionDetailPage'
import { ChecklistExecutionPage } from '../pages/ChecklistExecutionPage'
import { OperatorHome } from '../pages/OperatorHome'
import { QrPage } from '../pages/QrPage'
import { SettingsPage } from '../pages/SettingsPage'
import { hasApiConfiguration } from '../services/api/config'
import {
  getOperatorActionDetail,
  getOperatorActiveStop,
  finalizeOperatorAction,
  getOperatorActions,
  getSystemHealth,
  registerOperatorEvidence,
  saveOperatorChecklistBatch,
  startOperatorAction,
  validateOperatorFinalization,
} from '../services/api/operator'
import type { ChecklistBatchItemInput, EvidenceInput, OperatorActionDetailData, OperatorStopData } from '../types/api'
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
  const [savingEvidence, setSavingEvidence] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [activeStop, setActiveStop] = useState<OperatorStopData | null>(null)

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
      try {
        const stop = await getOperatorActiveStop({
          ativo_id: detail.ativo?.id || detail.acao.ativo_id,
          acao_id: actionId,
        })
        setActiveStop(stop.parada_ativa)
      } catch {
        setActiveStop(null)
      }
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : 'Falha ao abrir a ação.')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  function openActionById(actionId: string) {
    setSelectedActionId(actionId)
    setActionDetail(null)
    setView('action-detail')
    void loadActionDetail(actionId)
  }

  function openAction(action: OperatorAction) {
    openActionById(action.id)
  }

  function closeAction() {
    setView('navigation')
    setSelectedActionId('')
    setActionDetail(null)
    setDetailError('')
    setActiveStop(null)
    void refresh()
  }

  async function startAction() {
    if (!selectedActionId) return
    setStarting(true)
    try {
      const result = await startOperatorAction(selectedActionId)
      setActiveStop(result.parada ?? null)
      notify('Execução iniciada. Equipamento marcado como parado.')
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

  async function finishOperatorExecution(
    items: ChecklistBatchItemInput[],
    resultado: 'OK' | 'NOK',
    observacao: string,
    durationSeconds: number,
  ) {
    if (!selectedActionId) {
      throw new Error('Ação não identificada para finalização.')
    }

    setFinalizing(true)
    setDetailError('')

    try {
      const saved = await saveOperatorChecklistBatch(selectedActionId, items)
      if (saved.error_count > 0) {
        const first = saved.erros?.[0]?.message || 'Alguns itens não foram salvos.'
        throw new Error(first)
      }

      // Verificação técnica silenciosa: apenas impede finalizar checklist incompleto.
      // A aprovação da execução permanece sob responsabilidade da gestão.
      const readiness = await validateOperatorFinalization(selectedActionId)
      if (!readiness.can_finalize) {
        throw new Error(
          readiness.message ||
          'Existem respostas, evidências ou bloqueios pendentes no checklist.',
        )
      }

      const result = await finalizeOperatorAction(selectedActionId, {
        resultado,
        observacao,
        duracao_segundos: durationSeconds,
      })

      setActiveStop(result.parada ?? activeStop)
      await refresh()
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'Falha ao finalizar a execução.'
      setDetailError(message)
      throw cause
    } finally {
      setFinalizing(false)
    }
  }

  function returnHomeAfterCompletion() {
    setView('navigation')
    setSection('home')
    setSelectedActionId('')
    setActionDetail(null)
    setDetailError('')
    setActiveStop(null)
    void refresh()
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
              activeStop={activeStop}
              onContinue={() => setView('checklist')}
            />
          ) : view === 'checklist' && actionDetail ? (
            <ChecklistExecutionPage
              detail={actionDetail}
              evidenceSaving={savingEvidence}
              finalizing={finalizing}
              error={detailError}
              activeStop={activeStop}
              onBack={() => setView('action-detail')}
              onRefresh={refreshCurrentDetail}
              onRegisterEvidence={saveEvidence}
              onFinish={finishOperatorExecution}
              onReturnHome={returnHomeAfterCompletion}
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
              {section === 'qr' && <QrPage onNotify={notify} onOpenAction={openActionById} />}
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
