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

  let response: Response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      // text/plain evita preflight desnecessário com Google Apps Script.
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ action, payload }),
      signal,
      redirect: 'follow',
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiRequestError(
      'Não foi possível alcançar a API. Verifique internet, URL e publicação do Apps Script.',
      'NETWORK_ERROR',
      error,
    )
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
