function doGet(e){ return handle_("GET", e); }
function doPost(e){ return handle_("POST", e); }

function handle_(method, e){
  DB_CACHE = {};
  var started = Date.now();

  try{
    var req = parseReq_(method, e);
    if(!req.action) err_("ACTION_REQUIRED","Parâmetro action é obrigatório.",400);

    var payload = req.payload || {};
    if(PUBLIC_ACTIONS.indexOf(req.action) < 0){
      payload.__auth = authorize_(req.action, payload.token || req.params.token);
    }

    var data = route_(req.action, payload, req);
    return jsonOut_({ok:true, action:req.action, elapsed_ms:Date.now()-started, data:data});
  } catch(e){
    var er = normErr_(e);
    return jsonOut_({ok:false, status:er.status, error:{code:er.code, message:er.message}});
  }
}

function parseReq_(method, e){
  var params = e && e.parameter ? e.parameter : {};
  var body = {};
  if(method === "POST" && e && e.postData && e.postData.contents){
    try{ body = JSON.parse(e.postData.contents); } catch(x){ err_("INVALID_JSON","Body não é JSON válido.",400); }
  }
  var action = body.action || params.action || "";
  var payload = body.payload || {};
  if(method === "GET"){
    payload = Object.assign({}, params);
    delete payload.action;
  }
  return {method:method, action:action, payload:payload, params:params};
}

