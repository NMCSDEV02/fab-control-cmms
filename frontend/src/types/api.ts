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

export interface RawChecklistItem {
  id: string
  ui_key?: string
  execucao_id?: string
  acao_id?: string
  plano_item_id?: string
  ordem: number
  titulo: string
  instrucao?: string
  tipo_resposta?: string
  categoria?: string
  obrigatorio?: boolean
  evidencia_obrigatoria?: boolean
  bloqueia_finalizacao?: boolean
  parametro_nome?: string
  valor_esperado?: string | number
  opcoes?: string[]
  limite_min?: string | number
  limite_max?: string | number
  unidade?: string
  resposta?: string
  valor_numero?: string | number
  observacao?: string
  status?: string
  respondido?: boolean
  evidencias_count?: number
  input?: {
    tipo_resposta?: string
    componente?: string
    requer_resposta?: boolean
    requer_valor?: boolean
    requer_opcoes?: boolean
    suporta_evidencia?: boolean
    placeholder?: string
    opcoes?: string[]
    unidade?: string
    limite_min?: string | number
    limite_max?: string | number
  }
}

export interface OperatorActionDetailData {
  ok: boolean
  version: string
  contract_version?: string
  perfil?: string
  acao: {
    id: string
    os_id?: string
    ativo_id?: string
    componente_id?: string
    plano_id?: string
    origem?: string
    tipo?: string
    titulo?: string
    descricao?: string
    prioridade?: string
    status: string
    responsavel_id?: string
    gerado_em?: string
    iniciado_em?: string
    finalizado_em?: string
  }
  os?: {
    id?: string
    codigo?: string
    titulo?: string
    descricao?: string
    prioridade?: string
    status?: string
    aberta_em?: string
    iniciada_em?: string
    finalizada_em?: string
  }
  ativo?: {
    id?: string
    tag?: string
    nome?: string
    tipo?: string
    criticidade?: string
    status?: string
    saude_pct?: number
    horimetro_atual?: number
  }
  componente?: {
    id?: string
    tag?: string
    nome?: string
    tipo?: string
    criticidade?: string
    status?: string
    vida_util_horas?: number
    horas_acumuladas?: number
  }
  plano?: {
    id?: string
    nome?: string
    tipo?: string
    criticidade?: string
    gatilho_tipo?: string
    gatilho_valor?: number
    unidade?: string
    tempo_estimado_min?: number
    requer_bloqueio?: string
    requer_evidencia?: string
    status?: string
    workflow_status?: string
    revisao?: number
  }
  execucao?: {
    id?: string
    acao_id?: string
    operador_id?: string
    resultado?: string
    observacao?: string
    duracao_segundos?: number
    abriu_em?: string
    iniciou_em?: string
    finalizou_em?: string
    status?: string
  } | null
  checklist?: {
    modelo?: boolean
    execucao_id?: string
    total?: number
    respondidos?: number
    pending_count?: number
    evidence_missing_count?: number
    blockers_count?: number
    itens?: RawChecklistItem[]
  }
  ui?: {
    state?: string
    can_start?: boolean
    can_answer?: boolean
    can_save_batch?: boolean
    can_finalize?: boolean
    can_register_evidence?: boolean
    can_validate?: boolean
    message?: string
  }
  operator_screen?: {
    header?: {
      acao_id?: string
      execucao_id?: string
      os_id?: string
      os_codigo?: string
      title?: string
      subtitle?: string
      description?: string
      status?: string
      responsavel_id?: string
    }
    progress?: {
      total?: number
      respondidos?: number
      pendentes?: number
      percentual?: number
      evidencias_pendentes?: number
      bloqueios?: number
      completo?: boolean
      label?: string
    }
    action_bar?: {
      buttons?: Array<{
        id?: string
        label?: string
        endpoint?: string
        enabled?: boolean
        tone?: string
        payload?: Record<string, unknown>
        disabled_reason?: string
      }>
    }
  }
  analise_tecnica?: {
    situacao?: string
    causa_provavel?: string
    resultado_esperado?: string
    riscos?: Array<{ tipo?: string; titulo?: string; descricao?: string }>
    ferramentas?: Array<{ tipo?: string; nome?: string }>
    nrs?: string[]
    etapas?: Array<{ ordem?: number; titulo?: string; descricao?: string }>
  }
}

export interface StartActionData {
  ok?: boolean
  started?: boolean
  acao_id?: string
  execucao_id?: string
  status?: string
  version?: string
}


export interface ChecklistBatchItemInput {
  id?: string
  checklist_execucao_id?: string
  ordem: number
  resposta?: string
  valor?: number
  observacao?: string
}

export interface ChecklistBatchSaveData {
  ok: boolean
  version?: string
  acao_id: string
  execucao_id: string
  saved_count: number
  error_count: number
  salvos?: Array<{
    index?: number
    checklist_execucao_id?: string
    tipo_resposta?: string
    conforme?: string
    validacao_msg?: string
  }>
  erros?: Array<{
    index?: number
    ordem?: number
    checklist_execucao_id?: string
    code?: string
    message?: string
  }>
  can_finalize?: boolean
  message?: string
}

export interface EvidenceInput {
  checklist_execucao_id: string
  tipo: string
  nome_arquivo: string
  url: string
  observacao?: string
}

export interface EvidenceSaveData {
  saved: boolean
  checklist_execucao_id?: string
  evidencias_count?: number
  evidencia?: {
    id?: string
    execucao_id?: string
    acao_id?: string
    checklist_execucao_id?: string
    tipo?: string
    nome_arquivo?: string
    url?: string
    observacao?: string
    criado_em?: string
  }
}

export interface FinalizationValidationData {
  ok: boolean
  version?: string
  contract_version?: string
  acao_id: string
  execucao_id: string
  operador_id?: string
  can_finalize: boolean
  finalizacao?: {
    ok?: boolean
    can_finalize?: boolean
    total?: number
    respondidos?: number
    pending_count?: number
    evidence_missing_count?: number
    blockers_count?: number
    pendentes?: unknown[]
    evidencias_pendentes?: unknown[]
    bloqueios?: unknown[]
  }
  message?: string
}

export interface FinalizeActionInput {
  resultado: 'OK' | 'NOK'
  observacao: string
  duracao_segundos?: number
}

export interface FinalizeActionData {
  finalized: boolean
  acao_id: string
  execucao_id: string
  status_acao: string
}
