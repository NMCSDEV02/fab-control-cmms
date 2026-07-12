const FAB = {
  APP_NAME: "FAB Control",
  VERSION: "1.1.3-qr-operador-real",
  TZ: "America/Sao_Paulo",
  TOKEN_HOURS: 12,
  LOCK_TTL_SECONDS: 120,
  QR_CACHE_SECONDS: 90,
  AUTH_CACHE_SECONDS: 180,
  WARMUP_CACHE_SECONDS: 300,
  QR_FAST_CACHE_SECONDS: 30,
  MOTOR_THRESHOLD_RATIO: 0.98
};

const PROP_SPREADSHEET_ID = "FAB_CONTROL_SPREADSHEET_ID";

const ROLE = {
  ADMIN: "ADMIN",
  GESTOR: "GESTOR",
  OPERADOR: "OPERADOR",
  SISTEMA: "SISTEMA"
};

const ST = {
  ATIVO: "ATIVO",
  INATIVO: "INATIVO",
  OPERANDO: "OPERANDO",
  ABERTA: "ABERTA",
  PENDENTE: "PENDENTE",
  EM_EXECUCAO: "EM_EXECUCAO",
  AGUARDANDO_VALIDACAO: "AGUARDANDO_VALIDACAO",
  CONCLUIDA: "CONCLUIDA",
  CANCELADA: "CANCELADA",
  BLOQUEADA: "BLOQUEADA",
  RASCUNHO: "RASCUNHO",
  EM_VALIDACAO_GESTAO: "EM_VALIDACAO_GESTAO",
  DEVOLVIDO_CORRECAO: "DEVOLVIDO_CORRECAO",
  VALIDADO: "VALIDADO",
  OBSOLETO: "OBSOLETO",
  RESPONDIDO: "RESPONDIDO",
  FINALIZADA: "FINALIZADA"
};