function route_(action, p, req){
  switch(action){
    case "sistema.health": return sistemaHealth_();
    case "sistema.bootstrap": return sistemaBootstrap_();
    case "sistema.warmup": return sistemaWarmup_(p);
    case "cmms.operador_visual_schema_upgrade": return cmmsOperadorTelaRealSchemaUpgrade112_(p, p.__auth);
    case "cmms.tela_operador_schema_upgrade": return cmmsOperadorTelaRealSchemaUpgrade112_(p, p.__auth);
    case "cmms.operador_ui_schema_upgrade": return cmmsOperadorTelaRealSchemaUpgrade112_(p, p.__auth);
    case "cmms.operacional_ui_schema_upgrade": return cmmsOperadorTelaRealSchemaUpgrade112_(p, p.__auth);
    case "cmms.contrato_frontend_schema_upgrade": return cmmsOperadorTelaRealSchemaUpgrade112_(p, p.__auth);
    case "cmms.frontend_contract_schema_upgrade": return cmmsOperadorTelaRealSchemaUpgrade112_(p, p.__auth);
    case "cmms.execucao_checklist_schema_upgrade": return cmmsExecucaoChecklistSchemaUpgrade1083_(p, p.__auth);
    case "cmms.auditoria_operador_schema_upgrade": return cmmsAuditoriaOperadorSchemaUpgrade1081_(p, p.__auth);
    case "cmms.paradas_operacionais_schema_upgrade": return cmmsParadasOperacionaisSchemaUpgrade114_(p, p.__auth);
    case "cmms.horimetro_evidencias_schema_upgrade": return cmmsHorimetroEvidenciasSchemaUpgrade116_(p, p.__auth);
    case "auth.login": return authLogin_(p, req);

    case "admin.resumo": return adminResumo_();
    case "admin.resumo_cache": return adminResumoCache_(p);
    case "admin.listar": return adminListar_(p);
    case "admin.obter": return adminObter_(p);
    case "admin.salvar": return adminSalvar_(p);
    case "admin.gerar_qr": return adminGerarQr_(p);
    case "admin.criar_demo": return adminCriarDemo_(p);
    case "admin.recalcular_ativo": return adminRecalcularAtivo_(p);
    case "admin.salvar_modelo_checklist": return adminSalvarModeloChecklist_(p);
    case "admin.enviar_modelo_checklist_validacao": return adminEnviarModeloChecklistValidacao_(p);
    case "admin.detalhe_modelo_checklist": return detalheModeloChecklist_(p);
    case "admin.listar_modelos_checklist": return adminListarModelosChecklist_(p);
    case "admin.modelos_devolvidos": return adminModelosDevolvidos_(p);
    case "admin.corrigir_modelo_checklist": return adminCorrigirModeloChecklist_(p);
    case "admin.criar_revisao_modelo_checklist": return adminCriarRevisaoModeloChecklist_(p);
    case "admin.gerar_acao_teste_checklist": return adminGerarAcaoTesteChecklist108_(p, p.__auth);
    case "admin.corrigir_auditoria_execucao_operador": return adminCorrigirAuditoriaExecucaoOperador1081_(p, p.__auth);
    case "admin.registrar_horimetro_telemetria": return adminRegistrarHorimetroTelemetria116_(p, p.__auth);
    case "admin.reiniciar_contador_servico": return adminReiniciarContadorServico116_(p, p.__auth);

    case "operador.contexto_qr": return operadorContextoQr_(p);
    case "operador.contexto_qr_fast": return operadorContextoQrFast_(p);
    case "operador.historico_qr": return operadorHistoricoQr119_(p);
    case "operador.iniciar_acao": return operadorIniciarAcao_(p);
    case "operador.estado_acao": return operadorEstadoAcao118_(p);
    case "operador.salvar_checklist_item": return operadorSalvarChecklistItem_(p);
    case "operador.finalizar_acao": return operadorFinalizarAcao_(p);
    case "operador.registrar_evidencia": return operadorRegistrarEvidencia_(p);
    case "operador.upload_evidencia_foto": return operadorUploadEvidenciaFoto116_(p, p.__auth);
    case "operador.registrar_material": return operadorRegistrarMaterial_(p);
    case "operador.registrar_parametro": return operadorRegistrarParametro_(p);
    case "operador.parada_ativa": return operadorParadaAtiva114_(p, p.__auth);
    case "operador.iniciar_parada": return operadorIniciarParada114_(p, p.__auth);
    case "operador.finalizar_parada": return operadorFinalizarParada114_(p, p.__auth);
    case "operador.registrar_ocorrencia": return operadorRegistrarOcorrencia114_(p, p.__auth);
    case "operador.listar_checklist_execucao": return operadorListarChecklistExecucao_(p);
    case "operador.home": return operadorHome112_(p, p.__auth);
    case "operador.painel": return operadorHome112_(p, p.__auth);
    case "operador.minhas_acoes": return operadorMinhasAcoes117_(p, p.__auth);
    case "operador.tela_acao": return operadorTelaAcao112_(p, p.__auth);
    case "operador.salvar_checklist_lote": return operadorSalvarChecklistLote112_(p, p.__auth);
    case "operador.detalhar_checklist_execucao": return operadorDetalharChecklistExecucao112_(p, p.__auth);
    case "operador.validar_finalizacao_acao": return operadorValidarFinalizacaoAcao112_(p, p.__auth);

    case "admin.verificar_drive_evidencias": return adminVerificarDriveEvidencias117_(p, p.__auth);

    case "gestor.listar_paradas": return gestorListarParadas114_(p, p.__auth);
    case "gestor.listar_ocorrencias": return gestorListarOcorrencias114_(p, p.__auth);
    case "gestor.listar_acoes": return gestorListarAcoes_(p);
    case "gestor.detalhe_acao": return gestorDetalheAcao_(p);
    case "gestor.detalhe_acao_fast": return gestorDetalheAcaoFast_(p);
    case "gestor.auditoria_execucao_checklist": return gestorAuditoriaExecucaoChecklist112_(p, p.__auth);
    case "gestor.validar_acao": return gestorValidarAcao1083_(p);
    case "gestor.configurar_sessoes": return gestorConfigurarSessoes_(p);
    case "gestor.adicionar_colaborador": return gestorAdicionarColaborador_(p);
    case "gestor.liberar_locks": return gestorLiberarLocks_(p);
    case "gestor.modelos_em_validacao": return gestorModelosEmValidacao_(p);
    case "gestor.listar_modelos_checklist": return gestorListarModelosChecklist_(p);
    case "gestor.detalhe_modelo_checklist": return detalheModeloChecklist_(p);
    case "gestor.validar_modelo_checklist": return gestorValidarModeloChecklist_(p);

    case "lock.status": return lockStatus_(p);
    case "lock.adquirir": return lockAdquirir_(p);
    case "lock.heartbeat": return lockHeartbeat_(p);
    case "lock.liberar": return lockLiberar_(p);

    case "catalogo.checklist_tipos": return adminListarTiposItemChecklist107_(p, p.__auth);
    case "admin.listar_tipos_item_checklist": return adminListarTiposItemChecklist107_(p, p.__auth);
    case "admin.listar_regras_checklist": return adminListarRegrasChecklist107_(p, p.__auth);
    case "admin.validar_catalogo_item_checklist": return adminValidarCatalogoItemChecklist107_(p, p.__auth);
    case "admin.salvar_item_modelo_checklist": return adminSalvarItemModeloChecklist107_(p, p.__auth);
    case "admin.remover_item_modelo_checklist": return adminRemoverItemModeloChecklist107_(p, p.__auth);
    case "admin.reordenar_itens_modelo_checklist": return adminReordenarItensModeloChecklist107_(p, p.__auth);
    case "admin.clonar_item_modelo_checklist": return adminClonarItemModeloChecklist107_(p, p.__auth);
    case "admin.listar_itens_modelo_checklist": return adminListarItensModeloChecklist107_(p, p.__auth);
    case "admin.detalhar_modelo_checklist_catalogo": return adminDetalharModeloChecklistCatalogo107_(p, p.__auth);
    case "operador.validar_resposta_checklist_item": return operadorValidarRespostaChecklistItem107_(p, p.__auth);
    case "cmms.catalogo_checklist_schema_upgrade": return cmmsCatalogoChecklistSchemaUpgrade107_(p, p.__auth);

    case "cmms.schema_upgrade": return cmmsSchemaUpgrade_(p);
    case "cmms.motor_recalcular": return cmmsMotorRecalcular_(p);
    case "cmms.kpis_base": return cmmsKpisBase_(p);
    case "perf.cache_status": return perfCacheStatus_(p);
    case "perf.cache_clear": return perfCacheClear_(p);
    case "cmms.diagnostico": return cmmsDiagnostico_(p);
    case "cmms.higiene_diagnosticar": return cmmsHigieneDiagnosticar_(p);
    case "cmms.higienizar_status": return cmmsHigienizarStatus_(p);
    case "cmms.higienizar_duplicidades": return cmmsHigienizarDuplicidades_(p);
    case "cmms.higienizar_base": return cmmsHigienizarBase_(p);

    case "telemetria.iniciar": return telemetriaIniciar_(p);
    case "telemetria.evento": return telemetriaEvento_(p);
    case "telemetria.finalizar": return telemetriaFinalizar_(p);

    default: err_("UNKNOWN_ACTION","Action não reconhecida: "+action,400);
  }
}

