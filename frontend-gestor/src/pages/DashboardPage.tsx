import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GestorSection } from '../components/AppNavigation'
import { ActionReviewDialog } from '../components/ActionReviewDialog'
import {
  AlertIcon,
  AssetIcon,
  ChevronRightIcon,
  RefreshIcon,
  StopIcon,
  ValidationIcon,
} from '../components/Icons'
import {
  getGestorChecklistModels,
  getGestorOverview,
  isGestorAuthenticationError,
} from '../services/api/gestor'
import type {
  GestorAction,
  GestorDecisionResult,
  GestorOverview,
} from '../types/gestor'

export interface DashboardPageProps {
  onNavigate: (section: GestorSection) => void
  onQueueCountChange: (count: number) => void
  onSessionExpired: () => void
}

const EMPTY_OVERVIEW: GestorOverview = {
  actions: [],
  validationQueue: [],
  stops: [],
  openStops: [],
  occurrences: [],
  kpis: {
    ativo_id: 'TODOS',
    total_execucoes: 0,
    execucoes_finalizadas: 0,
    falhas_registradas: 0,
    acoes_abertas: 0,
    mttr_segundos: 0,
    disponibilidade_base_pct: 0,
  },
  counts: {
    pending: 0,
    executing: 0,
    awaitingValidation: 0,
    blocked: 0,
    openStops: 0,
    awaitingOccurrences: 0,
  },
}

