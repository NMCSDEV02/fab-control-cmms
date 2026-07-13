import type { ApiEnvelope } from '../../types/api'
import { getApiUrl } from './config'

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

export async function callApi<T>(
  action: string,
  payload: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<ApiEnvelope<T>> {
  const apiUrl = getApiUrl()

  if (!apiUrl) {
    throw new ApiRequestError(
      'URL da API não configurada. Abra Configurações e informe o endpoint.',
      'API_URL_MISSING',
    )
  }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 25_000)
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
      throw new ApiRequestError(
        'A API excedeu 25 segundos. Os dados salvos permanecem disponíveis; tente atualizar novamente.',
        'API_TIMEOUT',
        error,
      )
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
