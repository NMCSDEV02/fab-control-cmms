import type {
  GestorAction,
  GestorActionAudit,
  GestorActionDetail,
  GestorAsset,
  GestorAssetCatalog,
  GestorChecklistModel,
  GestorChecklistModelDecision,
  GestorChecklistModelDecisionResult,
  GestorChecklistModelDetail,
  GestorComponent,
  GestorDecision,
  GestorDecisionResult,
  GestorKpiBase,
  GestorOccurrence,
  GestorOverview,
  GestorStop,
} from '../../types/gestor'
import {
  API_TIMEOUT_MS,
  ApiRequestError,
  callApi,
} from './client'
import { getGestorToken } from './config'

interface ActionListData {
  total: number
  status: string[]
  acoes: GestorAction[]
}

interface StopListData {
  total: number
  paradas: GestorStop[]
}

interface OccurrenceListData {
  total: number
  ocorrencias: GestorOccurrence[]
}

interface ChecklistModelListData {
  total: number
  modelos: GestorChecklistModel[]
}

interface AdminListData<T> {
  entidade: string
  total: number
  rows: T[]
}

const OPEN_STOP_STATUSES = new Set([
  'PARADA_ABERTA',
  'MANUTENCAO_EM_EXECUCAO',
  'AGUARDANDO_RETORNO_OPERACIONAL',
])

function gestorToken(): string {
  const token = getGestorToken()
  if (token) return token

  throw new ApiRequestError(
    'Sessão do gestor não encontrada. Entre novamente.',
    'GESTOR_SESSION_MISSING',
  )
}

async function readGestorData<T>(
  action: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await callApi<T>(
    action,
    {
      token: gestorToken(),
      ...payload,
    },
    signal,
    {
      timeoutMs: API_TIMEOUT_MS.DETAIL_READ,
      dedupe: true,
    },
  )

  if (!response.data) {
    throw new ApiRequestError(
      'A API não retornou dados para ' + action + '.',
      'GESTOR_EMPTY_RESPONSE',
      { action },
    )
  }

  return response.data
}

async function writeGestorData<T>(
  action: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await callApi<T>(
    action,
    {
      token: gestorToken(),
      ...payload,
    },
    undefined,
    {
      timeoutMs: API_TIMEOUT_MS.CRITICAL_WRITE,
    },
  )

  if (!response.data) {
    throw new ApiRequestError(
      'A API não confirmou a operação ' + action + '.',
      'GESTOR_EMPTY_RESPONSE',
      { action },
    )
  }

  return response.data
}

export async function getGestorActions(
  signal?: AbortSignal,
): Promise<GestorAction[]> {
  const data = await readGestorData<ActionListData>(
    'gestor.listar_acoes',
    {
      status: 'PENDENTE,EM_EXECUCAO,AGUARDANDO_VALIDACAO,BLOQUEADA',
      limite: 200,
    },
    signal,
  )

  return Array.isArray(data.acoes) ? data.acoes : []
}

export async function getGestorStops(
  signal?: AbortSignal,
): Promise<GestorStop[]> {
  const data = await readGestorData<StopListData>(
    'gestor.listar_paradas',
    { limite: 200 },
    signal,
  )

  return Array.isArray(data.paradas) ? data.paradas : []
}

export async function getGestorOccurrences(
  signal?: AbortSignal,
): Promise<GestorOccurrence[]> {
  const data = await readGestorData<OccurrenceListData>(
    'gestor.listar_ocorrencias',
    {
      status: 'AGUARDANDO_ANALISE',
      limite: 200,
    },
    signal,
  )

  return Array.isArray(data.ocorrencias) ? data.ocorrencias : []
}