const SH = {
  config: ["chave", "valor", "descricao", "atualizado_em"],
  usuarios: ["id", "nome", "email", "perfil", "status", "pin_hash", "criado_em", "atualizado_em"],
  sessoes: ["token", "usuario_id", "perfil", "status", "criado_em", "expira_em", "ultimo_uso_em", "user_agent"],

  plantas: ["id", "tag", "nome", "status", "criado_em", "atualizado_em"],
  setores: ["id", "planta_id", "tag", "nome", "status", "criado_em", "atualizado_em"],
  linhas: ["id", "setor_id", "tag", "nome", "status", "criado_em", "atualizado_em"],

  ativos: ["id", "linha_id", "tag", "qr_payload", "nome", "tipo", "criticidade", "status", "saude_pct", "horimetro_atual", "fabricante", "modelo", "numero_serie", "localizacao_tecnica", "criado_em", "atualizado_em"],

  componentes: ["id", "ativo_id", "tag", "qr_payload", "nome", "tipo", "criticidade", "status", "vida_util_horas", "vida_util_dias", "horas_acumuladas", "instalado_em", "fabricante", "modelo", "numero_serie", "localizacao_tecnica", "criado_em", "atualizado_em"],

  materiais: ["id", "sku", "nome", "unidade", "estoque_atual", "estoque_minimo", "status", "criado_em", "atualizado_em"],

  planos_manutencao: ["id", "ativo_id", "componente_id", "nome", "tipo", "criticidade", "gatilho_tipo", "gatilho_valor", "unidade", "recorrencia_dias", "tempo_estimado_min", "requer_bloqueio", "requer_evidencia", "max_sessoes", "status", "ultimo_disparo_em", "criado_em", "atualizado_em", "workflow_status", "validado_gestao", "validado_por", "validado_em", "devolvido_por", "devolvido_em", "devolvido_motivo", "enviado_validacao_em", "revisao", "setor_id", "modelo_base_id", "revisao_origem_id", "substitui_plano_id", "substituido_por", "substituido_em"],

  plano_itens: ["id", "plano_id", "ordem", "titulo", "instrucao", "tipo_resposta", "obrigatorio", "evidencia_obrigatoria", "foto_referencia_url", "limite_min", "limite_max", "unidade", "criado_em", "atualizado_em", "parametro_nome", "valor_esperado", "opcoes_json", "bloqueia_finalizacao", "categoria", "peso", "status", "validacao_regra"],

  plano_controle: ["plano_id", "ativo_id", "componente_id", "gatilho_tipo", "gatilho_valor", "ultimo_valor_processado", "proximo_valor_gatilho", "ultima_acao_id", "ultima_acao_status", "atualizado_em"],

  ordens_servico: ["id", "codigo", "ativo_id", "componente_id", "origem", "tipo", "titulo", "descricao", "prioridade", "status", "solicitante_id", "responsavel_id", "aberta_em", "planejada_para", "iniciada_em", "finalizada_em", "criado_em", "atualizado_em"],

  os_acoes: ["id", "os_id", "ativo_id", "componente_id", "plano_id", "origem", "tipo", "titulo", "descricao", "prioridade", "status", "responsavel_id", "gerado_em", "iniciado_em", "finalizado_em", "atualizado_em"],

  execucoes: ["id", "acao_id", "os_id", "ativo_id", "componente_id", "operador_id", "resultado", "observacao", "duracao_segundos", "abriu_em", "iniciou_em", "finalizou_em", "status", "criado_em", "atualizado_em"],

  checklist_execucao: ["id", "execucao_id", "acao_id", "plano_item_id", "ordem", "titulo", "instrucao", "tipo_resposta", "obrigatorio", "resposta", "observacao", "evidencia_obrigatoria", "status", "responsavel_id", "data_hora", "criado_em", "atualizado_em", "parametro_nome", "valor_esperado", "opcoes_json", "limite_min", "limite_max", "unidade", "valor_numero", "conforme", "bloqueia_finalizacao", "validacao_msg", "evidencias_count", "categoria"],

  evidencias: ["id", "execucao_id", "acao_id", "checklist_execucao_id", "ativo_id", "componente_id", "tipo", "nome_arquivo", "url", "observacao", "usuario_id", "criado_em"],

  materiais_uso: ["id", "execucao_id", "acao_id", "material_id", "quantidade", "unidade", "observacao", "usuario_id", "criado_em"],
  parametros: ["id", "ativo_id", "componente_id", "parametro", "valor", "unidade", "origem", "registrado_por", "registrado_em", "criado_em"],

  historico: ["id", "ativo_id", "componente_id", "os_id", "acao_id", "execucao_id", "evento", "descricao", "usuario_id", "perfil", "criado_em"],
  execucao_locks: ["id", "ativo_id", "acao_id", "usuario_id", "sessao_id", "status", "adquirido_em", "ultimo_ping_em", "expira_em", "liberado_em", "motivo_liberacao", "user_agent"],
  telemetria_sessoes: ["id", "sessao_id", "usuario_id", "ativo_id", "acao_id", "evento", "visibilidade", "delta_segundos", "tempo_total_segundos", "tempo_visivel_segundos", "tempo_oculto_segundos", "user_agent", "criado_em"],
  audit_log: ["id", "usuario_id", "perfil", "acao", "entidade", "entidade_id", "antes_json", "depois_json", "user_agent", "criado_em"],
  checklist_modelo_validacoes: ["id", "plano_id", "revisao", "decisao", "justificativa", "usuario_id", "perfil", "criado_em"],
  checklist_tipos_item: ["id", "tipo", "nome", "descricao", "requer_resposta", "requer_valor", "requer_opcoes", "suporta_limite", "suporta_evidencia", "categoria_padrao", "ativo", "criado_em"],
  checklist_validacao_regras: ["id", "tipo_item", "codigo", "nome", "descricao", "regra_json", "ativo", "criado_em"],
  modelo_checklist_auditoria: ["id", "plano_id", "item_id", "evento", "antes_json", "depois_json", "usuario_id", "perfil", "criado_em"],
  dashboard_cache: ["chave", "valor_json", "gerado_em", "ttl_segundos"],

  legado_quarentena: ["id", "aba_origem", "linha_origem", "motivo", "payload_json", "movido_em"]
};

const PUBLIC_ACTIONS = ["sistema.health", "sistema.bootstrap", "auth.login"];

