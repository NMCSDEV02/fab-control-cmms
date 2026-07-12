function cmmsMotorRecalcular_(p){
  var alvo = clean_(p.ativo_id);
  var ativos = alvo ? rows_("ativos").filter(function(a){ return String(a.id) === alvo; }) : rows_("ativos");
  var criadas = [];

  ativos.forEach(function(ativo){
    rows_("planos_manutencao").filter(function(pl){
      return String(pl.ativo_id) === String(ativo.id) && isPlanoOperacional_(pl);
    }).forEach(function(plano){
      ensureDefaultPlanoItem_(plano);

      var decision = shouldGenerate_(ativo, plano);
      if(!decision.generate) return;

      var open = findOpenActionForPlan_(plano.id);
      if(open) return;

      var os = createOs_(ativo, plano);
      var acao = createAction_(ativo, plano, os.id, decision);
      updatePlanoControleAfterGenerate_(plano, decision.current, decision.nextAfter, acao);
      criadas.push(acao);

      hist_({ativo_id:acao.ativo_id, componente_id:acao.componente_id, os_id:os.id, acao_id:acao.id, evento:"ACAO_GERADA_MOTOR", descricao:"Ação gerada: "+acao.titulo, usuario_id:"SISTEMA", perfil:ROLE.SISTEMA});
    });
  });

  return {recalculated:true, ativos_processados:ativos.length, acoes_criadas:criadas.length, novas_acoes:criadas.map(strip_)};
}

function shouldGenerate_(ativo, plano){
  var tipo = upper_(plano.gatilho_tipo);
  var gat = num_(plano.gatilho_valor,0);
  if(gat <= 0) return {generate:false, reason:"gatilho_invalido"};

  if(tipo === "HORAS"){
    var comp = plano.componente_id ? find_("componentes","id",plano.componente_id) : null;
    var current = comp ? num_(comp.horas_acumuladas,0) : num_(ativo.horimetro_atual,0);
    var ctl = getPlanoControle_(plano);
    var nextTarget = num_(ctl.proximo_valor_gatilho, 0) || gat;

    if(current < nextTarget * FAB.MOTOR_THRESHOLD_RATIO) return {generate:false, reason:"abaixo_threshold", current:current, nextTarget:nextTarget};

    if(num_(ctl.ultimo_valor_processado,0) >= current && clean_(ctl.ultima_acao_id)) return {generate:false, reason:"ciclo_ja_processado", current:current};

    return {generate:true, current:current, target:nextTarget, nextAfter:nextTarget + gat};
  }

  if(tipo === "DIAS"){
    var ctlD = getPlanoControle_(plano);
    var last = ctlD.atualizado_em ? new Date(ctlD.atualizado_em).getTime() : 0;
    var days = last ? (Date.now()-last)/86400000 : 99999;
    if(days < gat) return {generate:false, reason:"dias_nao_atingido"};
    return {generate:true, current:days, target:gat, nextAfter:gat};
  }

  if(tipo === "PARAMETRO"){
    var params = rows_("parametros").filter(function(x){ return String(x.ativo_id)===String(plano.ativo_id) && (!plano.componente_id || String(x.componente_id)===String(plano.componente_id)); }).sort(sortByDateDesc_("registrado_em"));
    var lastP = params[0];
    if(!lastP || num_(lastP.valor,0) < gat) return {generate:false, reason:"parametro_nao_atingido"};
    var ctlP = getPlanoControle_(plano);
    if(String(ctlP.ultima_acao_id||"") && num_(ctlP.ultimo_valor_processado,0) >= num_(lastP.valor,0)) return {generate:false, reason:"parametro_ja_processado"};
    return {generate:true, current:num_(lastP.valor,0), target:gat, nextAfter:gat};
  }

  return {generate:false, reason:"tipo_nao_suportado"};
}

function getPlanoControle_(plano){
  var ctl = find_("plano_controle","plano_id",plano.id);
  if(ctl) return ctl;

  var initialTarget = upper_(plano.gatilho_tipo) === "HORAS" ? num_(plano.gatilho_valor,0) : num_(plano.gatilho_valor,0);
  var row = fit_("plano_controle", {
    plano_id:plano.id,
    ativo_id:plano.ativo_id,
    componente_id:plano.componente_id || "",
    gatilho_tipo:upper_(plano.gatilho_tipo),
    gatilho_valor:num_(plano.gatilho_valor,0),
    ultimo_valor_processado:0,
    proximo_valor_gatilho:initialTarget,
    ultima_acao_id:"",
    ultima_acao_status:"",
    atualizado_em:now_()
  });
  append_("plano_controle", row);
  return row;
}

