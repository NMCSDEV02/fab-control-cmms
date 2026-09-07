import { APP_RELEASE_VERSION, isCompatibleRelease } from '../../release'
import { API_TIMEOUT_MS, ApiRequestError, callApi } from './client'

export interface AuthenticatedOperator {
  id: string
  nome: string
  email: string
  matricula: string
  perfil: string
  tipo_conta?: 'OPERADOR' | 'TECNICO_MANUTENCAO' | 'COMANDO_INTERNO'
  papeis?: string[]
  capacidades?: string[]
  personas?: string[]
  especialidades?: string[]
  area_id?: string | null
  cargo_tecnico_id?: string | null
  escopo_ids?: string[]
  escopos?: Array<{ type: string; id: string }>
}

export interface OperatorSession {
  token: string
  startedAt: string
  expiresAt: number
  user: AuthenticatedOperator
}

export interface LoginResponseData {
  requires_password_change: boolean
  first_access?: boolean
  change_token?: string
  token?: string
  expira_em?: string
  expira_ms?: number
  usuario: AuthenticatedOperator
  release_version?: string
  api_version?: string
  schema_version?: string
  contract_version?: string
  frontend_version?: string
  warmup_required?: boolean
  warmup_action?: string
}

export interface FirstAccessResponseData extends Omit<LoginResponseData, 'requires_password_change'> {
  password_changed: boolean
}

export interface RecoveryResponseData {
  accepted: boolean
  request_id: string
  message?: string
  release_version?: string
}

function assertReleaseVersion(receivedVersion?: string): void {
  if (isCompatibleRelease(receivedVersion)) return
  throw new ApiRequestError(
    `Versão incompatível. Aplicativo ${APP_RELEASE_VERSION}; API ${receivedVersion || 'não identificada'}.`,
    'VERSION_MISMATCH',
    { expected: APP_RELEASE_VERSION, received: receivedVersion },
  )
}

export async function loginOperator(
  matricula: string,
  senha: string,
  signal?: AbortSignal,
): Promise<LoginResponseData> {
  const response = await callApi<LoginResponseData>(
    'auth.login',
    {
      matricula,
      senha,
      user_agent: navigator.userAgent,
    },
    signal,
    { timeoutMs: API_TIMEOUT_MS.DETAIL_READ },
  )

  if (!response.data) {
    throw new ApiRequestError('A API não retornou os dados de autenticação.', 'AUTH_EMPTY_RESPONSE')
  }

  assertReleaseVersion(response.data.release_version)
  const roles = [response.data.usuario.perfil, ...(response.data.usuario.papeis ?? [])]
    .map((profile) => profile.trim().toUpperCase())
  if (response.data.usuario.tipo_conta !== undefined && response.data.usuario.tipo_conta !== 'OPERADOR') {
    throw new ApiRequestError(
      'Este aplicativo permite acesso apenas a contas de Operador.',
      'ROLE_NOT_ALLOWED',
      { received: response.data.usuario.tipo_conta },
    )
  }
  if (response.data.usuario.tipo_conta === undefined && !roles.includes('OPERADOR')) {
    throw new ApiRequestError(
      'Este aplicativo permite acesso apenas ao perfil OPERADOR.',
      'ROLE_NOT_ALLOWED',
      { received: roles },
    )
  }
  return response.data
}

export async function completeFirstAccess(
  changeToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<FirstAccessResponseData> {
  const response = await callApi<FirstAccessResponseData>(
    'auth.first_access.complete',
    {
      change_token: changeToken,
      senha_atual: currentPassword,
      nova_senha: newPassword,
      user_agent: navigator.userAgent,
    },
    undefined,
    { timeoutMs: API_TIMEOUT_MS.CRITICAL_WRITE },
  )

  if (!response.data) {
    throw new ApiRequestError('A API não confirmou a alteração da senha.', 'AUTH_EMPTY_RESPONSE')
  }

  assertReleaseVersion(response.data.release_version)
  return response.data
}

export async function requestPasswordRecovery(
  matricula: string,
): Promise<RecoveryResponseData> {
  const response = await callApi<RecoveryResponseData>(
    'auth.recovery.request',
    {
      matricula,
      user_agent: navigator.userAgent,
    },
    undefined,
    { timeoutMs: API_TIMEOUT_MS.SAVE },
  )

  if (!response.data) {
    throw new ApiRequestError('A API não confirmou a solicitação.', 'AUTH_EMPTY_RESPONSE')
  }

  assertReleaseVersion(response.data.release_version)
  return response.data
}

export async function revokeOperatorSession(token: string): Promise<void> {
  if (!token) return
  await callApi(
    'auth.logout',
    { token },
    undefined,
    { timeoutMs: API_TIMEOUT_MS.SAVE },
  )
}