const PERM = {
  ADMIN: [
    "cmms.operador_visual_schema_upgrade", "cmms.tela_operador_schema_upgrade", "operador.home", "operador.painel", "cmms.operador_ui_schema_upgrade", "cmms.operacional_ui_schema_upgrade", "cmms.contrato_frontend_schema_upgrade", "cmms.frontend_contract_schema_upgrade", "cmms.execucao_checklist_schema_upgrade", "cmms.auditoria_operador_schema_upgrade", "admin.corrigir_auditoria_execucao_operador", "admin.gerar_acao_teste_checklist", "operador.minhas_acoes", "operador.tela_acao", "operador.salvar_checklist_lote", "operador.detalhar_checklist_execucao", "operador.validar_finalizacao_acao",
    "admin.listar_tipos_item_checklist", "admin.listar_regras_checklist", "admin.validar_catalogo_item_checklist", "admin.salvar_item_modelo_checklist", "admin.remover_item_modelo_checklist", "admin.reordenar_itens_modelo_checklist", "admin.clonar_item_modelo_checklist", "admin.listar_itens_modelo_checklist", "admin.detalhar_modelo_checklist_catalogo", "cmms.catalogo_checklist_schema_upgrade",
    "cmms.schema_upgrade", "admin.salvar_modelo_checklist", "admin.enviar_modelo_checklist_validacao", "admin.detalhe_modelo_checklist", "admin.listar_modelos_checklist", "admin.modelos_devolvidos", "admin.corrigir_modelo_checklist", "admin.criar_revisao_modelo_checklist", "gestor.modelos_em_validacao", "gestor.listar_modelos_checklist", "gestor.detalhe_modelo_checklist", "gestor.validar_modelo_checklist", "operador.listar_checklist_execucao",
    "sistema.warmup", "admin.resumo", "perf.cache_clear", "perf.cache_status", "admin.resumo_cache", "admin.listar", "admin.obter", "admin.salvar", "admin.gerar_qr", "admin.criar_demo", "admin.recalcular_ativo",
    "operador.contexto_qr", "operador.contexto_qr_fast", "operador.iniciar_acao", "operador.salvar_checklist_item", "operador.finalizar_acao", "operador.registrar_evidencia", "operador.registrar_material", "operador.registrar_parametro",
    "gestor.listar_acoes", "gestor.detalhe_acao", "gestor.detalhe_acao_fast", "gestor.auditoria_execucao_checklist", "gestor.validar_acao", "gestor.configurar_sessoes", "gestor.adicionar_colaborador", "gestor.liberar_locks",
    "lock.status", "lock.adquirir", "lock.heartbeat", "lock.liberar",
    "cmms.kpis_base", "cmms.diagnostico", "perf.cache_status", "perf.cache_clear", "cmms.higiene_diagnosticar", "cmms.higienizar_status", "cmms.higienizar_duplicidades", "cmms.higienizar_base",
    "telemetria.iniciar", "telemetria.evento", "telemetria.finalizar"
  ],
  GESTOR: [
    "operador.home", "operador.painel", "operador.minhas_acoes", "operador.tela_acao", "operador.salvar_checklist_lote", "operador.detalhar_checklist_execucao", "operador.validar_finalizacao_acao",
    "admin.listar_tipos_item_checklist", "admin.listar_regras_checklist", "admin.listar_itens_modelo_checklist", "admin.detalhar_modelo_checklist_catalogo",
    "gestor.modelos_em_validacao", "gestor.listar_modelos_checklist", "gestor.detalhe_modelo_checklist", "gestor.validar_modelo_checklist", "admin.detalhe_modelo_checklist", "operador.listar_checklist_execucao",
    "sistema.warmup",
    "admin.resumo", "perf.cache_clear", "perf.cache_status", "admin.resumo_cache", "admin.listar", "admin.obter", "admin.recalcular_ativo",
    "operador.contexto_qr", "operador.contexto_qr_fast",
    "gestor.listar_acoes", "gestor.detalhe_acao", "gestor.detalhe_acao_fast", "gestor.auditoria_execucao_checklist", "gestor.validar_acao", "gestor.configurar_sessoes", "gestor.adicionar_colaborador", "gestor.liberar_locks",
    "lock.status", "lock.adquirir", "lock.heartbeat", "lock.liberar",
    "cmms.kpis_base", "cmms.diagnostico", "perf.cache_status", "perf.cache_clear", "cmms.higiene_diagnosticar", "cmms.higienizar_status", "cmms.higienizar_duplicidades",
    "telemetria.iniciar", "telemetria.evento", "telemetria.finalizar"
  ],
  OPERADOR: [
    "operador.home", "operador.painel", "operador.minhas_acoes", "operador.tela_acao", "operador.salvar_checklist_lote", "operador.detalhar_checklist_execucao", "operador.validar_finalizacao_acao",
    "operador.validar_resposta_checklist_item",
    "operador.listar_checklist_execucao",
    "sistema.warmup",
    "operador.contexto_qr", "operador.contexto_qr_fast", "operador.iniciar_acao", "operador.salvar_checklist_item", "operador.finalizar_acao", "operador.registrar_evidencia", "operador.registrar_material", "operador.registrar_parametro",
    "lock.status", "lock.adquirir", "lock.heartbeat", "lock.liberar",
    "telemetria.iniciar", "telemetria.evento", "telemetria.finalizar"
  ]
};