function updatePlanoControleAfterGenerate_(plano, current, nextAfter, acao){
  var ctl = getPlanoControle_(plano);
  update_("plano_controle", ctl.__rowIndex, {
    ultimo_valor_processado:current,
    proximo_valor_gatilho:nextAfter,
    ultima_acao_id:acao.id,
    ultima_acao_status:acao.status,
    atualizado_em:now_()
  });
  var old = find_("planos_manutencao","id",plano.id);
  if(old) update_("planos_manutencao", old.__rowIndex, {ultimo_disparo_em:now_(), atualizado_em:now_()});
}

function refreshPlanoControleStatus_(acao){
  if(!acao || !acao.plano_id) return;
  var ctl = find_("plano_controle","plano_id",acao.plano_id);
  if(ctl && String(ctl.ultima_acao_id) === String(acao.id)){
    update_("plano_controle", ctl.__rowIndex, {ultima_acao_status:acao.status, atualizado_em:now_()});
  }
}

function findOpenActionForPlan_(planoId){
  return rows_("os_acoes").find(function(a){ return String(a.plano_id) === String(planoId) && acaoAberta_(a); }) || null;
}

function createOs_(ativo, plano){
  var row = fit_("ordens_servico", {
    id:uuid_("OS"),
    codigo:"OS-"+Utilities.formatDate(new Date(), FAB.TZ, "yyyyMMdd-HHmmss"),
    ativo_id:ativo.id,
    componente_id:plano.componente_id||"",
    origem:"MOTOR",
    tipo:plano.tipo,
    titulo:plano.nome,
    descricao:"OS automática do plano "+plano.nome,
    prioridade:plano.criticidade || "MEDIA",
    status:ST.ABERTA,
    solicitante_id:"SISTEMA",
    responsavel_id:"",
    aberta_em:now_(),
    planejada_para:"",
    iniciada_em:"",
    finalizada_em:"",
    criado_em:now_(),
    atualizado_em:now_()
  });
  append_("ordens_servico", row);
  return row;
}

function createAction_(ativo, plano, osId, decision){
  var desc = upper_(plano.gatilho_tipo) === "HORAS"
    ? "Gatilho HORAS: "+decision.target+" "+(plano.unidade||"h")
    : "Gatilho "+upper_(plano.gatilho_tipo)+": "+decision.target+" "+(plano.unidade||"");

  var row = fit_("os_acoes", {
    id:uuid_("ACT"),
    os_id:osId,
    ativo_id:ativo.id,
    componente_id:plano.componente_id||"",
    plano_id:plano.id,
    origem:"MOTOR",
    tipo:plano.tipo,
    titulo:plano.nome,
    descricao:desc,
    prioridade:plano.criticidade || "MEDIA",
    modo_parada_manutencao:normalizaModoParadaManutencao115_(
      plano.modo_parada_manutencao
    ),
    status:ST.PENDENTE,
    responsavel_id:"",
    gerado_em:now_(),
    iniciado_em:"",
    finalizado_em:"",
    atualizado_em:now_()
  });
  append_("os_acoes", row);
  return row;
}

function ensureDefaultPlanoItem_(plano){
  var itens = rows_("plano_itens").filter(function(i){ return String(i.plano_id) === String(plano.id); });
  if(itens.length) return;

  append_("plano_itens", fit_("plano_itens", {
    id:eid_("PIT", plano.id+"-1-EXECUCAO"),
    plano_id:plano.id,
    ordem:1,
    titulo:"Executar procedimento técnico",
    instrucao:plano.nome + ". Registrar condição encontrada e justificar qualquer anomalia.",
    tipo_resposta:"OK_NOK",
    obrigatorio:"SIM",
    evidencia_obrigatoria:bool_(plano.requer_evidencia) ? "SIM" : "NAO",
    foto_referencia_url:"",
    limite_min:"",
    limite_max:"",
    unidade:plano.unidade || "",
    criado_em:now_(),
    atualizado_em:now_()
  }));
}

