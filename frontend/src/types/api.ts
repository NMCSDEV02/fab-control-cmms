export interface ApiError {
  code: string
  message: string
  details?: unknown
}

export interface ApiEnvelope<T> {
  ok: boolean
  action: string
  elapsed_ms?: number
  data?: T
  error?: ApiError
}

export interface HealthData {
  ok: boolean
  app: string
  version: string
  spreadsheetId?: string
  serverTime?: string
}

export interface RawOperatorCard {
  id?: string
  acao_id?: string
  title?: string
  subtitle?: string
  description?: string
  priority?: {
    value?: string
    label?: string
    tone?: string
  }
  status?: {
    state?: string
    label?: string
    tone?: string
    icon?: string
  }
  progress?: {
    total?: number
    respondidos?: number
    pendentes?: number
    percentual?: number
  }
  asset?: {
    id?: string
    tag?: string
    name?: string
    label?: string
  }
  component?: {
    id?: string
    tag?: string
    name?: string
    label?: string
  }
  dates?: {
    gerado_em?: string
    iniciado_em?: string
    finalizado_em?: string
  }
  primary_action?: {
    label?: string
    endpoint?: string
    payload?: Record<string, unknown>
  }
  group?: string
  grupo?: string
  origem?: string
  tipo?: string
  duracao_minutos?: number
  equipe?: string[]
}

export interface OperatorActionsData {
  ok: boolean
  version: string
  contract_version?: string
  operador_id: string
  resumo?: {
    total?: number
    aguardando_inicio?: number
    em_execucao?: number
    aguardando_validacao?: number
    concluidas?: number
    bloqueadas?: number
  }
  total?: number
  cards?: RawOperatorCard[]
  acoes?: RawOperatorCard[]
  visual_cards?: RawOperatorCard[]
}