function formatDate(value?: string): string {
  if (!value) return 'Sem data registrada'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed)
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(seconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${minutes} min`
  return minutes ? `${hours}h ${minutes}min` : `${hours}h`
}

function actionTitle(action: GestorAction): string {
  return action.titulo?.trim() || 'Ação sem título'
}

export function DashboardPage({
  onNavigate,
  onQueueCountChange,
  onSessionExpired,
}: DashboardPageProps) {
  const [overview, setOverview] = useState<GestorOverview>(EMPTY_OVERVIEW)
  const [modelValidationCount, setModelValidationCount] = useState(0)
  const [selectedAction, setSelectedAction] = useState<GestorAction | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')
  const [decisionNotice, setDecisionNotice] = useState('')

  const load = useCallback(
    async (signal?: AbortSignal, background = false) => {
      if (background) setRefreshing(true)
      else setLoading(true)
      setError('')

      try {
        const [overviewData, models] = await Promise.all([
          getGestorOverview(signal),
          getGestorChecklistModels(signal),
        ])
        setOverview(overviewData)
        setModelValidationCount(models.length)
        setUpdatedAt(new Date().toISOString())
        onQueueCountChange(overviewData.validationQueue.length + models.length)
      } catch (cause) {
        if (signal?.aborted) return
        if (isGestorAuthenticationError(cause)) {
          onSessionExpired()
          return
        }
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar a visão do gestor.',
        )
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [onQueueCountChange, onSessionExpired],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function handleDecisionComplete(result: GestorDecisionResult) {
    setDecisionNotice(
      result.decisao === 'APROVAR'
        ? 'Execução aprovada e removida da fila de validação.'
        : 'Execução devolvida para a fila operacional.',
    )
    await load(undefined, true)
  }

  const criticalOccurrence = useMemo(() => {
    const score: Record<string, number> = { CRITICA: 4, CRÍTICA: 4, ALTA: 3, MEDIA: 2, MÉDIA: 2, BAIXA: 1 }
    return [...overview.occurrences].sort(
      (left, right) =>
        (score[String(right.severidade ?? '').toUpperCase()] ?? 0) -
        (score[String(left.severidade ?? '').toUpperCase()] ?? 0),
    )[0]
  }, [overview.occurrences])

  const metrics = [
    {
      label: 'Execuções para validar',
      value: overview.counts.awaitingValidation,
      tone: 'attention',
    },
    {
      label: 'Modelos técnicos',
      value: modelValidationCount,
      tone: 'active',
    },
    {
      label: 'Paradas abertas',
      value: overview.counts.openStops,
      tone: 'danger',
    },
    {
      label: 'Anormalidades',
      value: overview.counts.awaitingOccurrences,
      tone: 'neutral',
    },
  ] as const

  return (
    <>
      <main className="content dashboard">
        <section className="page-heading">
          <div>
            <span className="eyebrow">VISÃO GERAL</span>
            <h1>Supervisão operacional</h1>
            <p>Acompanhe decisões, paradas e pendências técnicas em uma única fila.</p>
          </div>

          <button
            className="icon-text-button"
            type="button"
            disabled={loading || refreshing}
            onClick={() => void load(undefined, true)}
          >
            <RefreshIcon />
            {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
        </section>

        {decisionNotice ? (
          <div className="dashboard-notice" role="status">
            <span>{decisionNotice}</span>
            <button type="button" onClick={() => setDecisionNotice('')}>Fechar</button>
          </div>
        ) : null}

        {error ? (
          <div className="dashboard-error" role="alert">
            <strong>Falha ao atualizar o painel.</strong>
            <span>{error}</span>
          </div>
        ) : null}

        {criticalOccurrence ? (
          <button
            className="critical-alert"
            type="button"
            onClick={() => onNavigate('validations')}
          >
            <span className="critical-alert__icon"><AlertIcon /></span>
            <span className="critical-alert__copy">
              <small>ANORMALIDADE {String(criticalOccurrence.severidade ?? 'EM ANÁLISE')}</small>
              <strong>{criticalOccurrence.titulo || 'Condição operacional registrada'}</strong>
              <span>{criticalOccurrence.descricao || criticalOccurrence.ativo_id || 'Abrir central técnica'}</span>
            </span>
            <span className="critical-alert__action">Analisar <ChevronRightIcon /></span>
          </button>
        ) : null}

        <section className="metric-grid" aria-label="Indicadores operacionais">
          {metrics.map((metric) => (
            <article className={`metric-card metric-card--${metric.tone}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{loading ? '—' : metric.value}</strong>
            </article>
          ))}
        </section>

        <section className="dashboard-layout">
          <div className="section-stack">
            <header className="section-heading">
              <div>
                <span className="eyebrow">MINHA FILA TÉCNICA</span>
                <h2>Aguardando decisão</h2>
              </div>
              <button className="text-button" type="button" onClick={() => onNavigate('validations')}>
                Ver tudo
              </button>
            </header>

            {loading ? (
              <p className="panel-state">Carregando fila de validação…</p>
            ) : overview.validationQueue.length === 0 ? (
              <p className="panel-state">Nenhuma execução aguarda validação.</p>
            ) : (
              <div className="technical-queue">
                {overview.validationQueue.slice(0, 5).map((action) => (
                  <article className="queue-card" key={action.id}>
                    <div className="queue-card__icon"><ValidationIcon /></div>
                    <div className="queue-card__body">
                      <div className="queue-card__topline">
                        <span className="status-pill">EXECUÇÃO</span>
                        <span className="priority-chip">{action.prioridade || 'NORMAL'}</span>
                      </div>
                      <h3>{actionTitle(action)}</h3>
                      <p>
                        {action.ativo_tag || action.ativo_id || 'Ativo não informado'}
                        {action.ativo_nome ? ` · ${action.ativo_nome}` : ''}
                      </p>
                      <footer>
                        <span>{formatDate(action.finalizado_em || action.atualizado_em || action.gerado_em)}</span>
                        <button type="button" onClick={() => setSelectedAction(action)}>Revisar</button>
                      </footer>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <aside className="section-stack">
            <header className="section-heading">
              <div>
                <span className="eyebrow">AÇÕES RÁPIDAS</span>
                <h2>Supervisão técnica</h2>
              </div>
            </header>

            <div className="quick-action-grid">
              <button type="button" onClick={() => onNavigate('validations')}>
                <ValidationIcon />
                <span><strong>Validar filas</strong><small>Execuções e modelos técnicos.</small></span>
              </button>
              <button type="button" onClick={() => onNavigate('assets')}>
                <AssetIcon />
                <span><strong>Consultar ativos</strong><small>Equipamentos e componentes.</small></span>
              </button>
              <button type="button" onClick={() => onNavigate('validations')}>
                <StopIcon />
                <span><strong>Ver paradas</strong><small>{overview.counts.openStops} registro(s) em aberto.</small></span>
              </button>
            </div>

            <article className="kpi-card">
              <div>
                <span>Disponibilidade base</span>
                <strong>{overview.kpis.disponibilidade_base_pct.toLocaleString('pt-BR')}%</strong>
              </div>
              <small>KPI operacional atual</small>
            </article>
            <article className="kpi-card">
              <div>
                <span>MTTR médio</span>
                <strong>{formatDuration(overview.kpis.mttr_segundos)}</strong>
              </div>
              <small>{overview.kpis.execucoes_finalizadas} execução(ões) finalizada(s)</small>
            </article>

            <p className="last-update">
              Última atualização: {updatedAt ? formatDate(updatedAt) : 'pendente'}
            </p>
          </aside>
        </section>
      </main>

      {selectedAction ? (
        <ActionReviewDialog
          action={selectedAction}
          onClose={() => setSelectedAction(null)}
          onDecisionComplete={handleDecisionComplete}
          onSessionExpired={onSessionExpired}
        />
      ) : null}
    </>
  )
}
