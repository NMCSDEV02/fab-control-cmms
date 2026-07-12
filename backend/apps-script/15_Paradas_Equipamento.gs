/**
 * FAB Control 1.1.4
 * Paradas operacionais, ocorrências e vínculo com execução.
 */

function ensureParadasOperacionaisSchema114_(){
  var ss = getSpreadsheet_();
  ensureSheet_(ss, "paradas_equipamento", SH.paradas_equipamento);
  ensureSheet_(ss, "ocorrencias_operacionais", SH.ocorrencias_operacionais);

  var cfg = find_("config", "chave", "parada.tolerancia_retorno_min");
  if(!cfg){
    append_("config", fit_("config", {
      chave:"parada.tolerancia_retorno_min",
      valor:10,
      descricao:"Tolerância em minutos entre fim da manutenção e retorno operacional.",
      atualizado_em:now_()
    }));
  }
}

function cmmsParadasOperacionaisSchemaUpgrade114_(p, auth){
  auth = auth || p.__auth || {};
  if(upper_(auth.perfil) !== ROLE.ADMIN){
    err_("FORBIDDEN_ADMIN_REQUIRED", "Upgrade de paradas exige perfil ADMIN.", 403);
  }

  ensureParadasOperacionaisSchema114_();
  return {
    upgraded:true,
    version:FAB.VERSION,
    sheets:["paradas_equipamento","ocorrencias_operacionais"],
    total_sheets:Object.keys(SH).length,
    tolerance_minutes:paradaToleranciaMin114_()
  };
}

function paradaToleranciaMin114_(){
  ensureParadasOperacionaisSchema114_();
  var cfg = find_("config", "chave", "parada.tolerancia_retorno_min");
  return Math.max(0, num_(cfg && cfg.valor, 10));
}

function paradaStatusAberto114_(status){
  return [
    ST.PARADA_ABERTA,
    ST.MANUTENCAO_EM_EXECUCAO,
    ST.AGUARDANDO_RETORNO_OPERACIONAL
  ].indexOf(upper_(status)) >= 0;
}

function paradaAtivaPorAtivo114_(ativoId){
  ensureParadasOperacionaisSchema114_();
  return rows_("paradas_equipamento", true)
    .filter(function(r){
      return String(r.ativo_id) === String(ativoId) && paradaStatusAberto114_(r.status);
    })
    .sort(sortByDateDesc_("iniciada_em"))[0] || null;
}

function paradaAtivaPorAcao114_(acaoId){
  ensureParadasOperacionaisSchema114_();
  return rows_("paradas_equipamento", true)
    .filter(function(r){
      return String(r.acao_id) === String(acaoId) && paradaStatusAberto114_(r.status);
    })
    .sort(sortByDateDesc_("iniciada_em"))[0] || null;
}