function operadorContextoQr_(p){
  req_(p,["qr_payload"]);
  var qr = clean_(p.qr_payload);

  var ctx = resolveQr_(qr);
  if(!ctx.found){
    return {found:false, tipo_contexto:"NAO_ENCONTRADO", mensagem_operador:"QR/TAG não encontrado.", ativo:null, componente:null, componentes:[], acoes_pendentes:[], proxima_acao:null, historico_recente:[], parametros_recentes:[], parametros_atuais:[], parada_ativa:null, ocorrencias_abertas:[], saude:null};
  }

  cmmsMotorRecalcular_({ativo_id:ctx.ativo.id, __auth:p.__auth});

  // Releitura após motor.
  DB_CACHE["os_acoes"] = null;
  var acoes = rows_("os_acoes").filter(function(a){
    return String(a.ativo_id) === String(ctx.ativo.id) &&
      (!ctx.componente || String(a.componente_id) === String(ctx.componente.id)) &&
      acaoAberta_(a);
  }).sort(function(a,b){ return priorityScore_(b.prioridade)-priorityScore_(a.prioridade) || String(a.gerado_em).localeCompare(String(b.gerado_em)); });

  var comps = rows_("componentes").filter(function(c){ return String(c.ativo_id) === String(ctx.ativo.id) && isValidComponent_(c); }).map(strip_);
  var hist = rows_("historico").filter(function(h){
    return String(h.ativo_id) === String(ctx.ativo.id) && (!ctx.componente || String(h.componente_id) === String(ctx.componente.id));
  }).sort(sortByDateDesc_("criado_em")).slice(0,20).map(strip_);

  var parametrosRecentes = rows_("parametros").filter(function(r){
    return String(r.ativo_id) === String(ctx.ativo.id) &&
      (!ctx.componente || !clean_(r.componente_id) || String(r.componente_id) === String(ctx.componente.id));
  }).sort(sortByDateDesc_("registrado_em")).slice(0,30).map(strip_);

  var parametrosMapa = {};
  parametrosRecentes.forEach(function(r){
    var chave = String(r.componente_id || "") + "|" + upper_(r.parametro || "");
    if(!parametrosMapa[chave]) parametrosMapa[chave] = r;
  });
  var parametrosAtuais = Object.keys(parametrosMapa).map(function(k){ return parametrosMapa[k]; });

  var saude = saudeAtivo_(ctx.ativo.id);
  var paradaAtiva = typeof paradaAtivaPorAtivo114_ === "function" ? paradaAtivaPorAtivo114_(ctx.ativo.id) : null;
  var ocorrenciasAbertas = (typeof ensureParadasOperacionaisSchema114_ === "function")
    ? rows_("ocorrencias_operacionais", true).filter(function(o){
        return String(o.ativo_id) === String(ctx.ativo.id) &&
          ["FINALIZADA","CANCELADA"].indexOf(upper_(o.status)) < 0;
      }).sort(sortByDateDesc_("criado_em")).slice(0,20).map(strip_)
    : [];

  return {
    found:true,
    tipo_contexto:ctx.tipo,
    ativo:strip_(ctx.ativo),
    componente:ctx.componente ? strip_(ctx.componente) : null,
    componentes:comps,
    acoes_pendentes:acoes.map(enrichAction_),
    proxima_acao:acoes.length ? enrichAction_(acoes[0]) : null,
    historico_recente:hist,
    parametros_recentes:parametrosRecentes,
    parametros_atuais:parametrosAtuais,
    parada_ativa:paradaAtiva ? paradaSerializada114_(paradaAtiva) : null,
    ocorrencias_abertas:ocorrenciasAbertas,
    saude:saude,
    mensagem_operador:acoes.length ? "Existem ações pendentes para este equipamento." : "Equipamento sem ações pendentes."
  };
}

function resolveQr_(qr){
  var atv = rows_("ativos").find(function(a){ return isValidAtivo_(a) && (String(a.qr_payload)===qr || String(a.tag)===qr || String(a.id)===qr); });
  if(atv) return {found:true, tipo:"ATIVO", ativo:atv, componente:null};

  var comp = rows_("componentes").find(function(c){ return isValidComponent_(c) && (String(c.qr_payload)===qr || String(c.tag)===qr || String(c.id)===qr); });
  if(comp){
    var a = find_("ativos","id",comp.ativo_id);
    return {found:!!a, tipo:"COMPONENTE", ativo:a, componente:comp};
  }

  var os = rows_("ordens_servico").find(function(o){ return String(o.codigo)===qr || String(o.id)===qr; });
  if(os){
    var ao = find_("ativos","id",os.ativo_id);
    var co = os.componente_id ? find_("componentes","id",os.componente_id) : null;
    return {found:!!ao, tipo:"OS", ativo:ao, componente:co};
  }
  return {found:false};
}

function isValidAtivo_(a){
  return String(a.id||"").indexOf("ATV-") === 0 && clean_(a.tag) && clean_(a.nome);
}
function isValidComponent_(c){
  return String(c.id||"").indexOf("CMP-ATV-") === 0 && String(c.ativo_id||"").indexOf("ATV-") === 0 && clean_(c.nome);
}

function enrichAction_(a){
  var comp = a.componente_id ? find_("componentes","id",a.componente_id) : null;
  var plano = a.plano_id ? find_("planos_manutencao","id",a.plano_id) : null;
  var out = strip_(a);
  out.componente_nome = comp ? comp.nome : "";
  out.plano = plano ? strip_(plano) : null;
  out.locks_ativos = activeLocks_(a.id).length;
  out.max_sessoes = plano ? Math.max(1,num_(plano.max_sessoes,1)) : 1;
  return out;
}