export async function getGestorOverview(
  signal?: AbortSignal,
): Promise<GestorOverview> {
  const [actions, stops, occurrences, kpis] = await Promise.all([
    getGestorActions(signal),
    getGestorStops(signal),
    getGestorOccurrences(signal),
    getGestorKpis(signal),
  ])

  const statusCount = (status: string) =>
    actions.filter((action) => action.status.trim().toUpperCase() === status).length

  const validationQueue = actions.filter(
    (action) => action.status.trim().toUpperCase() === 'AGUARDANDO_VALIDACAO',
  )

  const openStops = stops.filter((stop) =>
    OPEN_STOP_STATUSES.has(stop.status.trim().toUpperCase()),
  )

  return {
    actions,
    validationQueue,
    stops,
    openStops,
    occurrences,
    kpis,
    counts: {
      pending: statusCount('PENDENTE'),
      executing: statusCount('EM_EXECUCAO'),
      awaitingValidation: validationQueue.length,
      blocked: statusCount('BLOQUEADA'),
      openStops: openStops.length,
      awaitingOccurrences: occurrences.length,
    },
  }
}

export async function getGestorKpis(
  signal?: AbortSignal,
): Promise<GestorKpiBase> {
  return readGestorData<GestorKpiBase>('cmms.kpis_base', {}, signal)
}

export async function getGestorChecklistModels(
  signal?: AbortSignal,
): Promise<GestorChecklistModel[]> {
  const data = await readGestorData<ChecklistModelListData>(
    'gestor.modelos_em_validacao',
    { limite: 200 },
    signal,
  )

  return Array.isArray(data.modelos) ? data.modelos : []
}

export async function getGestorChecklistModelDetail(
  modelId: string,
  signal?: AbortSignal,
): Promise<GestorChecklistModelDetail> {
  return readGestorData<GestorChecklistModelDetail>(
    'gestor.detalhe_modelo_checklist',
    { plano_id: modelId },
    signal,
  )
}

export async function validateGestorChecklistModel(
  modelId: string,
  decision: GestorChecklistModelDecision,
  justification: string,
): Promise<GestorChecklistModelDecisionResult> {
  return writeGestorData<GestorChecklistModelDecisionResult>(
    'gestor.validar_modelo_checklist',
    {
      plano_id: modelId,
      decisao: decision,
      justificativa: justification.trim(),
    },
  )
}

export async function getGestorAssetCatalog(
  signal?: AbortSignal,
): Promise<GestorAssetCatalog> {
  const [assetData, componentData] = await Promise.all([
    readGestorData<AdminListData<GestorAsset>>(
      'admin.listar',
      { entidade: 'ativos', limite: 500 },
      signal,
    ),
    readGestorData<AdminListData<GestorComponent>>(
      'admin.listar',
      { entidade: 'componentes', limite: 500 },
      signal,
    ),
  ])

  return {
    assets: Array.isArray(assetData.rows) ? assetData.rows : [],
    components: Array.isArray(componentData.rows) ? componentData.rows : [],
  }
}

export async function getGestorActionDetail(
  actionId: string,
  signal?: AbortSignal,
): Promise<GestorActionDetail> {
  return readGestorData<GestorActionDetail>(
    'gestor.detalhe_acao',
    { acao_id: actionId },
    signal,
  )
}

export async function getGestorActionAudit(
  actionId: string,
  signal?: AbortSignal,
): Promise<GestorActionAudit> {
  return readGestorData<GestorActionAudit>(
    'gestor.auditoria_execucao_checklist',
    { acao_id: actionId },
    signal,
  )
}

export async function validateGestorAction(
  actionId: string,
  decision: GestorDecision,
  comment: string,
): Promise<GestorDecisionResult> {
  return writeGestorData<GestorDecisionResult>(
    'gestor.validar_acao',
    {
      acao_id: actionId,
      decisao: decision,
      comentario: comment.trim(),
    },
  )
}

export function isGestorAuthenticationError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false

  return [
    'AUTH_REQUIRED',
    'AUTH_INVALID',
    'AUTH_EXPIRED',
    'SESSION_EXPIRED',
    'SESSION_INVALID',
    'TOKEN_EXPIRED',
    'GESTOR_SESSION_MISSING',
  ].includes(error.code)
}
