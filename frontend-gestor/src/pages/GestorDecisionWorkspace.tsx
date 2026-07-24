import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActionReviewDialog } from '../components/ActionReviewDialog'
import { ChecklistModelReviewDialog } from '../components/ChecklistModelReviewDialog'
import {
  AlertIcon,
  CheckIcon,
  ChevronRightIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
} from '../components/Icons'
import { TechnicalAnalysisDialog } from '../components/TechnicalAnalysisDialog'
import { TechnicalDemandDialog } from '../components/TechnicalDemandDialog'
import {
  getGestorActions,
  getGestorChecklistModels,
  getGestorOccurrences,
  getGestorTechnicalContext,
  getGestorTechnicalDemands,
  isGestorAuthenticationError,
} from '../services/api/gestor'
import type {
  GestorAction,
  GestorChecklistModel,
  GestorChecklistModelDecisionResult,
  GestorDecisionResult,
  GestorOccurrence,
  GestorTechnicalContext,
  GestorTechnicalDemand,
  GestorWorkView,
} from '../types/gestor'

export interface GestorDecisionFocus {
  kind?: 'demand' | 'action' | 'model' | 'occurrence'
  id?: string
}

interface GestorDecisionWorkspaceProps {
  initialView?: GestorWorkView
  focus?: GestorDecisionFocus | null
  onQueueCountChange: (count: number) => void
  onOpenAnalytics: (assetId?: string) => void
  onSessionExpired: () => void
}

type DecisionKind = NonNullable<GestorDecisionFocus['kind']>
type QueueFilter = GestorWorkView | 'all'

interface DecisionItem {
  id: string
  kind: DecisionKind
  view: GestorWorkView
  title: string
  category: string
  context: string
  description: string
  priority: string
  status: string
  nextAction: string
  nextDetail: string
  overdue: boolean
  assetId?: string
  createdAt?: string
  raw:
    | GestorTechnicalDemand
    | GestorAction
    | GestorChecklistModel
    | GestorOccurrence
}

const PRIORITY_SCORE: Record<string, number> = {
  CRITICA: 5,
  CRÍTICA: 5,
  ALTA: 4,
  MEDIA: 3,
  MÉDIA: 3,
  NORMAL: 2,
  BAIXA: 1,
}

function upper(value: unknown): string {
  return String(value ?? '').trim().toLocaleUpperCase('pt-BR')
}

function humanize(value: unknown): string {
  const normalized = String(value ?? '')
    .trim()
    .replaceAll('_', ' ')
    .toLocaleLowerCase('pt-BR')
  return normalized
    ? normalized.charAt(0).toLocaleUpperCase('pt-BR') + normalized.slice(1)
    : 'Não informado'
}