function requireOperadorAuth1081_(auth, actionName){
  auth = auth || {};
  if(upper_(auth.perfil) !== ROLE.OPERADOR){
    err_("FORBIDDEN_OPERADOR_REQUIRED", "Ação operacional exige token de OPERADOR: "+actionName, 403);
  }
  if(!clean_(auth.usuario_id)) err_("AUTH_USER_REQUIRED", "Token operacional sem usuário vinculado.", 403);
  return auth;
}

function requireExecucaoDoOperador1081_(ex, auth){
  if(!ex) err_("EXECUTION_NOT_FOUND", "Execução não encontrada para validar autoria operacional.", 404);
  var operadorId = clean_(ex.operador_id);
  var usuarioId = clean_(auth.usuario_id);
  if(!operadorId) err_("EXECUTION_OPERATOR_REQUIRED", "Execução sem operador responsável vinculado.", 400);
  if(String(operadorId) !== String(usuarioId)){
    err_("EXECUTION_OWNERSHIP_MISMATCH", "Execução pertence ao operador "+operadorId+". Token informado: "+usuarioId, 403);
  }
}

function latestExecucaoAcao1081_(acaoId){
  var execs = rows_("execucoes").filter(function(e){ return String(e.acao_id) === String(acaoId); }).sort(sortByDateDesc_("criado_em"));
  return execs.length ? execs[0] : null;
}

function operadorIniciarAcao_(p){
  req_(p,["acao_id"]);
  var auth = requireOperadorAuth1081_(p.__auth || {}, "operador.iniciar_acao");
  var acao = find_("os_acoes","id",p.acao_id);
  if(!acao) err_("ACTION_NOT_FOUND","Ação não encontrada.",404);
  if([ST.PENDENTE,ST.EM_EXECUCAO].indexOf(upper_(acao.status)) < 0){
    err_("ACTION_INVALID_STATUS","Ação não pode iniciar. Status atual: "+acao.status,400);
  }

  var open = rows_("execucoes").find(function(e){
    return String(e.acao_id)===String(acao.id) &&
      upper_(e.status) !== ST.FINALIZADA;
  });

  if(open){
    requireExecucaoDoOperador1081_(open, auth);
    criarChecklistExec_(acao, open);

    var existingPolicy = clean_(open.modo_execucao_manutencao)
      ? {
          modo_configurado:modoParadaAcao115_(acao),
          decisao:upper_(open.modo_execucao_manutencao) === "SEM_PARADA"
            ? "SEM_PARADA"
            : "PARAR_EQUIPAMENTO",
          parada_operacional:paradaAtivaPorAtivo114_(acao.ativo_id)
        }
      : resolverDecisaoInicioManutencao115_(acao, p);

    var existingMaintenanceStop = iniciarCondicaoManutencao115_(
      acao,
      open,
      auth,
      existingPolicy
    );

    return {
      started:true,
      already_started:true,
      acao_id:acao.id,
      execucao_id:open.id,
      status:ST.EM_EXECUCAO,
      modo_parada_manutencao:existingPolicy.modo_configurado,
      decisao_parada_manutencao:existingPolicy.decisao,
      modo_execucao_manutencao:existingPolicy.decisao === "SEM_PARADA"
        ? "SEM_PARADA"
        : "COM_PARADA",
      parada_operacional:existingPolicy.parada_operacional
        ? paradaSerializada114_(existingPolicy.parada_operacional)
        : null,
      parada_manutencao:existingMaintenanceStop
    };
  }

  var policy = resolverDecisaoInicioManutencao115_(acao, p);

  var ex = fit_("execucoes", {
    id:uuid_("EXE"),
    acao_id:acao.id,
    os_id:acao.os_id,
    ativo_id:acao.ativo_id,
    componente_id:acao.componente_id,
    operador_id:auth.usuario_id || "",
    resultado:"",
    observacao:"",
    duracao_segundos:0,
    modo_execucao_manutencao:policy.decisao === "SEM_PARADA"
      ? "SEM_PARADA"
      : "COM_PARADA",
    abriu_em:now_(),
    iniciou_em:now_(),
    finalizou_em:"",
    status:ST.EM_EXECUCAO,
    criado_em:now_(),
    atualizado_em:now_()
  });
  append_("execucoes", ex);

  update_("os_acoes", acao.__rowIndex, {
    status:ST.EM_EXECUCAO,
    responsavel_id:auth.usuario_id||"",
    iniciado_em:acao.iniciado_em||now_(),
    modo_parada_manutencao:policy.modo_configurado,
    atualizado_em:now_()
  });

  var os = acao.os_id ? find_("ordens_servico","id",acao.os_id) : null;
  if(os && upper_(os.status) === ST.ABERTA){
    update_("ordens_servico", os.__rowIndex, {
      status:ST.EM_EXECUCAO,
      iniciada_em:now_(),
      atualizado_em:now_()
    });
  }

  criarChecklistExec_(acao, ex);
  var maintenanceStop = iniciarCondicaoManutencao115_(
    acao,
    ex,
    auth,
    policy
  );

  hist_({
    ativo_id:acao.ativo_id,
    componente_id:acao.componente_id,
    os_id:acao.os_id,
    acao_id:acao.id,
    execucao_id:ex.id,
    evento:"ACAO_INICIADA",
    descricao:"Operador iniciou: "+acao.titulo+
      ". Modo: "+(policy.decisao === "SEM_PARADA" ? "SEM_PARADA" : "COM_PARADA"),
    usuario_id:auth.usuario_id||"",
    perfil:auth.perfil||ROLE.OPERADOR
  });

  return {
    started:true,
    acao_id:acao.id,
    execucao_id:ex.id,
    status:ST.EM_EXECUCAO,
    modo_parada_manutencao:policy.modo_configurado,
    decisao_parada_manutencao:policy.decisao,
    modo_execucao_manutencao:policy.decisao === "SEM_PARADA"
      ? "SEM_PARADA"
      : "COM_PARADA",
    parada_operacional:policy.parada_operacional
      ? paradaSerializada114_(policy.parada_operacional)
      : null,
    parada_manutencao:maintenanceStop
  };
}

