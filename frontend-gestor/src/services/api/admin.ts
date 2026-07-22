import type {
  AdminPasswordResetResult,
  AdminPermissionMatrix,
  AdminPermissionSaveResult,
  AdminSessionRevokeResult,
  AdminUser,
  AdminUserInput,
  AdminUserListFilters,
  AdminUserProfile,
  AdminUserSaveResult,
  TechnicalArea,
  TechnicalRole,
  ConfigurationDraft,
  ConfigurationEngineState,
  ConfigurationPublishResult,
  ConfigurationValidation,
  ConfigurationValue,
  ConfigurationVersion,
} from '../../types/admin'
import { API_TIMEOUT_MS, ApiRequestError, callApi } from './client'
import { getGestorToken } from './config'

interface AdminUserListData {
  total: number
  usuarios: AdminUser[]
}

interface AdminUnlockResult {
  unlocked: boolean
  usuario_id: string
}

interface TechnicalAreaListData {
  total: number
  areas: TechnicalArea[]
}

interface TechnicalRoleListData {
  total: number
  cargos: TechnicalRole[]
}

function adminToken(): string {
  const token = getGestorToken()
  if (token) return token
  throw new ApiRequestError(
    'Sessão administrativa não encontrada. Entre novamente.',
    'GESTOR_SESSION_MISSING',
  )
}

async function readAdminData<T>(
  action: string,
  payload: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await callApi<T>(
    action,
    { token: adminToken(), ...payload },
    signal,
    {
      timeoutMs: API_TIMEOUT_MS.DETAIL_READ,
      dedupe: true,
    },
  )
  if (!response.data) {
    throw new ApiRequestError(
      `A API não retornou dados para ${action}.`,
      'ADMIN_EMPTY_RESPONSE',
      { action },
    )
  }
  return response.data
}

async function writeAdminData<T>(
  action: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await callApi<T>(
    action,
    {
      token: adminToken(),
      user_agent: navigator.userAgent,
      ...payload,
    },
    undefined,
    { timeoutMs: API_TIMEOUT_MS.CRITICAL_WRITE },
  )
  if (!response.data) {
    throw new ApiRequestError(
      `A API não confirmou a operação ${action}.`,
      'ADMIN_EMPTY_RESPONSE',
      { action },
    )
  }
  return response.data
}

export async function listAdminUsers(
  filters: AdminUserListFilters = {},
  signal?: AbortSignal,
): Promise<AdminUser[]> {
  const data = await readAdminData<AdminUserListData>(
    'admin.usuarios.listar',
    {
      busca: filters.busca?.trim() ?? '',
      perfil: filters.perfil ?? '',
      status: filters.status ?? '',
      limite: 500,
    },
    signal,
  )
  return Array.isArray(data.usuarios) ? data.usuarios : []
}

export function saveAdminUser(input: AdminUserInput): Promise<AdminUserSaveResult> {
  return writeAdminData<AdminUserSaveResult>('admin.usuarios.salvar', {
    dados: input,
  })
}

export async function listTechnicalAreas(signal?: AbortSignal): Promise<TechnicalArea[]> {
  const data = await readAdminData<TechnicalAreaListData>(
    'admin.areas_tecnicas.listar',
    { status: 'ATIVO' },
    signal,
  )
  return Array.isArray(data.areas) ? data.areas : []
}

export async function listTechnicalRoles(
  areaId = '',
  signal?: AbortSignal,
): Promise<TechnicalRole[]> {
  const data = await readAdminData<TechnicalRoleListData>(
    'admin.cargos_tecnicos.listar',
    { area_id: areaId, status: 'ATIVO' },
    signal,
  )
  return Array.isArray(data.cargos) ? data.cargos : []
}

export function unlockAdminUser(userId: string): Promise<AdminUnlockResult> {
  return writeAdminData<AdminUnlockResult>('admin.usuarios.desbloquear', {
    usuario_id: userId,
  })
}

export function resetAdminUserPassword(
  userId: string,
  temporaryPassword: string,
): Promise<AdminPasswordResetResult> {
  return writeAdminData<AdminPasswordResetResult>(
    'admin.usuarios.redefinir_senha',
    {
      usuario_id: userId,
      senha_temporaria: temporaryPassword,
    },
  )
}

export function revokeAdminUserSessions(
  userId: string,
): Promise<AdminSessionRevokeResult> {
  return writeAdminData<AdminSessionRevokeResult>(
    'admin.usuarios.revogar_sessoes',
    { usuario_id: userId },
  )
}

export function getAdminPermissionMatrix(
  signal?: AbortSignal,
): Promise<AdminPermissionMatrix> {
  return readAdminData<AdminPermissionMatrix>(
    'admin.permissoes.obter',
    {},
    signal,
  )
}

export function saveAdminPermissionProfile(
  profile: AdminUserProfile,
  permissions: Record<string, boolean>,
): Promise<AdminPermissionSaveResult> {
  return writeAdminData<AdminPermissionSaveResult>(
    'admin.permissoes.salvar',
    { perfil: profile, permissoes: permissions },
  )
}

export function getConfigurationEngineState(
  signal?: AbortSignal,
): Promise<ConfigurationEngineState> {
  return readAdminData<ConfigurationEngineState>('admin.configuracao.estado', {}, signal)
}

export async function listConfigurationVersions(
  signal?: AbortSignal,
): Promise<ConfigurationVersion[]> {
  const data = await readAdminData<{ total: number; versoes: ConfigurationVersion[] }>(
    'admin.configuracao.versoes',
    { limite: 50 },
    signal,
  )
  return Array.isArray(data.versoes) ? data.versoes : []
}

export async function saveConfigurationDraft(
  configuration: Record<string, ConfigurationValue>,
  baseVersionId: string,
): Promise<ConfigurationDraft> {
  const data = await writeAdminData<{ saved: boolean; rascunho: ConfigurationDraft }>(
    'admin.configuracao.rascunho.salvar',
    { configuracao: configuration, base_versao_id: baseVersionId },
  )
  return data.rascunho
}

export function validateConfiguration(
  configuration: Record<string, ConfigurationValue>,
): Promise<ConfigurationValidation> {
  return writeAdminData<ConfigurationValidation>('admin.configuracao.validar', {
    configuracao: configuration,
  })
}

export function publishConfigurationDraft(
  draftId: string,
): Promise<ConfigurationPublishResult> {
  return writeAdminData<ConfigurationPublishResult>('admin.configuracao.publicar', {
    rascunho_id: draftId,
  })
}

export function rollbackConfiguration(
  versionId: string,
  baseVersionId: string,
  reason: string,
): Promise<ConfigurationPublishResult> {
  return writeAdminData<ConfigurationPublishResult>('admin.configuracao.rollback', {
    versao_id: versionId,
    base_versao_id: baseVersionId,
    motivo: reason,
  })
}