function formatDate(value?: string): string {
  if (!value) return 'sem data registrada'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function demandNextStep(demand: GestorTechnicalDemand) {
  if (!demand.responsavel_atual_id) {
    return {
      label: 'Assumir e analisar',
      detail: 'Confirme a responsabilidade para iniciar o atendimento.',
    }
  }
  const pending = Math.max(
    0,
    Number(demand.assinaturas_necessarias ?? 0) -
      Number(demand.assinaturas_realizadas ?? 0),
  )
  if (pending > 0) {
    return {
      label: 'Concluir assinaturas',
      detail: `${pending} assinatura(s) técnica(s) ainda pendente(s).`,
    }
  }
  if (
    ['CHECKLIST_MODELO', 'PLANO_CHECKLIST'].includes(
      upper(demand.entidade_tipo),
    )
  ) {
    return {
      label: 'Revisar checklist',
      detail: 'Confira todas as etapas, instruções e evidências antes de decidir.',
    }
  }
  return upper(demand.entidade_tipo) === 'ORDEM_SERVICO_RASCUNHO'
    ? {
      label: 'Revisar e liberar',
      detail: 'O resumo do Operador já está preparado para sua confirmação.',
    }
    : {
      label: 'Registrar decisão',
      detail: 'Aprove o conteúdo ou peça um ajuste ao Administrador.',
    }
}

function includesSearch(item: DecisionItem, search: string): boolean {
  if (!search) return true
  const normalized = search.toLocaleLowerCase('pt-BR')
  return [
    item.id,
    item.title,
    item.context,
    item.description,
    item.status,
    item.assetId,
  ].some((value) =>
    String(value ?? '').toLocaleLowerCase('pt-BR').includes(normalized),
  )
}

export function GestorDecisionWorkspace({
  focus,
  onQueueCountChange,
  onOpenAnalytics,
  onSessionExpired,
}: GestorDecisionWorkspaceProps) {
  const [demands, setDemands] = useState<GestorTechnicalDemand[]>([])
  const [actions, setActions] = useState<GestorAction[]>([])
  const [models, setModels] = useState<GestorChecklistModel[]>([])
  const [occurrences, setOccurrences] = useState<GestorOccurrence[]>([])
  const [technicalContext, setTechnicalContext] =
    useState<GestorTechnicalContext | null>(null)
  const [activeView, setActiveView] = useState<QueueFilter>('all')
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedDemand, setSelectedDemand] =
    useState<GestorTechnicalDemand | null>(null)
  const [selectedAction, setSelectedAction] = useState<GestorAction | null>(null)
  const [selectedModel, setSelectedModel] =
    useState<GestorChecklistModel | null>(null)
  const [selectedOccurrence, setSelectedOccurrence] =
    useState<GestorOccurrence | null>(null)

  const load = useCallback(async (signal?: AbortSignal, background = false) => {
    if (background) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const [actionData, modelData, occurrenceData, demandData, contextData] =
        await Promise.all([
          getGestorActions(signal),
          getGestorChecklistModels(signal),
          getGestorOccurrences(signal),
          getGestorTechnicalDemands(signal),
          getGestorTechnicalContext(signal),
        ])
      const validationActions = actionData.filter(
        (action) => upper(action.status) === 'AGUARDANDO_VALIDACAO',
      )
      const routedChecklistIds = new Set(
        demandData
          .filter((demand) =>
            ['CHECKLIST_MODELO', 'PLANO_CHECKLIST'].includes(
              upper(demand.entidade_tipo),
            ),
          )
          .map((demand) => String(demand.entidade_id || ''))
          .filter(Boolean),
      )
      const standaloneModels = modelData.filter(
        (model) => !routedChecklistIds.has(String(model.id)),
      )
      setActions(validationActions)
      setModels(standaloneModels)
      setOccurrences(occurrenceData)
      setDemands(demandData)
      setTechnicalContext(contextData)
      onQueueCountChange(
        demandData.length +
        validationActions.length +
        standaloneModels.length +
        occurrenceData.length,
      )
    } catch (cause) {
      if (signal?.aborted) return
      if (isGestorAuthenticationError(cause)) {
        onSessionExpired()
        return
      }
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível organizar as decisões.',
      )
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [onQueueCountChange, onSessionExpired])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const items = useMemo<DecisionItem[]>(() => {
    const demandItems = demands.map((demand): DecisionItem => {
      const next = demandNextStep(demand)
      return {
        id: demand.id,
        kind: 'demand',
        view: 'demands',
        title: demand.titulo,
        category: humanize(demand.entidade_tipo),
        context: [
          demand.area_atual_nome || 'Sem área',
          demand.cargo_atual_nome,
        ].filter(Boolean).join(' · '),
        description:
          demand.descricao || 'Solicitação enviada para validação técnica.',
        priority: upper(demand.prioridade || 'MEDIA'),
        status: demand.status,
        nextAction: next.label,
        nextDetail: next.detail,
        overdue: Boolean(
          demand.sla_resolucao_atrasado || demand.sla_resposta_atrasado,
        ),
        createdAt: demand.criado_em || demand.atualizado_em,
        raw: demand,
      }
    })
    const actionItems = actions.map((action): DecisionItem => ({
      id: action.id,
      kind: 'action',
      view: 'actions',
      title: action.titulo || 'Execução sem título',
      category: 'Execução concluída',
      context: [
        action.ativo_tag || action.ativo_nome || action.ativo_id,
        action.componente_nome,
      ].filter(Boolean).join(' · '),
      description: 'Checklist concluído e aguardando sua auditoria.',
      priority: upper(action.prioridade || 'NORMAL'),
      status: action.status,
      nextAction: 'Auditar execução',
      nextDetail: 'Confira respostas, evidências e o resultado registrado.',
      overdue: false,
      assetId: action.ativo_id,
      createdAt:
        action.finalizado_em || action.atualizado_em || action.gerado_em,
      raw: action,
    }))
    const modelItems = models.map((model): DecisionItem => ({
      id: model.id,
      kind: 'model',
      view: 'models',
      title: model.nome || 'Checklist sem nome',
      category: `Checklist R${model.revisao ?? 1}`,
      context: [
        model.ativo_tag || model.ativo_nome || model.ativo_id,
        `${model.itens_count ?? 0} item(ns)`,
      ].filter(Boolean).join(' · '),
      description: 'Modelo enviado pelo Administrador para validação.',
      priority: upper(model.criticidade || 'NORMAL'),
      status: model.workflow_status || model.status || 'EM_VALIDACAO_GESTAO',
      nextAction: 'Validar checklist',
      nextDetail: 'Revise instruções, limites e critérios de aceite.',
      overdue: false,
      assetId: model.ativo_id,
      createdAt: model.enviado_validacao_em || model.atualizado_em,
      raw: model,
    }))
    const occurrenceItems = occurrences.map((occurrence): DecisionItem => ({
      id: occurrence.id,
      kind: 'occurrence',
      view: 'operations',
      title: occurrence.titulo || 'Ocorrência operacional',
      category: 'Ocorrência',
      context: occurrence.ativo_id || 'Ativo não informado',
      description:
        occurrence.descricao || 'Ocorrência aguardando análise técnica.',
      priority: upper(occurrence.severidade || 'MEDIA'),
      status: occurrence.status,
      nextAction: 'Analisar ocorrência',
      nextDetail: 'Veja o histórico do ativo e gere uma recomendação assistida.',
      overdue: false,
      assetId: occurrence.ativo_id,
      createdAt: occurrence.criado_em,
      raw: occurrence,
    }))

    return [...demandItems, ...actionItems, ...modelItems, ...occurrenceItems]
      .sort((left, right) => {
        if (left.overdue !== right.overdue) return left.overdue ? -1 : 1
        const priorityDifference =
          (PRIORITY_SCORE[right.priority] ?? 0) -
          (PRIORITY_SCORE[left.priority] ?? 0)
        if (priorityDifference) return priorityDifference
        return String(left.createdAt ?? '').localeCompare(
          String(right.createdAt ?? ''),
        )
      })
  }, [actions, demands, models, occurrences])

  const counts = useMemo(() => ({
    demands: items.filter((item) => item.view === 'demands').length,
    actions: items.filter((item) => item.view === 'actions').length,
    models: items.filter((item) => item.view === 'models').length,
    operations: items.filter((item) => item.view === 'operations').length,
  }), [items])

  const filteredItems = useMemo(() => items.filter((item) => {
    if (activeView !== 'all' && item.view !== activeView) return false
    if (priority && item.priority !== priority) return false
    return includesSearch(item, search.trim())
  }), [activeView, items, priority, search])

  useEffect(() => {
    if (focus?.kind && focus.id) {
      const focused = items.find(
        (item) => item.kind === focus.kind && item.id === focus.id,
      )
      if (focused) {
        setActiveView('all')
        setSelectedId(focused.id)
        return
      }
    }
    setSelectedId((current) =>
      filteredItems.some((item) => item.id === current)
        ? current
        : filteredItems[0]?.id ?? '',
    )
  }, [filteredItems, focus, items])

  const selected =
    filteredItems.find((item) => item.id === selectedId) ?? null
  const remainingItems = selected
    ? filteredItems.filter((item) => item.id !== selected.id)
    : filteredItems
  const criticalCount = items.filter(
    (item) => item.overdue || ['CRITICA', 'CRÍTICA'].includes(item.priority),
  ).length

  async function changed(message: string) {
    setSelectedDemand(null)
    setSelectedAction(null)
    setSelectedModel(null)
    setSelectedOccurrence(null)
    setNotice(message)
    await load(undefined, true)
  }

  function openDecision(item: DecisionItem) {
    if (item.kind === 'demand') {
      setSelectedDemand(item.raw as GestorTechnicalDemand)
    }
    if (item.kind === 'action') setSelectedAction(item.raw as GestorAction)
    if (item.kind === 'model') {
      setSelectedModel(item.raw as GestorChecklistModel)
    }
    if (item.kind === 'occurrence') {
      setSelectedOccurrence(item.raw as GestorOccurrence)
    }
  }

  return (
    <>
      <main className="content manager-decision-workspace">
        <section className="manager-workspace-heading">
          <div>
            <span className="eyebrow">MODO DECISÃO</span>
            <h1>Decisões de hoje</h1>
            <p>Comece pelo primeiro item. O sistema já organizou o restante.</p>
          </div>
          <div className="manager-workspace-heading__status">
            <span><strong>{items.length}</strong> para decidir</span>
            <span className={criticalCount ? 'is-critical' : ''}>
              <strong>{criticalCount}</strong> críticos
            </span>
            <button
              type="button"
              disabled={loading || refreshing}
              onClick={() => void load(undefined, true)}
              aria-label="Atualizar decisões"
              title="Atualizar"
            >
              <RefreshIcon />
            </button>
          </div>
        </section>

        {notice ? (
          <div className="dashboard-notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')}>Fechar</button>
          </div>
        ) : null}
        {error ? (
          <div className="dashboard-error" role="alert">
            <strong>Falha ao atualizar.</strong>
            <span>{error}</span>
          </div>
        ) : null}

        <section className="manager-simple-search">
          <div className="manager-decision-search">
            <label>
              <SearchIcon />
              <input
                value={search}
                placeholder="Buscar uma decisão"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              className={
                filtersOpen || priority || activeView !== 'all'
                  ? 'is-active'
                  : ''
              }
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              Refinar
            </button>
            {filtersOpen ? (
              <div className="manager-filter-popover">
                <label>
                  <span>Mostrar</span>
                  <select
                    value={activeView}
                    onChange={(event) =>
                      setActiveView(event.target.value as QueueFilter)}
                  >
                    <option value="all">Tudo ({items.length})</option>
                    <option value="demands">Solicitações ({counts.demands})</option>
                    <option value="actions">Execuções ({counts.actions})</option>
                    <option value="models">Checklists ({counts.models})</option>
                    <option value="operations">Ocorrências ({counts.operations})</option>
                  </select>
                </label>
                <label>
                  <span>Prioridade</span>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                  >
                    <option value="">Todas</option>
                    <option value="CRITICA">Crítica</option>
                    <option value="ALTA">Alta</option>
                    <option value="MEDIA">Média</option>
                    <option value="NORMAL">Normal</option>
                    <option value="BAIXA">Baixa</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPriority('')
                    setActiveView('all')
                  }}
                >
                  Limpar filtros
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section
          className={`manager-simple-decision-stage${remainingItems.length ? '' : ' is-single'}`}
        >
          {loading ? (
            <p className="panel-state">Organizando o que vem primeiro…</p>
          ) : null}
          {!loading && !selected ? (
            <div className="manager-decision-empty">
              <CheckIcon />
              <strong>Nada para decidir agora</strong>
              <span>Quando algo exigir sua atenção, aparecerá aqui.</span>
            </div>
          ) : null}

          {selected ? (
            <article className="manager-now-card">
              <header>
                <div>
                  <span className="manager-now-label">AGORA</span>
                  <small>{selected.category}</small>
                </div>
                <b className={selected.overdue ? 'is-overdue' : ''}>
                  {selected.overdue
                    ? 'SLA vencido'
                    : humanize(selected.priority)}
                </b>
              </header>
              <h2>{selected.title}</h2>
              <p className="manager-now-context">{selected.context}</p>
              <p className="manager-now-description">{selected.description}</p>
              <section>
                <span><ChevronRightIcon /></span>
                <div>
                  <small>PRÓXIMO PASSO</small>
                  <strong>{selected.nextAction}</strong>
                  <p>{selected.nextDetail}</p>
                </div>
              </section>
              <footer>
                <span>Recebido em {formatDate(selected.createdAt)}</span>
                <div>
                  {selected.assetId ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => onOpenAnalytics(selected.assetId)}
                    >
                      Ver equipamento
                    </button>
                  ) : null}
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => openDecision(selected)}
                  >
                    {selected.kind === 'occurrence'
                      ? <AlertIcon />
                      : <ShieldIcon />}
                    {selected.nextAction}
                  </button>
                </div>
              </footer>
            </article>
          ) : null}

          {selected && remainingItems.length > 0 ? (
            <aside className="manager-later-queue" aria-label="Próximas decisões">
              <header>
                <div>
                  <small>DEPOIS</small>
                  <strong>Próximas decisões</strong>
                </div>
                <span>{remainingItems.length}</span>
              </header>
              <div>
                {remainingItems.map((item) => (
                  <button
                    type="button"
                    key={`${item.kind}-${item.id}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span
                      className={`manager-queue-signal is-${item.priority.toLocaleLowerCase('pt-BR')}`}
                    />
                    <span>
                      <small>
                        {item.category}
                        {item.overdue ? ' · SLA vencido' : ''}
                      </small>
                      <strong>{item.title}</strong>
                      <p>{item.nextAction}</p>
                    </span>
                    <ChevronRightIcon />
                  </button>
                ))}
              </div>
            </aside>
          ) : null}
        </section>
      </main>

      {selectedAction ? (
        <ActionReviewDialog
          action={selectedAction}
          onClose={() => setSelectedAction(null)}
          onDecisionComplete={(result: GestorDecisionResult) => changed(
            result.decisao === 'APROVAR'
              ? 'Execução aprovada.'
              : 'Execução devolvida para correção.',
          )}
          onSessionExpired={onSessionExpired}
        />
      ) : null}
      {selectedModel ? (
        <ChecklistModelReviewDialog
          model={selectedModel}
          onClose={() => setSelectedModel(null)}
          onDecisionComplete={(result: GestorChecklistModelDecisionResult) => changed(
            result.decisao === 'APROVAR'
              ? 'Checklist técnico aprovado.'
              : 'Checklist devolvido ao Administrador.',
          )}
          onSessionExpired={onSessionExpired}
        />
      ) : null}
      {selectedDemand && technicalContext ? (
        <TechnicalDemandDialog
          demand={selectedDemand}
          context={technicalContext}
          onClose={() => setSelectedDemand(null)}
          onProgress={async (message) => {
            setNotice(message)
            await load(undefined, true)
          }}
          onChanged={changed}
          onSessionExpired={onSessionExpired}
        />
      ) : null}
      {selectedOccurrence ? (
        <TechnicalAnalysisDialog
          occurrence={selectedOccurrence}
          onClose={() => setSelectedOccurrence(null)}
          onChanged={changed}
        />
      ) : null}
    </>
  )
}