function keepZero_(v){
  return (v === undefined || v === null) ? "" : v;
}

function criarChecklistExec_(acao, ex){
  var plano = acao.plano_id ? find_("planos_manutencao","id",acao.plano_id) : null;
  if(!plano) err_("PLAN_NOT_FOUND","Ação sem plano técnico vinculado.",404);
  if(!isPlanoOperacional_(plano)) err_("PLANO_NAO_VALIDADO","Plano/checklist ainda não validado pela gestão.",400);

  var itens = rows_("plano_itens").filter(function(i){
    return String(i.plano_id) === String(acao.plano_id) && upper_(i.status || ST.ATIVO) === ST.ATIVO;
  }).sort(function(a,b){ return num_(a.ordem,0)-num_(b.ordem,0); });

  if(!itens.length) err_("CHECKLIST_MODELO_VAZIO","Plano validado não possui itens de checklist.",400);

  itens.forEach(function(i){
    var exists = rows_("checklist_execucao").some(function(c){ return String(c.execucao_id)===String(ex.id) && String(c.plano_item_id)===String(i.id); });
    if(exists) return;
    append_("checklist_execucao", fit_("checklist_execucao", {
      id:uuid_("CHK"),
      execucao_id:ex.id,
      acao_id:acao.id,
      plano_item_id:i.id,
      ordem:i.ordem,
      titulo:i.titulo,
      instrucao:i.instrucao,
      tipo_resposta:normalizaTipoChecklist_(i.tipo_resposta),
      obrigatorio:i.obrigatorio,
      resposta:"",
      observacao:"",
      evidencia_obrigatoria:i.evidencia_obrigatoria,
      status:ST.PENDENTE,
      responsavel_id:ex.operador_id,
      data_hora:"",
      criado_em:now_(),
      atualizado_em:now_(),
      parametro_nome:i.parametro_nome || "",
      valor_esperado:i.valor_esperado || "",
      opcoes_json:i.opcoes_json || "",
      limite_min:keepZero_(i.limite_min),
      limite_max:keepZero_(i.limite_max),
      unidade:i.unidade || "",
      valor_numero:"",
      conforme:"",
      bloqueia_finalizacao:bool_(i.bloqueia_finalizacao) ? "SIM" : "NAO",
      validacao_msg:"",
      evidencias_count:0,
      categoria:i.categoria || ""
    }));
  });
}