function secondsBetween114_(startValue, endValue){
  if(!clean_(startValue)) return 0;
  var start = new Date(startValue).getTime();
  var end = clean_(endValue) ? new Date(endValue).getTime() : Date.now();
  if(isNaN(start) || isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

function paradaMetricas114_(row, finalTime){
  if(!row) return null;
  var end = finalTime || row.finalizada_em || "";
  var total = secondsBetween114_(row.iniciada_em, end);
  var esperaFim = row.manutencao_iniciada_em || end || "";
  var espera = secondsBetween114_(row.iniciada_em, esperaFim);

  var execucao = 0;
  if(clean_(row.manutencao_iniciada_em)){
    execucao = secondsBetween114_(
      row.manutencao_iniciada_em,
      row.manutencao_finalizada_em || end || ""
    );
  }

  var retorno = 0;
  if(clean_(row.manutencao_finalizada_em)){
    retorno = secondsBetween114_(row.manutencao_finalizada_em, end || "");
  }

  return {
    tempo_parada_segundos:total,
    tempo_espera_manutencao_segundos:espera,
    tempo_execucao_segundos:execucao,
    tempo_retorno_operacional_segundos:retorno
  };
}

function paradaSerializada114_(row){
  if(!row) return null;
  var out = strip_(row);
  var metrics = paradaMetricas114_(row);
  Object.keys(metrics).forEach(function(k){ out[k] = metrics[k]; });
  out.elapsed_seconds = metrics.tempo_parada_segundos;
  out.server_time = now_();
  out.requires_return_confirmation = upper_(row.status) === ST.AGUARDANDO_RETORNO_OPERACIONAL;
  return out;
}

function validarAtivoComponente114_(ativoId, componenteId){
  var ativo = find_("ativos", "id", ativoId);
  if(!ativo) err_("ASSET_NOT_FOUND", "Equipamento não encontrado.", 404);

  var componente = null;
  if(clean_(componenteId)){
    componente = find_("componentes", "id", componenteId);
    if(!componente || String(componente.ativo_id) !== String(ativo.id)){
      err_("COMPONENT_ASSET_MISMATCH", "Componente não pertence ao equipamento.", 400);
    }
  }
  return {ativo:ativo, componente:componente};
}

function atualizarStatusAtivo114_(ativo, status){
  if(!ativo) return;
  update_("ativos", ativo.__rowIndex, {status:status, atualizado_em:now_()});
}

function criarParada114_(input, auth){
  ensureParadasOperacionaisSchema114_();
  var refs = validarAtivoComponente114_(input.ativo_id, input.componente_id);
  var existente = paradaAtivaPorAtivo114_(refs.ativo.id);
  if(existente) return existente;

  var row = fit_("paradas_equipamento", {
    id:uuid_("STP"),
    ativo_id:refs.ativo.id,
    componente_id:refs.componente ? refs.componente.id : "",
    os_id:input.os_id || "",
    acao_id:input.acao_id || "",
    execucao_id:input.execucao_id || "",
    origem:upper_(input.origem || "OPERADOR"),
    tipo:upper_(input.tipo || "NAO_PROGRAMADA"),
    status:ST.PARADA_ABERTA,
    iniciada_em:now_(),
    iniciada_por:auth && auth.usuario_id || "",
    manutencao_iniciada_em:"",
    manutencao_finalizada_em:"",
    finalizada_em:"",
    finalizada_por:"",
    tempo_parada_segundos:0,
    tempo_espera_manutencao_segundos:0,
    tempo_execucao_segundos:0,
    tempo_retorno_operacional_segundos:0,
    motivo_parada:clean_(input.motivo_parada || "Parada registrada pelo operador."),
    categoria_retorno:"",
    justificativa_divergencia:"",
    tolerancia_retorno_min:paradaToleranciaMin114_(),
    criado_em:now_(),
    atualizado_em:now_()
  });

  append_("paradas_equipamento", row);
  atualizarStatusAtivo114_(refs.ativo, ST.PARADO);

  hist_({
    ativo_id:refs.ativo.id,
    componente_id:refs.componente ? refs.componente.id : "",
    os_id:row.os_id,
    acao_id:row.acao_id,
    execucao_id:row.execucao_id,
    evento:"PARADA_INICIADA",
    descricao:row.motivo_parada,
    usuario_id:auth && auth.usuario_id || "",
    perfil:auth && auth.perfil || ROLE.OPERADOR
  });

  return row;
}

function operadorParadaAtiva114_(p, auth){
  ensureParadasOperacionaisSchema114_();
  var ativoId = clean_(p.ativo_id);

  if(!ativoId && clean_(p.acao_id)){
    var acao = find_("os_acoes", "id", p.acao_id);
    if(!acao) err_("ACTION_NOT_FOUND", "Ação não encontrada.", 404);
    ativoId = acao.ativo_id;
  }

  if(!ativoId) err_("FIELD_REQUIRED", "Informe ativo_id ou acao_id.", 400);
  var refs = validarAtivoComponente114_(ativoId, "");
  var row = paradaAtivaPorAtivo114_(refs.ativo.id);

  return {
    found:!!row,
    ativo_id:refs.ativo.id,
    parada_ativa:paradaSerializada114_(row),
    server_time:now_()
  };
}

function operadorIniciarParada114_(p, auth){
  auth = requireOperadorAuth1081_(auth || p.__auth || {}, "operador.iniciar_parada");
  req_(p, ["ativo_id"]);

  var existente = paradaAtivaPorAtivo114_(p.ativo_id);
  if(existente){
    return {started:true, already_open:true, parada:paradaSerializada114_(existente)};
  }

  var row = criarParada114_({
    ativo_id:p.ativo_id,
    componente_id:p.componente_id || "",
    origem:"OPERADOR",
    tipo:p.tipo || "NAO_PROGRAMADA",
    motivo_parada:p.motivo_parada || "Parada operacional iniciada."
  }, auth);

  return {started:true, already_open:false, parada:paradaSerializada114_(row)};
}

function operadorFinalizarParada114_(p, auth){
  auth = requireOperadorAuth1081_(auth || p.__auth || {}, "operador.finalizar_parada");
  ensureParadasOperacionaisSchema114_();

  var row = null;
  if(clean_(p.parada_id)) row = find_("paradas_equipamento", "id", p.parada_id);
  if(!row && clean_(p.ativo_id)) row = paradaAtivaPorAtivo114_(p.ativo_id);
  if(!row) err_("STOP_NOT_FOUND", "Parada ativa não encontrada.", 404);
  if(!paradaStatusAberto114_(row.status)){
    return {closed:true, already_closed:true, parada:paradaSerializada114_(row)};
  }

  var now = now_();
  var metrics = paradaMetricas114_(row, now);
  var tolerance = Math.max(0, num_(row.tolerancia_retorno_min, paradaToleranciaMin114_()));
  var requiresJustification =
    clean_(row.manutencao_finalizada_em) &&
    metrics.tempo_retorno_operacional_segundos > tolerance * 60;

  var category = upper_(p.categoria_retorno);
  var justification = clean_(p.justificativa_divergencia);

  if(requiresJustification && (!category || justification.length < 5)){
    return {
      closed:false,
      requires_justification:true,
      tolerance_minutes:tolerance,
      delay_seconds:metrics.tempo_retorno_operacional_segundos,
      parada:paradaSerializada114_(row),
      categories:[
        "LIMPEZA_AREA",
        "TESTE_PRODUCAO",
        "AJUSTE_PROCESSO",
        "FALTA_MATERIA_PRIMA",
        "AGUARDANDO_QUALIDADE",
        "AGUARDANDO_OPERADOR",
        "OUTRO"
      ]
    };
  }

  update_("paradas_equipamento", row.__rowIndex, {
    status:ST.FINALIZADA,
    finalizada_em:now,
    finalizada_por:auth.usuario_id || "",
    tempo_parada_segundos:metrics.tempo_parada_segundos,
    tempo_espera_manutencao_segundos:metrics.tempo_espera_manutencao_segundos,
    tempo_execucao_segundos:metrics.tempo_execucao_segundos,
    tempo_retorno_operacional_segundos:metrics.tempo_retorno_operacional_segundos,
    categoria_retorno:category,
    justificativa_divergencia:justification,
    atualizado_em:now
  });

  var ativo = find_("ativos", "id", row.ativo_id);
  atualizarStatusAtivo114_(ativo, ST.OPERANDO);

  hist_({
    ativo_id:row.ativo_id,
    componente_id:row.componente_id,
    os_id:row.os_id,
    acao_id:row.acao_id,
    execucao_id:row.execucao_id,
    evento:"PARADA_FINALIZADA",
    descricao:"Equipamento voltou a operar. Tempo total: "+metrics.tempo_parada_segundos+" s. Retorno após manutenção: "+metrics.tempo_retorno_operacional_segundos+" s. "+justification,
    usuario_id:auth.usuario_id || "",
    perfil:auth.perfil || ROLE.OPERADOR
  });

  var updated = find_("paradas_equipamento", "id", row.id);
  return {
    closed:true,
    requires_justification:false,
    parada:paradaSerializada114_(updated),
    metricas:metrics
  };
}

function operadorRegistrarOcorrencia114_(p, auth){
  auth = requireOperadorAuth1081_(auth || p.__auth || {}, "operador.registrar_ocorrencia");
  req_(p, ["ativo_id", "titulo", "descricao"]);
  ensureParadasOperacionaisSchema114_();

  var refs = validarAtivoComponente114_(p.ativo_id, p.componente_id);
  var row = fit_("ocorrencias_operacionais", {
    id:uuid_("OCR"),
    ativo_id:refs.ativo.id,
    componente_id:refs.componente ? refs.componente.id : "",
    tipo:upper_(p.tipo || "OPERACIONAL"),
    titulo:clean_(p.titulo),
    descricao:clean_(p.descricao),
    severidade:upper_(p.severidade || "MEDIA"),
    status:ST.AGUARDANDO_ANALISE,
    usuario_id:auth.usuario_id || "",
    perfil:auth.perfil || ROLE.OPERADOR,
    os_id:"",
    acao_id:"",
    criado_em:now_(),
    atualizado_em:now_()
  });
  append_("ocorrencias_operacionais", row);

  hist_({
    ativo_id:row.ativo_id,
    componente_id:row.componente_id,
    evento:"OCORRENCIA_OPERACIONAL_REGISTRADA",
    descricao:row.titulo+". "+row.descricao,
    usuario_id:auth.usuario_id || "",
    perfil:auth.perfil || ROLE.OPERADOR
  });

  return {saved:true, occurrence:strip_(row), notified_profiles:[ROLE.ADMIN, ROLE.GESTOR]};
}

function paradaVincularInicioManutencao114_(acao, ex, auth){
  if(!acao || !ex) return null;
  ensureParadasOperacionaisSchema114_();

  var row = paradaAtivaPorAtivo114_(acao.ativo_id);
  if(row && upper_(row.status) === ST.MANUTENCAO_EM_EXECUCAO &&
     clean_(row.acao_id) && String(row.acao_id) !== String(acao.id)){
    err_("ASSET_MAINTENANCE_ALREADY_RUNNING", "Equipamento já possui manutenção em execução.", 409);
  }

  if(!row){
    row = criarParada114_({
      ativo_id:acao.ativo_id,
      componente_id:acao.componente_id,
      os_id:acao.os_id,
      acao_id:acao.id,
      execucao_id:ex.id,
      origem:"MANUTENCAO",
      tipo:"TECNICA",
      motivo_parada:"Parada técnica iniciada automaticamente com a execução."
    }, auth);
  }

  update_("paradas_equipamento", row.__rowIndex, {
    componente_id:row.componente_id || acao.componente_id || "",
    os_id:acao.os_id || row.os_id || "",
    acao_id:acao.id,
    execucao_id:ex.id,
    status:ST.MANUTENCAO_EM_EXECUCAO,
    manutencao_iniciada_em:row.manutencao_iniciada_em || now_(),
    atualizado_em:now_()
  });

  var ativo = find_("ativos", "id", acao.ativo_id);
  atualizarStatusAtivo114_(ativo, ST.PARADO);

  return paradaSerializada114_(find_("paradas_equipamento", "id", row.id));
}

function paradaRegistrarFimManutencao114_(acao, ex, auth){
  if(!acao || !ex) return null;
  ensureParadasOperacionaisSchema114_();

  var row = paradaAtivaPorAcao114_(acao.id) || paradaAtivaPorAtivo114_(acao.ativo_id);
  if(!row) return null;

  update_("paradas_equipamento", row.__rowIndex, {
    os_id:acao.os_id || row.os_id || "",
    acao_id:acao.id,
    execucao_id:ex.id,
    status:ST.AGUARDANDO_RETORNO_OPERACIONAL,
    manutencao_iniciada_em:row.manutencao_iniciada_em || ex.iniciou_em || acao.iniciado_em || "",
    manutencao_finalizada_em:now_(),
    atualizado_em:now_()
  });

  var ativo = find_("ativos", "id", acao.ativo_id);
  atualizarStatusAtivo114_(ativo, ST.PARADO);

  hist_({
    ativo_id:acao.ativo_id,
    componente_id:acao.componente_id,
    os_id:acao.os_id,
    acao_id:acao.id,
    execucao_id:ex.id,
    evento:"MANUTENCAO_FINALIZADA_AGUARDANDO_RETORNO",
    descricao:"Manutenção finalizada. Equipamento permanece parado até confirmação da produção.",
    usuario_id:auth && auth.usuario_id || "",
    perfil:auth && auth.perfil || ROLE.OPERADOR
  });

  return paradaSerializada114_(find_("paradas_equipamento", "id", row.id));
}

function gestorListarParadas114_(p, auth){
  ensureParadasOperacionaisSchema114_();
  var status = upper_(p.status);
  var ativoId = clean_(p.ativo_id);
  var lista = rows_("paradas_equipamento", true).filter(function(r){
    return (!status || upper_(r.status) === status) &&
      (!ativoId || String(r.ativo_id) === String(ativoId));
  }).sort(sortByDateDesc_("iniciada_em"));

  return {
    total:lista.length,
    paradas:lista.slice(0, Math.max(1, Math.min(200, num_(p.limite, 100)))).map(paradaSerializada114_)
  };
}

function gestorListarOcorrencias114_(p, auth){
  ensureParadasOperacionaisSchema114_();
  var status = upper_(p.status);
  var ativoId = clean_(p.ativo_id);
  var lista = rows_("ocorrencias_operacionais", true).filter(function(r){
    return (!status || upper_(r.status) === status) &&
      (!ativoId || String(r.ativo_id) === String(ativoId));
  }).sort(sortByDateDesc_("criado_em"));

  return {
    total:lista.length,
    ocorrencias:lista.slice(0, Math.max(1, Math.min(200, num_(p.limite, 100)))).map(strip_)
  };
}
