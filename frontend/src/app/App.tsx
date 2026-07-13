import { useCallback, useEffect, useRef, useState } from 'react'
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
  finalizeOperatorAction,
  getOperatorActionDetail,
  getOperatorActions,
  getOperatorActiveStop,
  getSystemHealth,
  saveOperatorChecklistBatch,
  startOperatorAction,
  uploadOperatorEvidencePhoto,
} from '../services/api/operator'
import {
  clearOperatorCache,
  readActionDetailCache,
  readActionsCache,
  removeActionDetailCache,
  writeActionDetailCache,
  writeActionsCache,
} from '../services/storage/operatorCache'
import type {
  ChecklistBatchItemInput,
  EvidencePhotoUploadInput,
  EvidenceSaveData,
  MaintenanceStartDecision,
  OperatorActionDetailData,
  OperatorStopData,
} from '../types/api'
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
  const [detailRefreshing, setDetailRefreshing] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [starting, setStarting] = useState(false)
  const [savingChecklist, setSavingChecklist] = useState(false)
  const [savingEvidence, setSavingEvidence] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [activeStop, setActiveStop] = useState<OperatorStopData | null>(null)
  const [showDetailOverlay, setShowDetailOverlay] = useState(false)
  const refreshInFlightRef = useRef<Promise<void> | null>(null)

  const configured = hasApiConfiguration()

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      await refreshInFlightRef.current
      return
    }

    const run = (async () => {
      if (!hasApiConfiguration()) {
        setConnectionState('unconfigured')
        setActions([])
        setError('')
        setLoading(false)
        return
      }

      const cached = await readActionsCache()
      const hasCached = cached !== null
      if (hasCached) setActions(cached)
      setLoading(true)

      setError('')
      setConnectionState('checking')

      const [actionsResult, healthResult] = await Promise.allSettled([
        getOperatorActions(),
        getSystemHealth(),
      ])

      if (actionsResult.status === 'fulfilled') {
        setActions(actionsResult.value)
        await writeActionsCache(actionsResult.value)
        setConnectionState('online')
      } else {
        const message =
          actionsResult.reason instanceof Error
            ? actionsResult.reason.message
            : 'Falha ao carregar a fila do operador.'
        setError(message)
        if (!hasCached) setActions([])
      }

      if (healthResult.status === 'fulfilled') {
        setApiVersion(healthResult.value.version)
        setConnectionState('online')
      } else if (actionsResult.status === 'rejected') {
        setConnectionState('offline')
      }

      setLoading(false)
    })()

    refreshInFlightRef.current = run
    try {
      await run
    } finally {
      refreshInFlightRef.current = null
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh, configurationRevision])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const refreshOnFocus = () => void refresh()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 45_000)

    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [refresh])

  useEffect(() => {
    const blocking = detailLoading && !actionDetail
    if (!blocking) {
      setShowDetailOverlay(false)
      return
    }

    const timer = window.setTimeout(() => setShowDetailOverlay(true), 320)
    return () => window.clearTimeout(timer)
  }, [detailLoading, actionDetail])

  const loadActionDetail = useCallback(async (actionId: string, forceBlocking = false) => {
    setDetailError('')
    const cached = forceBlocking ? null : await readActionDetailCache(actionId)

    if (cached) {
      setActionDetail(cached)
      setDetailLoading(false)
      setDetailRefreshing(true)
    } else {
      setDetailLoading(true)
      setDetailRefreshing(false)
    }

    try {
      const detail = await getOperatorActionDetail(actionId)
      setActionDetail(detail)
      await writeActionDetailCache(actionId, detail)
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
      const message = cause instanceof Error ? cause.message : 'Falha ao abrir a ação.'
      if (!cached) setDetailError(message)
      else notify('Exibindo dados salvos. Atualização online indisponível.')
    } finally {
      setDetailLoading(false)
      setDetailRefreshing(false)
    }
  }, [])

  function openActionById(actionId: string) {
    setSelectedActionId(actionId)
    setActionDetail(null)
    setDetailLoading(true)
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
      await removeActionDetailCache(selectedActionId)

      notify(
        result.modo_execucao_manutencao === 'SEM_PARADA'
          ? 'Execução iniciada sem parada do equipamento.'
          : 'Execução iniciada com parada técnica da manutenção.',
      )

      await Promise.all([loadActionDetail(selectedActionId, true), refresh()])
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
    await loadActionDetail(selectedActionId, true)
  }

  async function saveChecklistProgress(items: ChecklistBatchItemInput[]) {
    if (!selectedActionId || items.length === 0) return
    setSavingChecklist(true)
    setDetailError('')
    try {
      const result = await saveOperatorChecklistBatch(selectedActionId, items)
      if (result.error_count > 0) {
        throw new Error(result.erros?.[0]?.message || 'Alguns itens não foram salvos.')
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

  async function saveEvidencePhotos(inputs: EvidencePhotoUploadInput[]): Promise<EvidenceSaveData[]> {
    if (!selectedActionId || !actionDetail?.execucao?.id) {
      throw new Error('Execução não identificada para registrar evidência.')
    }
    if (!inputs.length) return []

    setSavingEvidence(true)
    setDetailError('')
    try {
      const saved: EvidenceSaveData[] = []
      for (const input of inputs) {
        saved.push(
          await uploadOperatorEvidencePhoto(
            selectedActionId,
            actionDetail.execucao.id,
            input,
          ),
        )
      }
      await removeActionDetailCache(selectedActionId)
      await refreshCurrentDetail()
      notify(`${saved.length} foto(s) registrada(s)`)
      return saved
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
    if (!selectedActionId) throw new Error('Ação não identificada para finalização.')

    setFinalizing(true)
    setDetailError('')
    try {
      const saved = await saveOperatorChecklistBatch(selectedActionId, items)
      if (saved.error_count > 0) {
        throw new Error(saved.erros?.[0]?.message || 'Alguns itens não foram salvos.')
      }

      const result = await finalizeOperatorAction(selectedActionId, {
        resultado,
        observacao,
        duracao_segundos: durationSeconds,
      })

      setActiveStop(result.parada_operacional ?? result.parada ?? activeStop)
      await removeActionDetailCache(selectedActionId)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Falha ao finalizar a execução.'
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
    void clearOperatorCache()
    setConfigurationRevision((value) => value + 1)
    setSection('home')
    setView('navigation')
    notify('Configuração salva')
  }

  function changeSection(next: AppSection) {
    setView('navigation')
    setSection(next)
    if (next === 'home') void refresh()
  }

  const operationOverlay = showDetailOverlay
    ? {
        visible: true,
        title: 'Carregando ação',
        description: 'Primeiro acesso: consultando análise técnica e checklist.',
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
              title: 'Enviando evidências',
              description: 'Compactando e sincronizando as fotos com a execução.',
            }
          : {
              visible: false,
              title: '',
              description: '',
            }

  return (
    <div className="app-stage">
      <section className="app-frame">
        <AppHeader operatorName="Carlos" shift="Turno A" connectionState={connectionState} />

        <main className="app-content">
          {view === 'action-detail' ? (
            <ActionDetailPage
              detail={actionDetail}
              loading={detailLoading && !actionDetail}
              error={detailError}
              starting={starting}
              onBack={closeAction}
              onRetry={() => void loadActionDetail(selectedActionId, true)}
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
              onRegisterEvidence={saveEvidencePhotos}
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

        {view === 'navigation' && <BottomNavigation active={section} onChange={changeSection} />}

        {detailRefreshing && actionDetail && (
          <div className="background-refresh" role="status">Atualizando dados…</div>
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