function operadorSalvarChecklistItem_(p){
  var auth = requireOperadorAuth1081_(p.__auth || {}, "operador.salvar_checklist_item");
  req_(p,["checklist_execucao_id"]);
  var item = find_("checklist_execucao","id",p.checklist_execucao_id);
  if(!item) err_("CHECKLIST_NOT_FOUND","Item de checklist não encontrado.",404);
  var acao = find_("os_acoes","id",item.acao_id);
  if(!acao) err_("ACTION_NOT_FOUND","Ação vinculada ao checklist não encontrada.",404);
  if([ST.PENDENTE,ST.EM_EXECUCAO].indexOf(upper_(acao.status)) < 0) err_("ACTION_INVALID_STATUS","Checklist não editável. Status da ação: "+acao.status,400);
  var exItem = item.execucao_id ? find_("execucoes","id",item.execucao_id) : latestExecucaoAcao1081_(acao.id);
  requireExecucaoDoOperador1081_(exItem, auth);

  var val = validarRespostaChecklistItem_(item, p);

  update_("checklist_execucao", item.__rowIndex, {
    resposta:val.resposta,
    observacao:clean_(p.observacao),
    status:ST.RESPONDIDO,
    responsavel_id:auth.usuario_id,
    data_hora:now_(),
    atualizado_em:now_(),
    valor_numero:val.valor_numero,
    conforme:val.conforme,
    validacao_msg:val.validacao_msg
  });

  return {saved:true, checklist_execucao_id:item.id, tipo_resposta:upper_(item.tipo_resposta), conforme:val.conforme, validacao_msg:val.validacao_msg};
}

function operadorFinalizarAcao_(p){
  req_(p,["acao_id","resultado"]);
  var auth = requireOperadorAuth1081_(p.__auth || {}, "operador.finalizar_acao");
  var acao = find_("os_acoes","id",p.acao_id);
  if(!acao) err_("ACTION_NOT_FOUND","Ação não encontrada.",404);

  var execs = rows_("execucoes")
    .filter(function(e){ return String(e.acao_id)===String(acao.id); })
    .sort(sortByDateDesc_("criado_em"));
  if(!execs.length) err_("EXECUTION_NOT_FOUND","Execução não encontrada.",404);

  var ex = execs[0];
  requireExecucaoDoOperador1081_(ex, auth);

  // Idempotência: se o back-end concluiu e a resposta de rede se perdeu,
  // o operador pode repetir a chamada sem refazer o checklist.
  if(
    upper_(ex.status) === ST.FINALIZADA &&
    [ST.AGUARDANDO_VALIDACAO,ST.BLOQUEADA,ST.CONCLUIDA].indexOf(
      upper_(acao.status)
    ) >= 0
  ){
    var repairedMaintenanceStop = finalizarCondicaoManutencao115_(
      acao,
      ex,
      auth
    );
    var existingOperationalStop = paradaAtivaPorAtivo114_(acao.ativo_id);
    return {
      finalized:true,
      already_finalized:true,
      acao_id:acao.id,
      execucao_id:ex.id,
      status_acao:acao.status,
      parada_operacional:existingOperationalStop
        ? paradaSerializada114_(existingOperationalStop)
        : null,
      parada_manutencao:repairedMaintenanceStop
    };
  }

  if([ST.PENDENTE,ST.EM_EXECUCAO].indexOf(upper_(acao.status)) < 0){
    err_("ACTION_INVALID_STATUS","Ação não pode finalizar. Status atual: "+acao.status,400);
  }

  validateChecklist_(ex.id);

  if(respostaCritica_(p.resultado) && clean_(p.observacao).length < 5){
    err_("OBS_REQUIRED","Resultado crítico exige observação.",400);
  }

  var novo = upper_(p.resultado) === "OK"
    ? ST.AGUARDANDO_VALIDACAO
    : ST.BLOQUEADA;

  update_("execucoes", ex.__rowIndex, {
    resultado:upper_(p.resultado),
    observacao:clean_(p.observacao),
    duracao_segundos:num_(p.duracao_segundos,0),
    finalizou_em:now_(),
    status:ST.FINALIZADA,
    atualizado_em:now_()
  });
  update_("os_acoes", acao.__rowIndex, {
    status:novo,
    finalizado_em:now_(),
    atualizado_em:now_()
  });
  releaseLocksForAction_(acao.id, "ACAO_FINALIZADA");

  var maintenanceStop = finalizarCondicaoManutencao115_(
    acao,
    ex,
    auth
  );
  var operationalStop = paradaAtivaPorAtivo114_(acao.ativo_id);

  hist_({
    ativo_id:acao.ativo_id,
    componente_id:acao.componente_id,
    os_id:acao.os_id,
    acao_id:acao.id,
    execucao_id:ex.id,
    evento:"ACAO_FINALIZADA_OPERADOR",
    descricao:"Resultado: "+upper_(p.resultado)+". "+clean_(p.observacao),
    usuario_id:auth.usuario_id||"",
    perfil:auth.perfil||ROLE.OPERADOR
  });

  return {
    finalized:true,
    already_finalized:false,
    acao_id:acao.id,
    execucao_id:ex.id,
    status_acao:novo,
    parada_operacional:operationalStop
      ? paradaSerializada114_(operationalStop)
      : null,
    parada_manutencao:maintenanceStop
  };
}

