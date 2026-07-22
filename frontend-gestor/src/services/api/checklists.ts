import type {
  AdminChecklistDetail,
  AdminChecklistItem,
  AdminChecklistPlan,
  AdminChecklistSaveResult,
  AdminChecklistSendInput,
  AdminChecklistSendResult,
} from '../../types/checklists'
import { API_TIMEOUT_MS, ApiRequestError, callApi } from './client'
import { getGestorToken } from './config'

function adminToken(): string {
  const token = getGestorToken()
  if (token) return token
  throw new ApiRequestError('Sessão administrativa não encontrada. Entre novamente.', 'GESTOR_SESSION_MISSING')
}

export async function listAdminChecklistModels(signal?: AbortSignal): Promise<AdminChecklistPlan[]> {
  const response = await callApi<{ total: number; modelos: AdminChecklistPlan[] }>(
    'admin.listar_modelos_checklist',
    { token: adminToken(), limite: 300 },
    signal,
    { timeoutMs: API_TIMEOUT_MS.DETAIL_READ, dedupe: true },
  )
  if (!response.data) throw new ApiRequestError('A API não retornou os modelos de checklist.', 'ADMIN_CHECKLIST_EMPTY')
  return Array.isArray(response.data.modelos) ? response.data.modelos : []
}

export async function getAdminChecklistDetail(
  planId: string,
  signal?: AbortSignal,
): Promise<AdminChecklistDetail> {
  const response = await callApi<AdminChecklistDetail>(
    'admin.detalhe_modelo_checklist',
    { token: adminToken(), plano_id: planId },
    signal,
    { timeoutMs: API_TIMEOUT_MS.DETAIL_READ, dedupe: true },
  )
  if (!response.data) throw new ApiRequestError('A API não retornou o checklist.', 'ADMIN_CHECKLIST_EMPTY')
  return response.data
}

export async function saveAdminChecklistModel(
  plan: AdminChecklistPlan,
  items: AdminChecklistItem[],
): Promise<AdminChecklistSaveResult> {
  const response = await callApi<AdminChecklistSaveResult>(
    'admin.salvar_modelo_checklist',
    { token: adminToken(), plano: plan, itens: items, user_agent: navigator.userAgent },
    undefined,
    { timeoutMs: API_TIMEOUT_MS.CRITICAL_WRITE },
  )
  if (!response.data) throw new ApiRequestError('A API não confirmou o checklist.', 'ADMIN_CHECKLIST_EMPTY')
  return response.data
}

export async function sendAdminChecklistForValidation(
  input: AdminChecklistSendInput,
): Promise<AdminChecklistSendResult> {
  const response = await callApi<AdminChecklistSendResult>(
    'admin.enviar_modelo_checklist_validacao',
    { token: adminToken(), ...input, user_agent: navigator.userAgent },
    undefined,
    { timeoutMs: API_TIMEOUT_MS.CRITICAL_WRITE },
  )
  if (!response.data) throw new ApiRequestError('A API não confirmou o envio para validação.', 'ADMIN_CHECKLIST_EMPTY')
  return response.data
}
