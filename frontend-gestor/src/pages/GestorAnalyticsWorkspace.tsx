import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertIcon,
  AssetIcon,
  ChartIcon,
  CheckIcon,
  SearchIcon,
  StopIcon,
  ValidationIcon,
  WrenchIcon,
} from '../components/Icons'
import { AssetJourneyPanel } from '../components/AssetJourneyPanel'
import {
  createGestorStopTreatment,
  getGestorAssetCatalog,
  getGestorAssetJourney,
  getGestorOverview,
  getGestorTechnicalKpisForPeriod,
  isGestorAuthenticationError,
} from '../services/api/gestor'
import { ActionReviewDialog } from '../components/ActionReviewDialog'
import { TechnicalAnalysisDialog } from '../components/TechnicalAnalysisDialog'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import type {
  GestorAction,
  GestorAsset,
  GestorAssetCatalog,
  GestorAssetJourney,
  GestorOverview,
  GestorOccurrence,
  GestorTechnicalKpis,
} from '../types/gestor'

type AnalyticsView = 'indicators' | 'monitoring' | 'history' | 'critical' | 'library'
type MonitoringFilter = 'all' | 'executing' | 'pending' | 'blocked' | 'stopped'

interface GestorAnalyticsWorkspaceProps {
  focusAssetId?: string
  focusOccurrenceId?: string
  onOpenDecision: (
    kind: 'demand' | 'action' | 'model' | 'occurrence',
    id: string,
  ) => void
  onSessionExpired: () => void
}

const EMPTY_CATALOG: GestorAssetCatalog = { assets: [], components: [] }

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