function sistemaHealth_(){
  return Object.assign(
    {ok:true, app:FAB.APP_NAME, version:FAB.VERSION},
    releaseVersionInfo_(),
    {spreadsheetId:getSpreadsheet_().getId(), serverTime:now_()}
  );
}

function sistemaBootstrap_(){
  return Object.assign({
    app:FAB.APP_NAME,
    version:FAB.VERSION,
    spreadsheetId:getSpreadsheet_().getId(),
    serverTime:now_(),
    sheets:Object.keys(SH),
    endpoints:[
      "auth.login","sistema.warmup","cmms.schema_upgrade","cmms.paradas_operacionais_schema_upgrade","cmms.horimetro_evidencias_schema_upgrade","cmms.catalogo_checklist_schema_upgrade","cmms.operador_visual_schema_upgrade","cmms.tela_operador_schema_upgrade","cmms.operador_ui_schema_upgrade","cmms.operacional_ui_schema_upgrade","cmms.contrato_frontend_schema_upgrade","cmms.frontend_contract_schema_upgrade","cmms.execucao_checklist_schema_upgrade","cmms.auditoria_operador_schema_upgrade","admin.resumo","admin.resumo_cache","admin.listar","admin.salvar","admin.gerar_qr","admin.criar_demo","admin.recalcular_ativo",
      "admin.salvar_modelo_checklist","admin.registrar_horimetro_telemetria","admin.reiniciar_contador_servico","admin.verificar_drive_evidencias","admin.gerar_acao_teste_checklist","admin.corrigir_auditoria_execucao_operador","admin.enviar_modelo_checklist_validacao","admin.detalhe_modelo_checklist","admin.listar_modelos_checklist","admin.modelos_devolvidos","admin.corrigir_modelo_checklist","admin.criar_revisao_modelo_checklist",
      "operador.home","operador.painel","operador.minhas_acoes","operador.tela_acao","operador.estado_acao","operador.salvar_checklist_lote","operador.contexto_qr_fast","operador.contexto_qr","operador.historico_qr","operador.parada_ativa","operador.iniciar_parada","operador.finalizar_parada","operador.registrar_ocorrencia","operador.iniciar_acao","operador.listar_checklist_execucao","operador.detalhar_checklist_execucao","operador.validar_finalizacao_acao","operador.salvar_checklist_item","operador.registrar_evidencia","operador.upload_evidencia_foto","operador.finalizar_acao",
      "gestor.auditoria_execucao_checklist","gestor.listar_paradas","gestor.listar_ocorrencias","gestor.modelos_em_validacao","gestor.listar_modelos_checklist","gestor.detalhe_modelo_checklist","gestor.validar_modelo_checklist","gestor.listar_acoes","gestor.detalhe_acao_fast","gestor.detalhe_acao","gestor.validar_acao",
      "cmms.higiene_diagnosticar","cmms.higienizar_status","cmms.higienizar_duplicidades","cmms.higienizar_base","cmms.kpis_base","perf.cache_status","perf.cache_clear"
    ]
  }, releaseVersionInfo_());
}

