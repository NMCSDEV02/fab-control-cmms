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
