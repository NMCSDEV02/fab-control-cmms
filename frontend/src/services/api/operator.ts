import type { ChecklistBatchItemInput, ChecklistBatchSaveData, EvidenceInput, EvidenceSaveData, FinalizationValidationData, FinalizeActionData, FinalizeActionInput, HealthData, OperatorActionDetailData, OperatorActionsData, RawOperatorCard, StartActionData } from '../../types/api'
import type {
  ActionGroup,
  ActionPriority,
  ActionStatus,
  OperatorAction,
} from '../../types/operator'
import { callApi } from './client'
import { getOperatorToken } from './config'

function mapPriority(value?: string): ActionPriority {
  const normalized = (value ?? '').toUpperCase()
  if (normalized === 'CRITICA' || normalized === 'CRÍTICA') return 'CRITICA'
  if (normalized === 'ALTA') return 'ALTA'
  return 'NORMAL'
}

function mapStatus(value?: string): ActionStatus {
  const normalized = (value ?? '').toUpperCase()
  if (normalized === 'EM_EXECUCAO') return 'EM_EXECUCAO'
  if (normalized === 'AGUARDANDO_VALIDACAO') return 'AGUARDANDO_VALIDACAO'
  if (normalized === 'CONCLUIDA' || normalized === 'CONCLUÍDA') return 'CONCLUIDA'
  return 'PENDENTE'
}

function mapGroup(card: RawOperatorCard, priority: ActionPriority): ActionGroup {
  const source = String(card.group ?? card.grupo ?? card.origem ?? '').toUpperCase()
  if (source.includes('NAO_PROGRAM') || source.includes('NÃO_PROGRAM') || source.includes('EMERGEN')) {
    return 'NAO_PROGRAMADA'
  }
  if (source.includes('PROGRAM')) return 'PROGRAMADA'

  // Compatibilidade temporária com o contrato 1.1.2, que ainda não expõe grupo.
  return priority === 'CRITICA' ? 'NAO_PROGRAMADA' : 'PROGRAMADA'
}

function inferType(card: RawOperatorCard, group: ActionGroup): string {
  const explicit = String(card.tipo ?? '').trim()
  if (explicit) return explicit.toUpperCase()
  if (group === 'NAO_PROGRAMADA') return 'EMERGENCIAL'
  return 'PROGRAMADA'
}

export function mapOperatorCard(card: RawOperatorCard): OperatorAction {
  const priority = mapPriority(card.priority?.value)
  const group = mapGroup(card, priority)
  const id = card.acao_id ?? card.id ?? ''

  return {
    id,
    group,
    type: inferType(card, group),
    title: card.title?.trim() || 'Ação de manutenção',
    assetTag: card.asset?.tag?.trim() || card.asset?.id?.trim() || 'ATIVO',
    assetName: card.asset?.name?.trim() || 'Equipamento',
    componentTag:
      card.component?.tag?.trim() || card.component?.id?.trim() || 'COMPONENTE',
    componentName: card.component?.name?.trim() || 'Componente',
    description: card.description?.trim() || 'Sem descrição operacional.',
    priority,
    status: mapStatus(card.status?.state),
    startAt: card.dates?.gerado_em || new Date().toISOString(),
    durationMinutes:
      typeof card.duracao_minutos === 'number' ? card.duracao_minutos : undefined,
    crew: Array.isArray(card.equipe) ? card.equipe : [],
    progress: {
      total: card.progress?.total ?? 0,
      answered: card.progress?.respondidos ?? 0,
      pending: card.progress?.pendentes ?? 0,
      percentage: card.progress?.percentual ?? 0,
    },
  }
}

export async function getSystemHealth(signal?: AbortSignal): Promise<HealthData> {
  const response = await callApi<{ ok: boolean; app: string; version: string; spreadsheetId?: string; serverTime?: string }>(
    'sistema.health',
    {},
    signal,
  )

  if (!response.data) {
    throw new Error('Resposta de health sem conteúdo.')
  }

  return response.data
}

export async function getOperatorActions(signal?: AbortSignal): Promise<OperatorAction[]> {
  const token = getOperatorToken()
  if (!token) {
    throw new Error('Token do operador não configurado.')
  }

  const response = await callApi<OperatorActionsData>(
    'operador.minhas_acoes',
    { token },
    signal,
  )

  const cards =
    response.data?.cards ??
    response.data?.visual_cards ??
    response.data?.acoes ??
    []

  return cards.map(mapOperatorCard).filter((action) => Boolean(action.id))
}


export async function getOperatorActionDetail(
  actionId: string,
  signal?: AbortSignal,
): Promise<OperatorActionDetailData> {
  const token = getOperatorToken()
  if (!token) throw new Error('Token do operador não configurado.')

  const response = await callApi<OperatorActionDetailData>(
    'operador.tela_acao',
    { token, acao_id: actionId },
    signal,
  )

  if (!response.data) {
    throw new Error('A API não retornou os detalhes da ação.')
  }

  return response.data
}

export async function startOperatorAction(
  actionId: string,
): Promise<StartActionData> {
  const token = getOperatorToken()
  if (!token) throw new Error('Token do operador não configurado.')

  const response = await callApi<StartActionData>(
    'operador.iniciar_acao',
    { token, acao_id: actionId },
  )

  if (!response.data) {
    throw new Error('A API não retornou a confirmação de início.')
  }

  return response.data
}


export async function saveOperatorChecklistBatch(
  actionId: string,
  items: ChecklistBatchItemInput[],
): Promise<ChecklistBatchSaveData> {
  const token = getOperatorToken()
  if (!token) throw new Error('Token do operador não configurado.')

  const response = await callApi<ChecklistBatchSaveData>(
    'operador.salvar_checklist_lote',
    { token, acao_id: actionId, itens: items },
  )

  if (!response.data) throw new Error('A API não confirmou o salvamento do checklist.')
  return response.data
}

export async function registerOperatorEvidence(
  actionId: string,
  executionId: string,
  input: EvidenceInput,
): Promise<EvidenceSaveData> {
  const token = getOperatorToken()
  if (!token) throw new Error('Token do operador não configurado.')

  const response = await callApi<EvidenceSaveData>(
    'operador.registrar_evidencia',
    {
      token,
      acao_id: actionId,
      execucao_id: executionId,
      checklist_execucao_id: input.checklist_execucao_id,
      tipo: input.tipo,
      nome_arquivo: input.nome_arquivo,
      url: input.url,
      observacao: input.observacao ?? '',
    },
  )

  if (!response.data) throw new Error('A API não confirmou a evidência.')
  return response.data
}

export async function validateOperatorFinalization(
  actionId: string,
): Promise<FinalizationValidationData> {
  const token = getOperatorToken()
  if (!token) throw new Error('Token do operador não configurado.')

  const response = await callApi<FinalizationValidationData>(
    'operador.validar_finalizacao_acao',
    { token, acao_id: actionId },
  )

  if (!response.data) throw new Error('A API não retornou a validação da finalização.')
  return response.data
}

export async function finalizeOperatorAction(
  actionId: string,
  input: FinalizeActionInput,
): Promise<FinalizeActionData> {
  const token = getOperatorToken()
  if (!token) throw new Error('Token do operador não configurado.')

  const response = await callApi<FinalizeActionData>(
    'operador.finalizar_acao',
    {
      token,
      acao_id: actionId,
      resultado: input.resultado,
      observacao: input.observacao,
      duracao_segundos: input.duracao_segundos ?? 0,
    },
  )

  if (!response.data) throw new Error('A API não confirmou a finalização.')
  return response.data
}