function authLogin_(p, req){
  req_(p, ["email","pin"]);
  var email = clean_(p.email).toLowerCase();
  var user = rows_("usuarios").find(function(u){ return clean_(u.email).toLowerCase() === email; });
  if(!user || clean_(user.pin_hash) !== hashPin_(p.pin)) err_("LOGIN_INVALID","Usuário ou PIN inválido.",401);
  if(upper_(user.status) !== ST.ATIVO) err_("USER_INACTIVE","Usuário inativo.",403);

  var token = "FAB-" + Utilities.getUuid().replace(/-/g,"").toUpperCase();
  var exp = addHours_(new Date(), FAB.TOKEN_HOURS);

  append_("sessoes", fit_("sessoes", {
    token:token,
    usuario_id:user.id,
    perfil:upper_(user.perfil),
    status:ST.ATIVO,
    criado_em:now_(),
    expira_em:iso_(exp),
    ultimo_uso_em:now_(),
    user_agent:p.user_agent || ""
  }));

  var authData = {
    token:token,
    usuario_id:user.id,
    nome:user.nome,
    email:user.email,
    perfil:upper_(user.perfil),
    expira_em:iso_(exp),
    expira_ms:exp.getTime()
  };
  cacheAuthSession_(authData);

  return {
    token:token,
    expira_em:iso_(exp),
    usuario:{id:user.id, nome:user.nome, email:user.email, perfil:upper_(user.perfil)},
    warmup_required:true,
    warmup_action:"sistema.warmup"
  };
}

function authorize_(action, token){
  if(!token) err_("TOKEN_REQUIRED","Token obrigatório para ação: "+action,401);

  var cached = getCachedAuthSession_(token);
  if(cached){
    ensurePermission_(cached.perfil, action);
    return {
      token:token,
      usuario_id:cached.usuario_id,
      nome:cached.nome,
      email:cached.email,
      perfil:cached.perfil
    };
  }

  var sess = find_("sessoes","token",token);

  // Compatibilidade com banco antigo.
  if(!sess && sheetExists_("tokens_sessao")){
    sess = rows_("tokens_sessao").find(function(s){ return String(s.token) === String(token); }) || null;
  }

  if(!sess) err_("TOKEN_INVALID","Sessão inválida. Faça login novamente.",401);
  if(upper_(sess.status) !== ST.ATIVO) err_("TOKEN_INACTIVE","Sessão inativa.",401);
  if(new Date(sess.expira_em).getTime() < Date.now()) err_("TOKEN_EXPIRED","Sessão expirada. Faça login novamente.",401);

  var user = find_("usuarios","id",sess.usuario_id);
  if(!user || upper_(user.status) !== ST.ATIVO) err_("USER_INACTIVE","Usuário inativo.",403);

  var perfil = upper_(user.perfil || sess.perfil);
  ensurePermission_(perfil, action);

  var auth = {token:token, usuario_id:user.id, nome:user.nome, email:user.email, perfil:perfil, expira_em:sess.expira_em};
  cacheAuthSession_(auth);

  // Não atualiza ultimo_uso_em a cada requisição. Isso gerava escrita, invalidava cache e pesava o Apps Script.
  // O toque é feito só quando o token cai fora do cache.
  if(sess.__rowIndex && sheetExists_("sessoes")) update_("sessoes", sess.__rowIndex, {ultimo_uso_em:now_()});

  return {token:token, usuario_id:user.id, nome:user.nome, email:user.email, perfil:perfil};
}

function sheetExists_(name){
  return !!getSpreadsheet_().getSheetByName(name);
}
