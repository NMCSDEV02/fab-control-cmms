import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActionReviewDialog } from '../components/ActionReviewDialog'
import { ChecklistModelReviewDialog } from '../components/ChecklistModelReviewDialog'
import { TechnicalAnalysisDialog } from '../components/TechnicalAnalysisDialog'
import { TechnicalDemandDialog } from '../components/TechnicalDemandDialog'
import { AlertIcon, RefreshIcon, SearchIcon, StopIcon, ValidationIcon } from '../components/Icons'
import {
  getGestorActions,
  getGestorChecklistModels,
  getGestorOccurrences,
  getGestorStops,
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
  GestorStop,
  GestorTechnicalContext,
  GestorTechnicalDemand,
} from '../types/gestor'

export interface ValidationsPageProps {
  onQueueCountChange: (count: number) => void
  onSessionExpired: () => void
}

type ValidationTab = 'demands' | 'actions' | 'models' | 'operations'

function upper(value: unknown): string {
  return String(value ?? '').trim().toUpperCase()
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

function includesSearch(values: unknown[], search: string): boolean {
  if (!search) return true
  const normalized = search.toLocaleLowerCase('pt-BR')
  return values.some((value) =>
    String(value ?? '').toLocaleLowerCase('pt-BR').includes(normalized),
  )
}

export function ValidationsPage({
  onQueueCountChange,
  onSessionExpired,
}: ValidationsPageProps) {
  const [tab, setTab] = useState<ValidationTab>('demands')
  const [demands, setDemands] = useState<GestorTechnicalDemand[]>([])
  const [technicalContext, setTechnicalContext] = useState<GestorTechnicalContext | null>(null)
  const [actions, setActions] = useState<GestorAction[]>([])
  const [models, setModels] = useState<GestorChecklistModel[]>([])
  const [stops, setStops] = useState<GestorStop[]>([])
  const [occurrences, setOccurrences] = useState<GestorOccurrence[]>([])
  const [selectedDemand, setSelectedDemand] = useState<GestorTechnicalDemand | null>(null)
  const [selectedAction, setSelectedAction] = useState<GestorAction | null>(null)
  const [selectedModel, setSelectedModel] = useState<GestorChecklistModel | null>(null)
  const [selectedOccurrence, setSelectedOccurrence] = useState<GestorOccurrence | null>(null)
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(
    async (signal?: AbortSignal, background = false) => {
      if (background) setRefreshing(true)
      else setLoading(true)
      setError('')

      try {
        const [
          actionData,
          modelData,
          stopData,
          occurrenceData,
          demandData,
          contextData,
        ] = await Promise.all([
          getGestorActions(signal),
          getGestorChecklistModels(signal),
          getGestorStops(signal),
          getGestorOccurrences(signal),
          getGestorTechnicalDemands(signal),
          getGestorTechnicalContext(signal),
        ])
        const validationActions = actionData.filter(
          (action) => upper(action.status) === 'AGUARDANDO_VALIDACAO',
        )
        setActions(validationActions)
        setModels(modelData)
        setStops(stopData)
        setOccurrences(occurrenceData)
        setDemands(demandData)
        setTechnicalContext(contextData)
        onQueueCountChange(
          demandData.length + validationActions.length + modelData.length + occurrenceData.length,
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
            : 'Não foi possível carregar a central de validações.',
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

  const filteredDemands = useMemo(
    () => demands.filter((demand) => {
      if (priority && upper(demand.prioridade) !== priority) return false
      return includesSearch(
        [demand.id, demand.titulo, demand.entidade_id, demand.area_atual_nome, demand.cargo_atual_nome],
        search,
      )
    }),
    [demands, priority, search],
  )

  const filteredActions = useMemo(
    () => actions.filter((action) => {
      if (priority && upper(action.prioridade) !== priority) return false
      return includesSearch(
        [action.id, action.titulo, action.ativo_tag, action.ativo_nome, action.componente_nome],
        search,
      )
    }),
    [actions, priority, search],
  )

  const filteredModels = useMemo(
    () => models.filter((model) => {
      if (priority && upper(model.criticidade) !== priority) return false
      return includesSearch(
        [model.id, model.nome, model.ativo_tag, model.ativo_nome, model.componente_nome],
        search,
      )
    }),
    [models, priority, search],
  )

  const filteredOccurrences = useMemo(
    () => occurrences.filter((occurrence) => {
      if (priority && upper(occurrence.severidade) !== priority) return false
      return includesSearch(
        [occurrence.id, occurrence.titulo, occurrence.descricao, occurrence.ativo_id],
        search,
      )
    }),
    [occurrences, priority, search],
  )

  async function handleActionDecision(result: GestorDecisionResult) {
    setNotice(result.decisao === 'APROVAR' ? 'Execução aprovada.' : 'Execução devolvida.')
    await load(undefined, true)
  }

  async function handleModelDecision(result: GestorChecklistModelDecisionResult) {
    setNotice(result.decisao === 'APROVAR' ? 'Modelo técnico aprovado.' : 'Modelo devolvido ao Administrador.')
    await load(undefined, true)
  }

  async function handleTechnicalChange(message: string) {
    setSelectedDemand(null)
    setSelectedOccurrence(null)
    setNotice(message)
    await load(undefined, true)
  }

  return (
    <>
      <main className="content validation-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">FILTRO TÉCNICO</span>
            <h1>Central de validações</h1>
            <p>Trate demandas por área, assine documentos, encaminhe decisões e analise ocorrências.</p>
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

        {technicalContext ? (
          <div className="technical-identity-banner">
            <span>Escopo atual</span>
            <strong>{technicalContext.identidade.area_nome || 'Gestor sem área definida'}</strong>
            <small>{technicalContext.identidade.cargo_nome || 'Sem cargo específico'}{technicalContext.pode_assinar ? ' · pode assinar' : ''}</small>
          </div>
        ) : null}

        {notice ? (
          <div className="dashboard-notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')}>Fechar</button>
          </div>
        ) : null}
        {error ? <div className="dashboard-error" role="alert"><strong>Falha na central.</strong><span>{error}</span></div> : null}

        <div className="validation-tabs" role="tablist" aria-label="Tipos de validação">
          <button className={tab === 'demands' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'demands'} onClick={() => setTab('demands')}>
            <ValidationIcon /> Fila técnica <span>{demands.length}</span>
          </button>
          <button className={tab === 'actions' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'actions'} onClick={() => setTab('actions')}>
            <ValidationIcon /> Execuções <span>{actions.length}</span>
          </button>
          <button className={tab === 'models' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'models'} onClick={() => setTab('models')}>
            <ValidationIcon /> Modelos técnicos <span>{models.length}</span>
          </button>
          <button className={tab === 'operations' ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === 'operations'} onClick={() => setTab('operations')}>
            <AlertIcon /> Operação <span>{occurrences.length + stops.length}</span>
          </button>
        </div>

        <section className="filter-bar" aria-label="Filtros da central">
          <label className="search-field">
            <SearchIcon />
            <input value={search} placeholder="Buscar por ID, ativo, área, cargo ou título" onChange={(event) => setSearch(event.target.value)} />
          </label>
          <label>
            <span>Prioridade</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="">Todas</option>
              <option value="CRITICA">Crítica</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Média</option>
              <option value="NORMAL">Normal</option>
              <option value="BAIXA">Baixa</option>
            </select>
          </label>
        </section>

        {tab === 'demands' ? (
          <section className="validation-grid" role="tabpanel">
            {loading ? <p className="panel-state">Carregando fila técnica…</p> : null}
            {!loading && filteredDemands.length === 0 ? <p className="panel-state">Nenhuma demanda destinada à sua área ou cargo.</p> : null}
            {filteredDemands.map((demand) => (
              <article className="validation-card technical-demand-card" key={demand.id}>
                <div className="validation-card__topline"><span className="status-pill status-pill--blue">{demand.entidade_tipo}</span><span className="priority-chip">{demand.prioridade}</span></div>
                <h2>{demand.titulo}</h2>
                <p>{demand.area_atual_nome || 'Sem área'}{demand.cargo_atual_nome ? ` · ${demand.cargo_atual_nome}` : ''}</p>
                <dl>
                  <div><dt>Status</dt><dd>{demand.status}</dd></div>
                  <div><dt>Assinaturas</dt><dd>{Number(demand.assinaturas_realizadas ?? 0)}/{Number(demand.assinaturas_necessarias ?? 0)}</dd></div>
                  <div><dt>SLA</dt><dd>{demand.sla_resolucao_atrasado ? 'Atrasado' : 'No prazo'}</dd></div>
                </dl>
                <button className="review-button" type="button" onClick={() => setSelectedDemand(demand)}>Tratar demanda</button>
              </article>
            ))}
          </section>
        ) : null}

        {tab === 'actions' ? (
          <section className="validation-grid" role="tabpanel">
            {loading ? <p className="panel-state">Carregando execuções…</p> : null}
            {!loading && filteredActions.length === 0 ? <p className="panel-state">Nenhuma execução encontrada.</p> : null}
            {filteredActions.map((action) => (
              <article className="validation-card" key={action.id}>
                <div className="validation-card__topline"><span className="status-pill">EXECUÇÃO</span><span className="priority-chip">{action.prioridade || 'NORMAL'}</span></div>
                <h2>{action.titulo || 'Ação sem título'}</h2>
                <p>{action.ativo_tag || action.ativo_id || 'Ativo não informado'}{action.ativo_nome ? ` · ${action.ativo_nome}` : ''}</p>
                <dl><div><dt>Gerada em</dt><dd>{formatDate(action.gerado_em)}</dd></div><div><dt>Locks</dt><dd>{action.locks_ativos ?? 0}</dd></div><div><dt>Status</dt><dd>{action.status}</dd></div></dl>
                <button className="review-button" type="button" onClick={() => setSelectedAction(action)}>Abrir revisão</button>
              </article>
            ))}
          </section>
        ) : null}

        {tab === 'models' ? (
          <section className="validation-grid" role="tabpanel">
            {loading ? <p className="panel-state">Carregando modelos…</p> : null}
            {!loading && filteredModels.length === 0 ? <p className="panel-state">Nenhum modelo técnico encontrado.</p> : null}
            {filteredModels.map((model) => (
              <article className="validation-card" key={model.id}>
                <div className="validation-card__topline"><span className="status-pill status-pill--blue">MODELO R{model.revisao ?? 1}</span><span className="priority-chip">{model.criticidade || 'NORMAL'}</span></div>
                <h2>{model.nome || 'Modelo sem nome'}</h2>
                <p>{model.ativo_tag || model.ativo_id || 'Ativo não informado'}{model.componente_nome ? ` · ${model.componente_nome}` : ''}</p>
                <dl><div><dt>Itens</dt><dd>{model.itens_count ?? 0}</dd></div><div><dt>Tempo</dt><dd>{model.tempo_estimado_min ?? 0} min</dd></div><div><dt>Enviado</dt><dd>{formatDate(model.enviado_validacao_em || model.atualizado_em)}</dd></div></dl>
                <button className="review-button" type="button" onClick={() => setSelectedModel(model)}>Revisar modelo</button>
              </article>
            ))}
          </section>
        ) : null}

        {tab === 'operations' ? (
          <section className="operation-monitor" role="tabpanel">
            <div className="operation-column">
              <header className="section-heading"><div><span className="eyebrow">ANORMALIDADES</span><h2>Aguardando análise</h2></div><span className="section-count">{filteredOccurrences.length}</span></header>
              {filteredOccurrences.length === 0 ? <p className="panel-state">Nenhuma anormalidade encontrada.</p> : null}
              {filteredOccurrences.map((occurrence) => (
                <article className="operation-card" key={occurrence.id}>
                  <span className="operation-card__icon operation-card__icon--danger"><AlertIcon /></span>
                  <div>
                    <div className="validation-card__topline"><span className="priority-chip">{occurrence.severidade || 'NÃO CLASSIFICADA'}</span><small>{formatDate(occurrence.criado_em)}</small></div>
                    <h3>{occurrence.titulo || 'Ocorrência operacional'}</h3>
                    <p>{occurrence.descricao || occurrence.ativo_id || 'Sem descrição.'}</p>
                    <button className="review-button" type="button" onClick={() => setSelectedOccurrence(occurrence)}>Criar análise técnica</button>
                  </div>
                </article>
              ))}
            </div>

            <div className="operation-column">
              <header className="section-heading"><div><span className="eyebrow">PARADAS</span><h2>Monitoramento</h2></div><span className="section-count">{stops.length}</span></header>
              {stops.length === 0 ? <p className="panel-state">Nenhuma parada registrada.</p> : null}
              {stops.map((stop) => (
                <article className="operation-card" key={stop.id}>
                  <span className="operation-card__icon"><StopIcon /></span>
                  <div><div className="validation-card__topline"><span className="status-pill">{stop.status}</span><small>{formatDate(stop.iniciada_em)}</small></div><h3>{stop.ativo_id}</h3><p>{stop.motivo_parada || 'Parada sem motivo informado.'}</p></div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      {selectedAction ? <ActionReviewDialog action={selectedAction} onClose={() => setSelectedAction(null)} onDecisionComplete={handleActionDecision} onSessionExpired={onSessionExpired} /> : null}
      {selectedModel ? <ChecklistModelReviewDialog model={selectedModel} onClose={() => setSelectedModel(null)} onDecisionComplete={handleModelDecision} onSessionExpired={onSessionExpired} /> : null}
      {selectedDemand && technicalContext ? <TechnicalDemandDialog demand={selectedDemand} context={technicalContext} onClose={() => setSelectedDemand(null)} onChanged={handleTechnicalChange} onSessionExpired={onSessionExpired} /> : null}
      {selectedOccurrence ? <TechnicalAnalysisDialog occurrence={selectedOccurrence} onClose={() => setSelectedOccurrence(null)} onChanged={handleTechnicalChange} /> : null}
    </>
  )
}