function localIso(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function periodRange(days: number, offset = 0) {
  const end = new Date()
  end.setDate(end.getDate() - (days * offset))
  const start = new Date(end)
  start.setDate(start.getDate() - days)
  return { inicio_em: localIso(start), fim_em: localIso(end) }
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'Sem base'
    : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Sem base'
  const seconds = Math.max(0, value)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours} h ${minutes} min`
  if (minutes > 0) return `${minutes} min`
  return `${Math.floor(seconds)} s`
}

function formatDate(value?: string): string {
  if (!value) return 'Não informado'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function elapsedLabel(value?: string): string {
  if (!value) return 'Ainda não iniciada'
  const startedAt = new Date(value).getTime()
  if (!Number.isFinite(startedAt)) return formatDate(value)
  const seconds = Math.max(0, (Date.now() - startedAt) / 1000)
  if (seconds < 60) return 'Iniciada agora'
  return `Há ${formatDuration(seconds)}`
}

function metricTrend(
  current: number | null | undefined,
  previous: number | null | undefined,
  lowerIsBetter = false,
): { label: string; tone: string } {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return { label: 'Sem comparação', tone: 'neutral' }
  }
  const delta = current - previous
  if (Math.abs(delta) < 0.05) return { label: 'Estável', tone: 'neutral' }
  const good = lowerIsBetter ? delta < 0 : delta > 0
  const prefix = delta > 0 ? '+' : ''
  return {
    label: `${prefix}${delta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`,
    tone: good ? 'good' : 'bad',
  }
}

function actionAssetLabel(action: GestorAction): string {
  return action.ativo_tag || action.ativo_nome || action.ativo_id || 'Ativo não informado'
}

function isWithinPeriod(value: string | undefined, days: number): boolean {
  if (!value) return true
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return true
  return time >= Date.now() - (days * 24 * 60 * 60 * 1000)
}

export function GestorAnalyticsWorkspace({
  focusAssetId,
  focusOccurrenceId,
  onOpenDecision,
  onSessionExpired,
}: GestorAnalyticsWorkspaceProps) {
  const [view, setView] = useState<AnalyticsView>('indicators')
  const [periodDays, setPeriodDays] = useState(30)
  const [assetId, setAssetId] = useState(focusAssetId ?? '')
  const [catalog, setCatalog] = useState<GestorAssetCatalog>(EMPTY_CATALOG)
  const [journey, setJourney] = useState<GestorAssetJourney | null>(null)
  const [overview, setOverview] = useState<GestorOverview | null>(null)
  const [current, setCurrent] = useState<GestorTechnicalKpis | null>(null)
  const [previous, setPrevious] = useState<GestorTechnicalKpis | null>(null)
  const [search, setSearch] = useState('')
  const [monitoringFilter, setMonitoringFilter] =
    useState<MonitoringFilter>('all')
  const [selectedHistoryAction, setSelectedHistoryAction] =
    useState<GestorAction | null>(null)
  const [selectedOccurrence, setSelectedOccurrence] =
    useState<GestorOccurrence | null>(null)
  const [treatingStopId, setTreatingStopId] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (signal?: AbortSignal, background = false) => {
    if (background) setRefreshing(true)
    else setLoading(true)
    setError('')
    const currentRange = periodRange(periodDays)
    const previousRange = periodRange(periodDays, 1)
    const filters = assetId ? { ativo_id: assetId } : {}

    try {
      const [overviewData, catalogData, currentData, previousData, journeyData] =
        await Promise.all([
          getGestorOverview(signal),
          getGestorAssetCatalog(signal),
          getGestorTechnicalKpisForPeriod(
            { ...currentRange, ...filters },
            signal,
          ),
          getGestorTechnicalKpisForPeriod(
            { ...previousRange, ...filters },
            signal,
          ),
          assetId
            ? getGestorAssetJourney(assetId, signal)
            : Promise.resolve(null),
        ])
      setOverview(overviewData)
      setCatalog(catalogData)
      setCurrent(currentData)
      setPrevious(previousData)
      setJourney(journeyData)
      setLastSyncedAt(new Date())
    } catch (cause) {
      if (signal?.aborted) return
      if (isGestorAuthenticationError(cause)) {
        onSessionExpired()
        return
      }
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível consolidar os dados técnicos.',
      )
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [assetId, onSessionExpired, periodDays])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  useAutoRefresh(
    () => load(undefined, true),
    { intervalMs: 15_000 },
  )

  useEffect(() => {
    if (!focusAssetId) return
    setAssetId(focusAssetId)
    setView('library')
  }, [focusAssetId])

  useEffect(() => {
    if (!focusOccurrenceId || !overview) return
    const occurrence = overview.occurrences.find(
      (item) => item.id === focusOccurrenceId,
    )
    if (occurrence) {
      if (occurrence.ativo_id) setAssetId(occurrence.ativo_id)
      setSelectedOccurrence(occurrence)
    }
    setView('critical')
  }, [focusOccurrenceId, overview])

  const selectedAsset =
    catalog.assets.find((asset) => asset.id === assetId) ?? null
  const selectedComponents = selectedAsset
    ? (
      journey?.componentes.length
        ? journey.componentes
        : catalog.components.filter(
          (component) => component.ativo_id === selectedAsset.id,
        )
    )
    : []

  const metrics = useMemo(() => {
    if (!current) return []
    return [
      {
        label: 'Disponibilidade',
        value: formatPercent(current.disponibilidade_pct),
        trend: metricTrend(current.disponibilidade_pct, previous?.disponibilidade_pct),
        hint: 'Tempo disponível para operar',
      },
      {
        label: 'Falhas não planejadas',
        value: String(current.falhas_nao_planejadas),
        trend: metricTrend(
          current.falhas_nao_planejadas,
          previous?.falhas_nao_planejadas,
          true,
        ),
        hint: 'Falhas corretivas registradas no período',
      },
      {
        label: 'MTTR',
        value: formatDuration(current.mttr_segundos),
        trend: metricTrend(current.mttr_segundos, previous?.mttr_segundos, true),
        hint: 'Tempo médio para reparar',
      },
      {
        label: 'MTBF',
        value: formatDuration(current.mtbf_segundos),
        trend: metricTrend(current.mtbf_segundos, previous?.mtbf_segundos),
        hint: 'Tempo médio entre falhas',
      },
      {
        label: 'Lead time',
        value: formatDuration(current.lead_time_os_segundos),
        trend: metricTrend(
          current.lead_time_os_segundos,
          previous?.lead_time_os_segundos,
          true,
        ),
        hint: 'Abertura até conclusão da OS',
      },
      {
        label: 'SLA de resposta',
        value: formatPercent(current.sla_resposta_pct),
        trend: metricTrend(current.sla_resposta_pct, previous?.sla_resposta_pct),
        hint: `${current.sla_resposta_amostra} demanda(s) avaliadas`,
      },
    ]
  }, [current, previous])

  const monitoredActions = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('pt-BR')
    return (overview?.actions ?? [])
      .filter((action) => ['PENDENTE', 'EM_EXECUCAO', 'BLOQUEADA'].includes(upper(action.status)))
      .filter((action) => !assetId || action.ativo_id === assetId)
      .filter((action) => {
        if (!normalized) return true
        return [
          action.id,
          action.titulo,
          action.ativo_tag,
          action.ativo_nome,
          action.responsavel_nome,
          action.responsavel_id,
        ].some((value) => String(value ?? '').toLocaleLowerCase('pt-BR').includes(normalized))
      })
  }, [assetId, overview?.actions, search])

  const monitoredStops = useMemo(
    () => (overview?.openStops ?? []).filter(
      (stop) => !assetId || stop.ativo_id === assetId,
    ),
    [assetId, overview?.openStops],
  )

  const completedActions = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('pt-BR')
    return (overview?.completedActions ?? [])
      .filter((action) => !assetId || action.ativo_id === assetId)
      .filter((action) => {
        if (!normalized) return true
        return [
          action.id,
          action.titulo,
          action.ativo_tag,
          action.ativo_nome,
          action.responsavel_nome,
          action.responsavel_id,
        ].some((value) => String(value ?? '').toLocaleLowerCase('pt-BR').includes(normalized))
      })
  }, [assetId, overview?.completedActions, search])

  const treatmentByStop = useMemo(() => {
    const treatments = new Map<string, GestorOverview['occurrences'][number]>()
    for (const occurrence of overview?.occurrenceHistory ?? []) {
      if (occurrence.parada_id) treatments.set(occurrence.parada_id, occurrence)
    }
    return treatments
  }, [overview?.occurrenceHistory])

  const monitoringCounts = useMemo(() => ({
    executing: monitoredActions.filter(
      (action) => upper(action.status) === 'EM_EXECUCAO',
    ).length,
    pending: monitoredActions.filter(
      (action) => upper(action.status) === 'PENDENTE',
    ).length,
    blocked: monitoredActions.filter(
      (action) => upper(action.status) === 'BLOQUEADA',
    ).length,
    stopped: monitoredStops.length,
  }), [monitoredActions, monitoredStops.length])

  const displayedMonitoringActions = useMemo(() => {
    if (monitoringFilter === 'all' || monitoringFilter === 'stopped') {
      return monitoringFilter === 'stopped' ? [] : monitoredActions
    }
    const expectedStatus = {
      executing: 'EM_EXECUCAO',
      pending: 'PENDENTE',
      blocked: 'BLOQUEADA',
    }[monitoringFilter]
    return monitoredActions.filter(
      (action) => upper(action.status) === expectedStatus,
    )
  }, [monitoredActions, monitoringFilter])

  const monitoringAttention = useMemo(() => [
    ...monitoredStops.map((stop) => ({
      id: `stop-${stop.id}`,
      tone: 'danger',
      label: 'Parada aberta',
      title: stop.ativo_id || 'Ativo não informado',
      detail: stop.motivo_parada || 'Aguardando diagnóstico da parada.',
      meta: stop.elapsed_seconds
        ? `Parado há ${formatDuration(stop.elapsed_seconds)}`
        : elapsedLabel(stop.iniciada_em),
      assetId: stop.ativo_id,
    })),
    ...monitoredActions
      .filter((action) => upper(action.status) === 'BLOQUEADA')
      .map((action) => ({
        id: `action-${action.id}`,
        tone: 'warning',
        label: 'Execução bloqueada',
        title: action.titulo || 'Ação operacional',
        detail: actionAssetLabel(action),
        meta: String(action.responsavel_nome || action.executor_nome || 'Responsável não definido'),
        assetId: action.ativo_id,
      })),
  ], [monitoredActions, monitoredStops])

  const displayedMonitoringAttention = useMemo(() => {
    if (monitoringFilter === 'all') return monitoringAttention
    if (monitoringFilter === 'stopped') {
      return monitoringAttention.filter((item) => item.id.startsWith('stop-'))
    }
    if (monitoringFilter === 'blocked') {
      return monitoringAttention.filter((item) => item.id.startsWith('action-'))
    }
    return []
  }, [monitoringAttention, monitoringFilter])

  const assetImpactRanking = useMemo(() => {
    const rows = new Map<string, {
      assetId: string
      label: string
      name: string
      stops: number
      occurrences: number
      downtime: number
      active: number
    }>()
    const ensure = (id: string) => {
      const asset = catalog.assets.find((item) => item.id === id)
      const currentRow = rows.get(id)
      if (currentRow) return currentRow
      const row = {
        assetId: id,
        label: asset?.tag || id || 'Ativo não informado',
        name: asset?.nome || 'Sem nome cadastrado',
        stops: 0,
        occurrences: 0,
        downtime: 0,
        active: 0,
      }
      rows.set(id, row)
      return row
    }

    for (const stop of overview?.stops ?? []) {
      if (
        !stop.ativo_id ||
        !isWithinPeriod(stop.iniciada_em, periodDays) ||
        (assetId && stop.ativo_id !== assetId)
      ) continue
      const row = ensure(stop.ativo_id)
      row.stops += 1
      row.downtime += Number(stop.elapsed_seconds ?? 0)
      if ((overview?.openStops ?? []).some((item) => item.id === stop.id)) {
        row.active += 1
      }
    }

    for (const occurrence of overview?.occurrenceHistory ?? []) {
      if (
        !occurrence.ativo_id ||
        !isWithinPeriod(occurrence.criado_em, periodDays) ||
        (assetId && occurrence.ativo_id !== assetId)
      ) continue
      ensure(occurrence.ativo_id).occurrences += 1
    }

    return [...rows.values()]
      .sort((a, b) => (
        (b.downtime + (b.stops * 3600) + (b.occurrences * 900)) -
        (a.downtime + (a.stops * 3600) + (a.occurrences * 900))
      ))
      .slice(0, 5)
  }, [
    assetId,
    catalog.assets,
    overview?.openStops,
    overview?.occurrenceHistory,
    overview?.stops,
    periodDays,
  ])

  const executionRanking = useMemo(() => {
    const rows = new Map<string, {
      id: string
      name: string
      completed: number
      totalSeconds: number
      measured: number
    }>()

    for (const action of overview?.completedActions ?? []) {
      if (
        !isWithinPeriod(action.finalizado_em || action.atualizado_em, periodDays) ||
        (assetId && action.ativo_id !== assetId)
      ) continue
      const id = String(
        action.responsavel_id ||
        action.executor_id ||
        action.responsavel_nome ||
        'SEM_RESPONSAVEL',
      )
      const row = rows.get(id) ?? {
        id,
        name: String(
          action.responsavel_nome ||
          action.executor_nome ||
          'Responsável não identificado',
        ),
        completed: 0,
        totalSeconds: 0,
        measured: 0,
      }
      row.completed += 1
      const started = new Date(action.iniciado_em ?? '').getTime()
      const finished = new Date(
        action.finalizado_em || action.atualizado_em || '',
      ).getTime()
      if (Number.isFinite(started) && Number.isFinite(finished) && finished >= started) {
        row.totalSeconds += (finished - started) / 1000
        row.measured += 1
      }
      rows.set(id, row)
    }

    return [...rows.values()]
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 5)
  }, [assetId, overview?.completedActions, periodDays])

  const filteredAssets = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('pt-BR')
    if (!normalized) return catalog.assets
    return catalog.assets.filter((asset) => [
      asset.id,
      asset.tag,
      asset.nome,
      asset.tipo,
      asset.localizacao_tecnica,
    ].some((value) => String(value ?? '').toLocaleLowerCase('pt-BR').includes(normalized)))
  }, [catalog.assets, search])

  async function handleStopTreatment(stopId: string) {
    if (treatingStopId) return
    setTreatingStopId(stopId)
    setError('')
    try {
      const result = await createGestorStopTreatment(stopId)
      setSelectedOccurrence(result.occurrence)
    } catch (cause) {
      if (isGestorAuthenticationError(cause)) {
        onSessionExpired()
        return
      }
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível iniciar o tratamento da parada.',
      )
    } finally {
      setTreatingStopId('')
    }
  }

  const views: Array<{
    id: AnalyticsView
    label: string
    count?: number
  }> = [
    { id: 'indicators', label: 'Indicadores' },
    { id: 'monitoring', label: 'Acompanhamento', count: monitoredActions.length },
    { id: 'history', label: 'Concluídas', count: completedActions.length },
    {
      id: 'critical',
      label: 'Críticos',
      count: (overview?.occurrences.length ?? 0) + (overview?.openStops.length ?? 0),
    },
    { id: 'library', label: 'Biblioteca', count: catalog.assets.length },
  ]

  return (
    <main className="content manager-analytics-workspace">
      <section className="manager-workspace-heading">
        <div>
          <span className="eyebrow">MODO ANALÍTICO</span>
          <h1>Centro técnico</h1>
          <p>Analise desempenho, acompanhe execuções e investigue ativos.</p>
        </div>
        <div className="manager-analytics-filters">
          <select
            value={assetId}
            onChange={(event) => setAssetId(event.target.value)}
            aria-label="Filtrar por ativo"
          >
            <option value="">Todos os ativos</option>
            {catalog.assets.map((asset) => (
              <option value={asset.id} key={asset.id}>
                {asset.tag || asset.id} · {asset.nome || 'Sem nome'}
              </option>
            ))}
          </select>
          <select
            value={periodDays}
            onChange={(event) => setPeriodDays(Number(event.target.value))}
            aria-label="Período dos indicadores"
          >
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <span
            className={`manager-live-sync${refreshing ? ' is-syncing' : ''}`}
            role="status"
            aria-live="polite"
            title={lastSyncedAt
              ? `Última sincronização às ${lastSyncedAt.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}`
              : 'Aguardando primeira sincronização'}
          >
            <i aria-hidden="true" />
            {refreshing ? 'Sincronizando' : 'Atualização automática'}
          </span>
        </div>
      </section>

      {error ? (
        <div className="dashboard-error" role="alert">
          <strong>Falha ao consolidar a análise.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <nav className="manager-analytics-tabs" aria-label="Áreas do modo analítico">
        {views.map((item) => (
          <button
            className={view === item.id ? 'is-active' : ''}
            type="button"
            key={item.id}
            onClick={() => {
              setView(item.id)
              setSearch('')
            }}
          >
            {item.label}
            {item.count !== undefined ? <span>{item.count}</span> : null}
          </button>
        ))}
      </nav>

      <section className="manager-analytics-stage">
        {view === 'indicators' ? (
          <div className="manager-analytics-indicators">
            <div className="manager-analytics-kpis" aria-busy={loading}>
              {loading ? <p className="panel-state">Calculando indicadores…</p> : null}
              {!loading && metrics.map((metric) => (
                <article key={metric.label}>
                  <header>
                    <span>{metric.label}</span>
                    <button
                      type="button"
                      title={metric.hint}
                      aria-label={`Ajuda sobre ${metric.label}`}
                    >?</button>
                  </header>
                  <strong>{metric.value}</strong>
                  <footer>
                    <span className={`is-${metric.trend.tone}`}>{metric.trend.label}</span>
                    <small>vs. período anterior</small>
                  </footer>
                </article>
              ))}
            </div>

            {!loading && current ? (
              <div className="manager-ranking-grid">
                <article className="manager-ranking-panel">
                  <header>
                    <div>
                      <span className="eyebrow">ATENDIMENTO TÉCNICO · CONFIABILIDADE</span>
                      <h2>Ativos com maior impacto</h2>
                      <p>Ordenados por parada, falhas e ocorrências do período.</p>
                    </div>
                    <strong>{assetImpactRanking.length}</strong>
                  </header>
                  <div className="manager-ranking-list">
                    {assetImpactRanking.map((row, index) => (
                      <button
                        type="button"
                        key={row.assetId}
                        onClick={() => {
                          setAssetId(row.assetId)
                          setView('library')
                        }}
                      >
                        <b>{String(index + 1).padStart(2, '0')}</b>
                        <span>
                          <strong>{row.label} · {row.name}</strong>
                          <small>
                            {row.stops} parada(s) · {row.occurrences} ocorrência(s)
                            {row.active ? ` · ${row.active} aberta(s)` : ''}
                          </small>
                        </span>
                        <em>{formatDuration(row.downtime)}</em>
                      </button>
                    ))}
                    {!assetImpactRanking.length ? (
                      <div className="manager-ranking-empty">
                        <CheckIcon />
                        <span>Nenhum impacto técnico registrado neste período.</span>
                      </div>
                    ) : null}
                  </div>
                </article>

                <article className="manager-ranking-panel">
                  <header>
                    <div>
                      <span className="eyebrow">CAPACIDADE EM CAMPO</span>
                      <h2>Execuções concluídas por responsável</h2>
                      <p>Volume entregue e duração média com base válida.</p>
                    </div>
                    <strong>{executionRanking.reduce((total, row) => total + row.completed, 0)}</strong>
                  </header>
                  <div className="manager-ranking-list">
                    {executionRanking.map((row, index) => (
                      <div key={row.id}>
                        <b>{String(index + 1).padStart(2, '0')}</b>
                        <span>
                          <strong>{row.name}</strong>
                          <small>{row.completed} execução(ões) concluída(s)</small>
                        </span>
                        <em>
                          {row.measured
                            ? `Média ${formatDuration(row.totalSeconds / row.measured)}`
                            : 'Sem duração'}
                        </em>
                      </div>
                    ))}
                    {!executionRanking.length ? (
                      <div className="manager-ranking-empty">
                        <ChartIcon />
                        <span>As primeiras conclusões formarão este ranking.</span>
                      </div>
                    ) : null}
                  </div>
                </article>
              </div>
            ) : null}
          </div>
        ) : null}

        {view === 'monitoring' ? (
          <div className="manager-monitoring-view">
            <header className="manager-stage-toolbar">
              <div>
                <span className="eyebrow">EXECUÇÕES ATIVAS</span>
                <h2>Quem, onde e quando</h2>
              </div>
              <label>
                <SearchIcon />
                <input
                  value={search}
                  placeholder="Buscar execução, ativo ou responsável"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </header>
            <div
              className="manager-monitoring-overview"
              role="group"
              aria-label="Filtrar acompanhamento por situação"
            >
              <button
                type="button"
                className={`is-executing${monitoringFilter === 'executing' ? ' is-selected' : ''}`}
                aria-pressed={monitoringFilter === 'executing'}
                onClick={() => setMonitoringFilter(
                  monitoringFilter === 'executing' ? 'all' : 'executing',
                )}
              >
                <span><WrenchIcon /></span>
                <div><strong>{monitoringCounts.executing}</strong><small>Em execução</small></div>
              </button>
              <button
                type="button"
                className={monitoringFilter === 'pending' ? 'is-selected' : ''}
                aria-pressed={monitoringFilter === 'pending'}
                onClick={() => setMonitoringFilter(
                  monitoringFilter === 'pending' ? 'all' : 'pending',
                )}
              >
                <span><ValidationIcon /></span>
                <div><strong>{monitoringCounts.pending}</strong><small>Aguardando início</small></div>
              </button>
              <button
                type="button"
                className={`${monitoringCounts.blocked ? 'is-warning' : ''}${monitoringFilter === 'blocked' ? ' is-selected' : ''}`}
                aria-pressed={monitoringFilter === 'blocked'}
                onClick={() => setMonitoringFilter(
                  monitoringFilter === 'blocked' ? 'all' : 'blocked',
                )}
              >
                <span><AlertIcon /></span>
                <div><strong>{monitoringCounts.blocked}</strong><small>Bloqueadas</small></div>
              </button>
              <button
                type="button"
                className={`${monitoringCounts.stopped ? 'is-danger' : ''}${monitoringFilter === 'stopped' ? ' is-selected' : ''}`}
                aria-pressed={monitoringFilter === 'stopped'}
                onClick={() => setMonitoringFilter(
                  monitoringFilter === 'stopped' ? 'all' : 'stopped',
                )}
              >
                <span><StopIcon /></span>
                <div><strong>{monitoringCounts.stopped}</strong><small>Paradas abertas</small></div>
              </button>
            </div>

            <div className="manager-monitoring-dashboard">
              <aside className="manager-monitoring-attention">
                <header>
                  <div>
                    <span className="eyebrow">ATENÇÃO AGORA</span>
                    <h3>Situações que exigem ação</h3>
                    <p>Paradas abertas e execuções bloqueadas com impacto imediato.</p>
                  </div>
                  <span>{displayedMonitoringAttention.length}</span>
                </header>
                <div>
                  {displayedMonitoringAttention.map((item) => (
                    <article className={`is-${item.tone}`} key={item.id}>
                      <span>{item.tone === 'danger' ? <StopIcon /> : <AlertIcon />}</span>
                      <div>
                        <small>{item.label}</small>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                        <b>{item.meta}</b>
                      </div>
                      {item.assetId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAssetId(item.assetId || '')
                            setView('library')
                          }}
                        >
                          Ver ativo
                        </button>
                      ) : null}
                    </article>
                  ))}
                  {!displayedMonitoringAttention.length ? (
                    <div className="manager-monitoring-clear">
                      <CheckIcon />
                      <strong>Nenhuma urgência neste filtro</strong>
                      <span>Selecione outro status para acompanhar o trabalho em campo.</span>
                    </div>
                  ) : null}
                </div>
              </aside>

              <section className="manager-monitoring-board">
                <header>
                  <div>
                    <span className="eyebrow">TRABALHO EM CAMPO</span>
                    <h3>
                      {monitoringFilter === 'all'
                        ? 'Execuções acompanhadas'
                        : monitoringFilter === 'stopped'
                          ? 'Equipamentos parados'
                          : `Execuções · ${humanize(monitoringFilter)}`}
                    </h3>
                  </div>
                  <span>
                    {monitoringFilter === 'stopped'
                      ? monitoredStops.length
                      : displayedMonitoringActions.length}
                  </span>
                </header>
                <div className="manager-monitoring-list">
                  {monitoringFilter !== 'stopped' && displayedMonitoringActions.length === 0 ? (
                    <div className="manager-decision-empty">
                      <CheckIcon />
                      <strong>Nenhuma execução nesta situação</strong>
                      <span>A lista será atualizada automaticamente quando houver mudança.</span>
                    </div>
                  ) : null}
                  {monitoringFilter === 'stopped' && monitoredStops.length === 0 ? (
                    <div className="manager-decision-empty">
                      <CheckIcon />
                      <strong>Nenhuma parada aberta</strong>
                      <span>Os ativos indisponíveis aparecerão aqui em tempo real.</span>
                    </div>
                  ) : null}
                  {monitoringFilter === 'stopped'
                    ? monitoredStops.map((stop) => (
                      <article className="manager-monitoring-stop-card" key={stop.id}>
                        <header>
                          <span className="manager-monitoring-state is-bloqueada">
                            <StopIcon />
                          </span>
                          <div>
                            <small>PARADA ABERTA · {formatDate(stop.iniciada_em)}</small>
                            <strong>{stop.ativo_id || 'Ativo não informado'}</strong>
                          </div>
                          <b className="is-bloqueada">
                            {stop.elapsed_seconds
                              ? formatDuration(stop.elapsed_seconds)
                              : 'Em aberto'}
                          </b>
                        </header>
                        <p>{stop.motivo_parada || 'Aguardando diagnóstico técnico.'}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setAssetId(stop.ativo_id || '')
                            setView('library')
                          }}
                        >
                          Abrir histórico do ativo
                        </button>
                      </article>
                    ))
                    : null}
                  {displayedMonitoringActions.map((action) => {
                    const status = upper(action.status)
                    const responsible = String(
                      action.responsavel_nome ||
                      action.executor_nome ||
                      action.responsavel_id ||
                      'Aguardando operador',
                    )
                    return (
                      <article key={action.id}>
                        <header>
                          <span className={`manager-monitoring-state is-${status.toLocaleLowerCase('pt-BR')}`}>
                            {status === 'EM_EXECUCAO' ? <WrenchIcon /> : <ValidationIcon />}
                          </span>
                          <div>
                            <small>{actionAssetLabel(action)}{action.componente_nome ? ` · ${action.componente_nome}` : ''}</small>
                            <strong>{action.titulo || 'Ação operacional'}</strong>
                          </div>
                          <b className={`is-${status.toLocaleLowerCase('pt-BR')}`}>{humanize(status)}</b>
                        </header>
                        <dl>
                          <div><dt>Responsável</dt><dd>{responsible}</dd></div>
                          <div><dt>Início</dt><dd>{elapsedLabel(action.iniciado_em)}</dd></div>
                          <div><dt>Prioridade</dt><dd>{humanize(action.prioridade || 'NORMAL')}</dd></div>
                        </dl>
                        <div className="manager-execution-progress" aria-label={`Etapa atual: ${humanize(status)}`}>
                          <span className="is-complete">Planejada</span>
                          <i />
                          <span className={status === 'EM_EXECUCAO' ? 'is-current' : status === 'BLOQUEADA' ? 'is-blocked' : ''}>Em campo</span>
                          <i />
                          <span>Auditoria</span>
                        </div>
                        {action.ativo_id ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAssetId(action.ativo_id || '')
                              setView('library')
                            }}
                          >
                            Acompanhar ativo
                          </button>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {view === 'history' ? (
          <div className="manager-completed-view">
            <header className="manager-stage-toolbar">
              <div>
                <span className="eyebrow">HISTÓRICO OPERACIONAL</span>
                <h2>Execuções concluídas</h2>
                <p>Registros preservados para consulta técnica e auditoria.</p>
              </div>
              <label>
                <SearchIcon />
                <input
                  value={search}
                  placeholder="Buscar execução, ativo ou responsável"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </header>
            <div className="manager-completed-list">
              {completedActions.map((action) => (
                <button
                  type="button"
                  key={action.id}
                  onClick={() => setSelectedHistoryAction(action)}
                >
                  <span><CheckIcon /></span>
                  <div>
                    <small>{actionAssetLabel(action)}</small>
                    <strong>{action.titulo || 'Execução concluída'}</strong>
                    <p>
                      Finalizada em {formatDate(action.finalizado_em || action.atualizado_em)}
                    </p>
                  </div>
                  <dl>
                    <div>
                      <dt>Responsável</dt>
                      <dd>{String(action.responsavel_nome || action.responsavel_id || 'Registro auditado')}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>Concluída</dd>
                    </div>
                  </dl>
                  <b>Ver auditoria</b>
                </button>
              ))}
              {!completedActions.length ? (
                <div className="manager-decision-empty">
                  <CheckIcon />
                  <strong>Nenhuma conclusão neste filtro</strong>
                  <span>As ações aprovadas pelo Gestor ficarão preservadas aqui.</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {view === 'critical' ? (
          <div className="manager-critical-view">
            <section>
              <header>
                <div><span className="eyebrow">ANORMALIDADES</span><h2>Exigem análise</h2></div>
                <span>{overview?.occurrences.length ?? 0}</span>
              </header>
              <div>
                {(overview?.occurrences ?? []).map((occurrence) => (
                  <button
                    type="button"
                    key={occurrence.id}
                    onClick={() => setSelectedOccurrence(occurrence)}
                  >
                    <AlertIcon />
                    <span>
                      <small>{occurrence.ativo_id || 'Ativo não informado'} · {humanize(occurrence.severidade)}</small>
                      <strong>{occurrence.titulo || 'Ocorrência operacional'}</strong>
                      <p>{occurrence.descricao || 'Sem descrição.'}</p>
                    </span>
                    <b>Analisar</b>
                  </button>
                ))}
                {!overview?.occurrences.length ? <p className="panel-state">Nenhuma anormalidade sem análise.</p> : null}
              </div>
            </section>
            <section>
              <header>
                <div><span className="eyebrow">PARADAS</span><h2>Equipamentos indisponíveis</h2></div>
                <span>{overview?.openStops.length ?? 0}</span>
              </header>
              <div>
                {(overview?.openStops ?? []).map((stop) => {
                  const treatment = treatmentByStop.get(stop.id)
                  const treatmentPending =
                    upper(treatment?.status) === 'AGUARDANDO_ANALISE'
                  return (
                    <article className="manager-stop-treatment" key={stop.id}>
                      <StopIcon />
                      <span>
                        <small>{humanize(stop.status)} · {formatDate(stop.iniciada_em)}</small>
                        <strong>{stop.ativo_id}</strong>
                        <p>{stop.motivo_parada || 'Motivo não informado.'}</p>
                      </span>
                      <div>
                        <b>{stop.elapsed_seconds ? formatDuration(stop.elapsed_seconds) : 'Em aberto'}</b>
                        {treatment ? (
                          <button
                            type="button"
                            disabled={!treatmentPending}
                            onClick={() => {
                              if (treatmentPending) {
                                setSelectedOccurrence(treatment)
                              }
                            }}
                          >
                            {treatmentPending ? 'Abrir tratamento' : 'Tratamento enviado'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={Boolean(treatingStopId)}
                            onClick={() => void handleStopTreatment(stop.id)}
                          >
                            {treatingStopId === stop.id
                              ? 'Preparando…'
                              : 'Criar tratamento'}
                          </button>
                        )}
                      </div>
                    </article>
                  )
                })}
                {!overview?.openStops.length ? <p className="panel-state">Nenhuma parada aberta.</p> : null}
              </div>
            </section>
          </div>
        ) : null}

        {view === 'library' ? (
          <div className="manager-library-view">
            <header className="manager-stage-toolbar">
              <div>
                <span className="eyebrow">BIBLIOTECA TÉCNICA</span>
                <h2>Equipamentos e componentes</h2>
              </div>
              <label>
                <SearchIcon />
                <input
                  value={search}
                  placeholder="TAG, equipamento ou localização"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </header>
            <div className="manager-library-layout">
              <div className="manager-library-list">
                {filteredAssets.map((asset) => (
                  <button
                    className={asset.id === assetId ? 'is-selected' : ''}
                    type="button"
                    key={asset.id}
                    onClick={() => setAssetId(asset.id)}
                  >
                    <AssetIcon />
                    <span>
                      <small>{asset.tag || asset.id}</small>
                      <strong>{asset.nome || 'Ativo sem nome'}</strong>
                      <p>{asset.localizacao_tecnica || 'Localização não informada'}</p>
                    </span>
                    <b>{humanize(asset.status)}</b>
                  </button>
                ))}
              </div>
              <AssetAnalyticDetail
                asset={selectedAsset}
                components={selectedComponents}
                current={current}
                journey={journey}
                loading={loading}
                onOpenDecision={onOpenDecision}
              />
            </div>
          </div>
        ) : null}
      </section>

      {selectedHistoryAction ? (
        <ActionReviewDialog
          action={selectedHistoryAction}
          readOnly
          onClose={() => setSelectedHistoryAction(null)}
          onDecisionComplete={() => undefined}
          onSessionExpired={onSessionExpired}
        />
      ) : null}
      {selectedOccurrence ? (
        <TechnicalAnalysisDialog
          occurrence={selectedOccurrence}
          onClose={() => setSelectedOccurrence(null)}
          onChanged={async () => {
            setSelectedOccurrence(null)
            await load(undefined, true)
          }}
        />
      ) : null}
    </main>
  )
}

function AssetAnalyticDetail({
  asset,
  components,
  current,
  journey,
  loading,
  onOpenDecision,
}: {
  asset: GestorAsset | null
  components: GestorAssetCatalog['components']
  current: GestorTechnicalKpis | null
  journey: GestorAssetJourney | null
  loading: boolean
  onOpenDecision: (
    kind: 'demand' | 'action' | 'model' | 'occurrence',
    id: string,
  ) => void
}) {
  return (
    <AssetJourneyPanel
      asset={asset}
      components={components}
      current={current}
      journey={journey}
      loading={loading}
      onOpenDecision={onOpenDecision}
    />
  )
}
