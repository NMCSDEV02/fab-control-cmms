import type { ApiEnvelope } from '../../types/api'
import { getApiUrl } from './config'

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

async function executeApiCall<T>(
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

  const request = executeApiCall<T>(apiUrl, action, payload, signal, timeoutMs)

  if (!dedupeKey) return request

  const sharedRequest = request.finally(() => {
    if (inFlightReads.get(dedupeKey) === sharedRequest) {
      inFlightReads.delete(dedupeKey)
    }
  })

  inFlightReads.set(dedupeKey, sharedRequest as Promise<ApiEnvelope<unknown>>)
  return sharedRequest
}
