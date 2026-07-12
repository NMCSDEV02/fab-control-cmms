import { useCallback, useEffect, useState } from 'react'
import { AppHeader, type ConnectionState } from '../components/AppHeader'
import { BottomNavigation, type AppSection } from '../components/BottomNavigation'
import { OperationOverlay } from '../components/OperationOverlay'
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
} from '../services/api/operator'
import type { ChecklistBatchItemInput, EvidenceInput, MaintenanceStartDecision, OperatorActionDetailData, OperatorStopData } from '../types/api'
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

  async function startAction(decision: MaintenanceStartDecision) {
    if (!selectedActionId) return
    setStarting(true)
    setDetailError('')
    try {
      const result = await startOperatorAction(selectedActionId, decision)
      setActiveStop(result.parada_operacional ?? result.parada ?? activeStop)

      if (result.modo_execucao_manutencao === 'SEM_PARADA') {
        notify('Execução iniciada sem parada do equipamento.')
      } else {
        notify('Execução iniciada com parada técnica da manutenção.')
      }

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

  async function saveChecklistProgress(items: ChecklistBatchItemInput[]) {
    if (!selectedActionId || items.length === 0) return
    setSavingChecklist(true)
    setDetailError('')
    try {
      const result = await saveOperatorChecklistBatch(selectedActionId, items)
      if (result.error_count > 0) {
        const first = result.erros?.[0]?.message || 'Alguns itens não foram salvos.'
        throw new Error(first)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Falha ao salvar o progresso.'
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

      // O endpoint final já verifica respostas, evidências e bloqueios.
      // A aprovação continua sendo responsabilidade da gestão.
      const result = await finalizeOperatorAction(selectedActionId, {
        resultado,
        observacao,
        duracao_segundos: durationSeconds,
      })

      setActiveStop(result.parada_operacional ?? result.parada ?? activeStop)
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

  const operationOverlay = detailLoading
    ? {
        visible: true,
        title: 'Carregando ação',
        description: 'Consultando análise técnica e checklist.',
      }
    : starting
      ? {
          visible: true,
          title: 'Iniciando execução',
          description: 'Preparando checklist e condição do equipamento.',
        }
      : savingChecklist
        ? {
            visible: true,
            title: 'Salvando progresso',
            description: 'Protegendo as respostas já preenchidas.',
          }
        : savingEvidence
          ? {
              visible: true,
              title: 'Registrando evidência',
              description: 'Sincronizando o arquivo com a execução.',
            }
          : {
              visible: false,
              title: '',
              description: '',
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
              onSaveProgress={saveChecklistProgress}
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

        <OperationOverlay
          visible={operationOverlay.visible}
          title={operationOverlay.title}
          description={operationOverlay.description}
        />

        <div className={toast ? 'toast toast--visible' : 'toast'} role="status" aria-live="polite">
          {toast}
        </div>
      </section>
    </div>
  )
}
