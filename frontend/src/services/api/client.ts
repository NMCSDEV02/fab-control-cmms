import type { ApiEnvelope } from '../../types/api'
import { getApiTransport, getApiUrl, getLegacyApiUrl } from './config'

export const API_TIMEOUT_MS = {
  FAST_READ: 15_000,
  DETAIL_READ: 30_000,
  SAVE: 45_000,
  CRITICAL_WRITE: 60_000,
  EVIDENCE_UPLOAD: 90_000,
} as const

export interface ApiCallOptions {
  timeoutMs?: number
  dedupe?: boolean
  dedupeKey?: string
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code = 'API_REQUEST_FAILED',
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

const inFlightReads = new Map<string, Promise<ApiEnvelope<unknown>>>()

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`

  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
    .join(',')}}`
}

async function executeAppsScriptCall<T>(
  apiUrl: string,
  action: string,
  payload: Record<string, unknown>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ApiEnvelope<T>> {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abortFromCaller = () => controller.abort()
  signal?.addEventListener('abort', abortFromCaller, { once: true })

  let response: Response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ action, payload }),
      signal: controller.signal,
      redirect: 'follow',
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (signal?.aborted) throw error
      if (timedOut) {
        const timeoutSeconds = Math.round(timeoutMs / 1000)
        throw new ApiRequestError(
          `A API excedeu ${timeoutSeconds} segundos. Os dados salvos permanecem disponíveis; tente atualizar novamente.`,
          'API_TIMEOUT',
          { action, timeoutMs },
        )
      }
      throw new ApiRequestError('A requisição foi cancelada.', 'API_ABORTED', error)
    }
    throw new ApiRequestError(
      'Não foi possível alcançar a API. Verifique internet, URL e publicação do Apps Script.',
      'NETWORK_ERROR',
      error,
    )
  } finally {
    window.clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortFromCaller)
  }

  if (!response.ok) {
    throw new ApiRequestError(
      `A API respondeu com HTTP ${response.status}.`,
      'HTTP_ERROR',
      { status: response.status },
    )
  }

  let envelope: ApiEnvelope<T>
  try {
    envelope = (await response.json()) as ApiEnvelope<T>
  } catch (error) {
    throw new ApiRequestError(
      'A API não retornou JSON válido.',
      'INVALID_JSON',
      error,
    )
  }

  if (!envelope.ok) {
    throw new ApiRequestError(
      envelope.error?.message ?? 'A API rejeitou a operação.',
      envelope.error?.code ?? 'API_ERROR',
      envelope.error?.details,
    )
  }

  return envelope
}

interface NodeActionRequest {
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  body?: Record<string, unknown>
  token?: string
  transform?: (data: Record<string, unknown>) => unknown
}

function nodeActionRequest(
  action: string,
  payload: Record<string, unknown>,
): NodeActionRequest | null {
  const token = typeof payload.token === 'string' ? payload.token : undefined
  switch (action) {
    case 'auth.login':
      return {
        method: 'POST',
        path: '/v1/auth/login',
        body: { matricula: payload.matricula, senha: payload.senha },
      }
    case 'auth.first_access.complete':
      return {
        method: 'POST',
        path: '/v1/auth/first-access',
        body: {
          change_token: payload.change_token,
          senha_atual: payload.senha_atual,
          nova_senha: payload.nova_senha,
        },
      }
    case 'auth.recovery.request':
      return {
        method: 'POST',
        path: '/v1/auth/recovery',
        body: { matricula: payload.matricula },
      }
    case 'auth.logout':
      return { method: 'POST', path: '/v1/auth/logout', body: {}, token }
    case 'sistema.health':
      return { method: 'GET', path: '/health/ready' }
    case 'sistema.warmup':
      return {
        method: 'GET',
        path: '/v1/auth/session',
        token,
        transform: (data) => {
          const user = data.user as Record<string, unknown> | undefined
          return {
            warmed: true,
            version: data.release_version,
            perfil: user?.perfil ?? '',
            usuario_id: user?.id ?? '',
            elapsed_internal_ms: 0,
            loaded_tables: 0,
          }
        },
      }
    default:
      return null
  }
}

function nodeBaseUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
}

function isAppsScriptUrl(apiUrl: string): boolean {
  return /script\.google\.com|script\.googleusercontent\.com/i.test(apiUrl)
}

async function executeNodeCall<T>(
  apiUrl: string,
  action: string,
  request: NodeActionRequest,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ApiEnvelope<T>> {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abortFromCaller = () => controller.abort()
  signal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (request.body) headers['Content-Type'] = 'application/json'
    if (request.token) headers.Authorization = `Bearer ${request.token}`
    const response = await fetch(`${nodeBaseUrl(apiUrl)}${request.path}`, {
      method: request.method,
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: controller.signal,
    })
    const envelope = (await response.json()) as ApiEnvelope<Record<string, unknown>>
    if (!response.ok || !envelope.ok) {
      throw new ApiRequestError(
        envelope.error?.message ?? `A API respondeu com HTTP ${response.status}.`,
        envelope.error?.code ?? 'HTTP_ERROR',
        envelope.error?.details ?? { status: response.status },
      )
    }
    const data = envelope.data ?? {}
    return {
      ...envelope,
      data: (request.transform ? request.transform(data) : data) as T,
    }
  } catch (error) {
    if (error instanceof ApiRequestError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (signal?.aborted) throw error
      throw new ApiRequestError(
        timedOut ? `A API excedeu ${Math.round(timeoutMs / 1000)} segundos.` : 'A requisição foi cancelada.',
        timedOut ? 'API_TIMEOUT' : 'API_ABORTED',
        { action, timeoutMs },
      )
    }
    throw new ApiRequestError(
      'Não foi possível alcançar a API Node. Verifique a rede e a configuração do endpoint.',
      'NETWORK_ERROR',
      error,
    )
  } finally {
    window.clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

export function callApi<T>(
  action: string,
  payload: Record<string, unknown> = {},
  signal?: AbortSignal,
  options: ApiCallOptions = {},
): Promise<ApiEnvelope<T>> {
  const apiUrl = getApiUrl()

  if (!apiUrl) {
    return Promise.reject(
      new ApiRequestError(
        'URL da API não configurada. Abra Configurações e informe o endpoint.',
        'API_URL_MISSING',
      ),
    )
  }

  const timeoutMs = options.timeoutMs ?? API_TIMEOUT_MS.DETAIL_READ
  const canDedupe = options.dedupe === true && signal === undefined
  const dedupeKey = canDedupe
    ? options.dedupeKey ?? `${apiUrl}|${action}|${stableSerialize(payload)}`
    : ''

  if (dedupeKey) {
    const existing = inFlightReads.get(dedupeKey)
    if (existing) return existing as Promise<ApiEnvelope<T>>
  }

  const transport = getApiTransport()
  const useNode = transport === 'node' || (transport === 'auto' && !isAppsScriptUrl(apiUrl))
  const nodeRequest = useNode ? nodeActionRequest(action, payload) : null
  let request: Promise<ApiEnvelope<T>>
  if (nodeRequest) {
    request = executeNodeCall<T>(apiUrl, action, nodeRequest, signal, timeoutMs)
  } else if (useNode) {
    const legacyUrl = getLegacyApiUrl()
    request = legacyUrl
      ? executeAppsScriptCall<T>(legacyUrl, action, payload, signal, timeoutMs)
      : Promise.reject(
          new ApiRequestError(
            `A ação ${action} ainda não possui adaptador Node e o fallback legado não está configurado.`,
            'NODE_ACTION_NOT_MIGRATED',
            { action },
          ),
        )
  } else {
    request = executeAppsScriptCall<T>(apiUrl, action, payload, signal, timeoutMs)
  }

  if (!dedupeKey) return request

  const sharedRequest = request.finally(() => {
    if (inFlightReads.get(dedupeKey) === sharedRequest) {
      inFlightReads.delete(dedupeKey)
    }
  })

  inFlightReads.set(dedupeKey, sharedRequest as Promise<ApiEnvelope<unknown>>)
  return sharedRequest
}