function validateChecklist_(execId){
  if(typeof CMMS1083_validateChecklistExecution_ === "function"){
    var v1083 = CMMS1083_validateChecklistExecution_(execId);
    if(!v1083.can_finalize){
      err_("CHECKLIST_INCOMPLETO", CMMS1083_buildChecklistBlockMessage_(v1083), 400);
    }
    return v1083;
  }

  if(typeof CMMS108_validateChecklistExecution_ === "function"){
    var v108 = CMMS108_validateChecklistExecution_(execId);
    if(!v108.can_finalize){
      if(v108.pendentes.length) err_("CHECKLIST_INCOMPLETO","Existem itens obrigatórios pendentes: "+v108.pendentes.map(function(i){return i.titulo;}).join("; "),400);
      if(v108.evidencias_pendentes.length) err_("EVIDENCIA_OBRIGATORIA","Item obrigatório exige evidência antes da finalização: "+v108.evidencias_pendentes.map(function(i){return i.titulo;}).join("; "),400);
      if(v108.bloqueios.length) err_("CHECKLIST_BLOQUEANTE","Existem itens bloqueantes não conformes: "+v108.bloqueios.map(function(i){return i.titulo;}).join("; "),400);
      err_("CHECKLIST_INVALIDO","Checklist não liberado para finalização.",400);
    }
    return v108;
  }

  var itens = rows_("checklist_execucao").filter(function(c){ return String(c.execucao_id) === String(execId); });
  if(!itens.length) err_("CHECKLIST_VAZIO","Execução não possui checklist gerado.",400);

  var pend = itens.filter(function(i){
    if(upper_(i.tipo_resposta) === "INSTRUCAO") return false;
    return bool_(i.obrigatorio) && !clean_(i.resposta);
  });
  if(pend.length) err_("CHECKLIST_INCOMPLETO","Existem itens obrigatórios pendentes: "+pend.map(function(i){return i.titulo;}).join("; "),400);

  var evs = rows_("evidencias");
  var evPend = itens.filter(function(i){
    if(!bool_(i.evidencia_obrigatoria)) return false;
    return !evs.some(function(e){ return String(e.checklist_execucao_id) === String(i.id); });
  });
  if(evPend.length) err_("EVIDENCIA_OBRIGATORIA","Item obrigatório exige evidência antes da finalização: "+evPend.map(function(i){return i.titulo;}).join("; "),400);

  var bloqueios = itens.filter(function(i){
    return bool_(i.bloqueia_finalizacao) && clean_(i.conforme) === "NAO";
  });
  if(bloqueios.length) err_("CHECKLIST_BLOQUEANTE","Existem itens fora do limite configurado: "+bloqueios.map(function(i){return i.titulo;}).join("; "),400);

  return {ok:true, total:itens.length, pendentes:0, evidencias_pendentes:0, bloqueios:0};
}

function operadorRegistrarEvidencia_(p){
  req_(p,["acao_id","nome_arquivo","url"]);
  var auth = requireOperadorAuth1081_(p.__auth || {}, "operador.registrar_evidencia");
  var acao = find_("os_acoes","id",p.acao_id);
  if(!acao) err_("ACTION_NOT_FOUND","Ação não encontrada.",404);
  if([ST.PENDENTE, ST.EM_EXECUCAO].indexOf(upper_(acao.status)) < 0){
    err_("ACTION_INVALID_STATUS","Evidência não editável. Status da ação: "+acao.status,400);
  }

  var checklistId = clean_(p.checklist_execucao_id);
  var item = checklistId ? find_("checklist_execucao","id",checklistId) : null;
  if(checklistId && !item) err_("CHECKLIST_NOT_FOUND","Item de checklist não encontrado para evidência.",404);
  if(item && String(item.acao_id) !== String(acao.id)) err_("CHECKLIST_ACTION_MISMATCH","Item de checklist não pertence à ação informada.",400);

  var execId = clean_(p.execucao_id);
  var exEv = null;
  if(execId){
    exEv = find_("execucoes","id",execId);
  } else {
    exEv = latestExecucaoAcao1081_(acao.id);
    execId = exEv ? exEv.id : "";
  }
  requireExecucaoDoOperador1081_(exEv, auth);

  var row = fit_("evidencias", {
    id:uuid_("EVD"),
    execucao_id:execId,
    acao_id:acao.id,
    checklist_execucao_id:checklistId,
    ativo_id:acao.ativo_id,
    componente_id:acao.componente_id,
    tipo:upper_(p.tipo||"FOTO"),
    nome_arquivo:clean_(p.nome_arquivo),
    url:clean_(p.url),
    observacao:clean_(p.observacao),
    usuario_id:auth.usuario_id||"",
    criado_em:now_()
  });
  append_("evidencias", row);

  if(item){
    var totalEvs = rows_("evidencias", true).filter(function(e){ return String(e.checklist_execucao_id) === String(item.id); }).length;
    var patch = {evidencias_count:totalEvs, atualizado_em:now_()};
    if(upper_(item.tipo_resposta) === "EVIDENCIA" && !clean_(item.resposta)){
      patch.resposta = "EVIDENCIA_ANEXADA";
      patch.status = ST.RESPONDIDO;
      patch.conforme = "SIM";
      patch.validacao_msg = "Evidência anexada.";
      patch.responsavel_id = auth.usuario_id || item.responsavel_id || "";
      patch.data_hora = now_();
    }
    update_("checklist_execucao", item.__rowIndex, patch);
  }

  return {saved:true, evidencia:row, checklist_execucao_id:checklistId, evidencias_count:item ? totalEvs : ""};
}

