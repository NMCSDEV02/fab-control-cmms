export interface GestorAction {
  id: string
  status: string
  titulo?: string
  prioridade?: string
  ativo_id?: string
  ativo_tag?: string
  ativo_nome?: string
  componente_nome?: string
  plano_id?: string
  gerado_em?: string
  finalizado_em?: string
  atualizado_em?: string
  locks_ativos?: number
  [key: string]: unknown
}

export interface GestorStop {
  id: string
  status: string
  ativo_id: string
  acao_id?: string
  iniciada_em?: string
  motivo_parada?: string
  elapsed_seconds?: number
  requires_return_confirmation?: boolean
  [key: string]: unknown
}

export interface GestorOccurrence {
  id: string
  status: string
  severidade?: string
  titulo?: string
  descricao?: string
  ativo_id?: string
  criado_em?: string
  [key: string]: unknown
}

export interface GestorKpiBase {
  ativo_id: string
  total_execucoes: number
  execucoes_finalizadas: number
  falhas_registradas: number
  acoes_abertas: number
  mttr_segundos: number
  disponibilidade_base_pct: number
  observacao?: string
}

export interface GestorExecution {
  id?: string
  acao_id?: string
  usuario_id?: string
  operador_id?: string
  status?: string
  iniciou_em?: string
  finalizou_em?: string
  resultado_operacional?: string
  resultado_tecnico?: string
  [key: string]: unknown
}

export interface GestorChecklistItem {
  id?: string
  acao_id?: string
  execucao_id?: string
  item_id?: string
  descricao?: string
  pergunta?: string
  titulo?: string
  resposta?: string
  valor?: string | number | boolean
  resultado?: string
  observacao?: string
  comentario?: string
  status?: string
  respondido?: boolean
  obrigatorio?: boolean
  bloqueante?: boolean
  usuario_id?: string
  respondido_por?: string
  [key: string]: unknown
}

export interface GestorEvidence {
  id?: string
  acao_id?: string
  execucao_id?: string
  checklist_execucao_id?: string
  tipo?: string
  nome_arquivo?: string
  url?: string
  observacao?: string
  usuario_id?: string
  criado_em?: string
  [key: string]: unknown
}

export interface GestorHistoryItem {
  id?: string
  evento?: string
  descricao?: string
  usuario_id?: string
  perfil?: string
  criado_em?: string
  [key: string]: unknown
}

export interface GestorActionDetail {
  acao: GestorAction
  os?: Record<string, unknown> | null
  ativo?: Record<string, unknown> | null
  componente?: Record<string, unknown> | null
  execucoes: GestorExecution[]
  checklist: GestorChecklistItem[]
  evidencias: GestorEvidence[]
  materiais: Record<string, unknown>[]
  locks: Record<string, unknown>[]
  historico: GestorHistoryItem[]
}

export interface GestorActionAudit {
  acao?: Record<string, unknown> | null
  execucao?: Record<string, unknown> | null
  checklist?: unknown
  evidencias?: unknown
  finalizacao?: {
    can_finalize?: boolean
    [key: string]: unknown
  } | null
  auditoria?: {
    integridade_ok?: boolean
    [key: string]: unknown
  } | null
  gestor_screen?: Record<string, unknown> | null
  [key: string]: unknown
}

export type GestorDecision = 'APROVAR' | 'REPROVAR'

export interface GestorDecisionResult {
  validated: boolean
  already_validated?: boolean
  acao_id: string
  decisao: GestorDecision
  status: string
}

export interface GestorOverview {
  actions: GestorAction[]
  validationQueue: GestorAction[]
  stops: GestorStop[]
  openStops: GestorStop[]
  occurrences: GestorOccurrence[]
  kpis: GestorKpiBase
  counts: {
    pending: number
    executing: number
    awaitingValidation: number
    blocked: number
    openStops: number
    awaitingOccurrences: number
  }
}

export interface GestorChecklistModel {
  id: string
  nome?: string
  tipo?: string
  criticidade?: string
  ativo_id?: string
  ativo_tag?: string
  ativo_nome?: string
  componente_id?: string
  componente_tag?: string
  componente_nome?: string
  workflow_status?: string
  status?: string
  revisao?: number
  tempo_estimado_min?: number
  requer_bloqueio?: string
  requer_evidencia?: string
  itens_count?: number
  atualizado_em?: string
  enviado_validacao_em?: string
  [key: string]: unknown
}

export interface GestorChecklistModelItem {
  id: string
  plano_id?: string
  ordem?: number
  titulo?: string
  instrucao?: string
  tipo_resposta?: string
  obrigatorio?: string
  evidencia_obrigatoria?: string
  bloqueia_finalizacao?: string
  categoria?: string
  unidade?: string
  limite_min?: number | string
  limite_max?: number | string
  status?: string
  [key: string]: unknown
}

export interface GestorChecklistModelValidation {
  id?: string
  plano_id?: string
  revisao?: number
  decisao?: string
  justificativa?: string
  usuario_id?: string
  perfil?: string
  criado_em?: string
  [key: string]: unknown
}

export interface GestorChecklistModelDetail {
  plano: GestorChecklistModel
  ativo?: Record<string, unknown> | null
  componente?: Record<string, unknown> | null
  itens: GestorChecklistModelItem[]
  validacoes: GestorChecklistModelValidation[]
  ultimo_parecer?: GestorChecklistModelValidation | null
  correcoes_pendentes?: boolean
  operacional?: boolean
}

export type GestorChecklistModelDecision = 'APROVAR' | 'DEVOLVER'

export interface GestorChecklistModelDecisionResult {
  validated: boolean
  plano_id: string
  decisao: GestorChecklistModelDecision
  workflow_status: string
  status: string
}

export interface GestorAsset {
  id: string
  tag?: string
  nome?: string
  tipo?: string
  criticidade?: string
  status?: string
  saude_pct?: number
  horimetro_atual?: number
  fabricante?: string
  modelo?: string
  numero_serie?: string
  localizacao_tecnica?: string
  linha_id?: string
  [key: string]: unknown
}

export interface GestorComponent {
  id: string
  ativo_id: string
  tag?: string
  nome?: string
  tipo?: string
  criticidade?: string
  status?: string
  vida_util_horas?: number
  vida_util_dias?: number
  horas_acumuladas?: number
  fabricante?: string
  modelo?: string
  localizacao_tecnica?: string
  [key: string]: unknown
}

export interface GestorAssetCatalog {
  assets: GestorAsset[]
  components: GestorComponent[]
}
