import type {
  AdminAuditListData,
  AdminBackupCreateData,
  AdminBackupListData,
  AdminBackupRestorePreparation,
  AdminBackupRestoreResult,
  AdminDocumentDetailData,
  AdminDocumentFileInput,
  AdminDocumentListData,
  AdminDocumentMetadataInput,
  AdminDocumentStatus,
  AdminDocumentType,
  AdminMonitoringState,
} from '../../types/governance'
import { API_TIMEOUT_MS, ApiRequestError, callApi } from './client'
import { getGestorToken } from './config'

function adminToken(): string {
  const token = getGestorToken()
  if (token) return token
  throw new ApiRequestError('Sessão administrativa não encontrada. Entre novamente.', 'GESTOR_SESSION_MISSING')
}

async function readGovernance<T>(
  action: string,
  payload: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await callApi<T>(
    action,
    { token: adminToken(), ...payload },
    signal,
    { timeoutMs: API_TIMEOUT_MS.DETAIL_READ, dedupe: !signal },
  )
  if (!response.data) throw new ApiRequestError(`A API não retornou dados para ${action}.`, 'ADMIN_GOVERNANCE_EMPTY')
  return response.data
}

async function writeGovernance<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const response = await callApi<T>(
    action,
    { token: adminToken(), user_agent: navigator.userAgent, ...payload },
    undefined,
    { timeoutMs: API_TIMEOUT_MS.CRITICAL_WRITE },
  )
  if (!response.data) throw new ApiRequestError(`A API não confirmou ${action}.`, 'ADMIN_GOVERNANCE_EMPTY')
  return response.data
}

export function listAdminDocuments(
  filters: { busca?: string; status?: AdminDocumentStatus | ''; tipo?: AdminDocumentType | '' } = {},
  signal?: AbortSignal,
): Promise<AdminDocumentListData> {
  return readGovernance('admin.documentos.listar', { ...filters, limite: 500 }, signal)
}

export function getAdminDocument(documentId: string): Promise<AdminDocumentDetailData> {
  return readGovernance('admin.documentos.detalhe', { documento_id: documentId })
}

export function uploadAdminDocument(
  metadata: AdminDocumentMetadataInput,
  file: AdminDocumentFileInput,
): Promise<{ saved: boolean; documento: AdminDocumentDetailData['documento'] }> {
  return writeGovernance('admin.documentos.upload', { dados: metadata, arquivo: file })
}

export function updateAdminDocument(
  metadata: AdminDocumentMetadataInput,
): Promise<{ saved: boolean; documento: AdminDocumentDetailData['documento'] }> {
  return writeGovernance('admin.documentos.atualizar', { dados: metadata })
}

export function listAdminAudit(
  filters: { busca?: string; acao?: string; entidade?: string; usuario_id?: string } = {},
  signal?: AbortSignal,
): Promise<AdminAuditListData> {
  return readGovernance('admin.auditoria.listar', { ...filters, limite: 500 }, signal)
}

export function getAdminMonitoring(signal?: AbortSignal): Promise<AdminMonitoringState> {
  return readGovernance('admin.monitoramento.estado', {}, signal)
}

export function listAdminBackups(signal?: AbortSignal): Promise<AdminBackupListData> {
  return readGovernance('admin.backups.listar', { limite: 200 }, signal)
}

export function createAdminBackup(reason: string, confirmation: string): Promise<AdminBackupCreateData> {
  return writeGovernance('admin.backups.criar', { motivo: reason, confirmacao: confirmation })
}

export function prepareAdminBackupRestore(backupId: string): Promise<AdminBackupRestorePreparation> {
  return writeGovernance('admin.backups.preparar_restauracao', { backup_id: backupId })
}

export function confirmAdminBackupRestore(input: {
  token: string
  backupId: string
  challenge: string
  finalConfirmation: string
  reason: string
}): Promise<AdminBackupRestoreResult> {
  return writeGovernance('admin.backups.confirmar_restauracao', {
    token: input.token,
    backup_id: input.backupId,
    confirmacao: input.challenge,
    confirmacao_final: input.finalConfirmation,
    motivo: input.reason,
    criar_backup_seguranca: true,
  })
}