function operadorRegistrarMaterial_(p){
  var auth = requireOperadorAuth1081_(p.__auth || {}, "operador.registrar_material");
  req_(p,["acao_id","material_id","quantidade"]);
  var acao = find_("os_acoes","id",p.acao_id);
  if(!acao) err_("ACTION_NOT_FOUND","Ação não encontrada.",404);
  var exMat = clean_(p.execucao_id) ? find_("execucoes","id",p.execucao_id) : latestExecucaoAcao1081_(acao.id);
  requireExecucaoDoOperador1081_(exMat, auth);
  var mat = find_("materiais","id",p.material_id);
  if(!mat) err_("MATERIAL_NOT_FOUND","Material não encontrado.",404);
  var row = fit_("materiais_uso", {id:uuid_("MATU"), execucao_id:exMat.id, acao_id:p.acao_id, material_id:p.material_id, quantidade:num_(p.quantidade,0), unidade:p.unidade||mat.unidade||"", observacao:clean_(p.observacao), usuario_id:auth.usuario_id||"", criado_em:now_()});
  append_("materiais_uso", row);
  return {saved:true, material_uso:row};
}

function operadorRegistrarParametro_(p){
  var auth = requireOperadorAuth1081_(p.__auth || {}, "operador.registrar_parametro");
  req_(p,["ativo_id","parametro","valor"]);
  var ativoParametro = find_("ativos","id",p.ativo_id);
  if(!ativoParametro) err_("ASSET_NOT_FOUND","Equipamento não encontrado para registrar parâmetro.",404);

  var componenteParametro = null;
  if(clean_(p.componente_id)){
    componenteParametro = find_("componentes","id",p.componente_id);
    if(!componenteParametro || String(componenteParametro.ativo_id) !== String(ativoParametro.id)){
      err_("COMPONENT_ASSET_MISMATCH","Componente não pertence ao equipamento informado.",400);
    }
  }

  var row = fit_("parametros", {id:uuid_("PAR"), ativo_id:ativoParametro.id, componente_id:componenteParametro ? componenteParametro.id : "", parametro:upper_(p.parametro), valor:num_(p.valor,0), unidade:clean_(p.unidade), origem:clean_(p.origem||"OPERADOR"), registrado_por:auth.usuario_id||"", registrado_em:now_(), criado_em:now_()});
  append_("parametros", row);

  if(row.parametro === "HORIMETRO"){
    var a = find_("ativos","id",row.ativo_id);
    if(a) update_("ativos", a.__rowIndex, {horimetro_atual:row.valor, atualizado_em:now_()});
    if(row.componente_id){
      var c = find_("componentes","id",row.componente_id);
      if(c) update_("componentes", c.__rowIndex, {horas_acumuladas:row.valor, atualizado_em:now_()});
    }
  }

  var recalc = cmmsMotorRecalcular_({ativo_id:row.ativo_id, __auth:auth});
  return {saved:true, parametro:row, recalculo:recalc};
}

function calcularSaudeAtivoCMMS_(ativoId){
  var acoes = rows_("os_acoes", true).filter(function(a){
    return String(a.ativo_id) === String(ativoId) && acaoAberta_(a);
  });

  var osAbertas = rows_("ordens_servico", true).filter(function(o){
    return String(o.ativo_id) === String(ativoId) && !terminal_(o.status);
  });

  var pct = 100;
  acoes.forEach(function(a){
    var p = upper_(a.prioridade);
    pct -= p === "CRITICA" ? 25 : p === "ALTA" ? 15 : p === "MEDIA" ? 8 : 4;
  });

  pct = Math.max(0, Math.min(100, pct));
  return {
    pct:pct,
    status:pct >= 90 ? "OK" : pct >= 70 ? "ATENCAO" : "CRITICO",
    acoes_abertas:acoes.length,
    os_abertas:osAbertas.length
  };
}

function saudeAtivo_(ativoId){
  return calcularSaudeAtivoCMMS_(ativoId);
}
