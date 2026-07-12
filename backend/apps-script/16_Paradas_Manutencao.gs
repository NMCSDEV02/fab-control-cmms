/**
 * FAB Control 1.1.5
 * Parada técnica de manutenção separada da parada operacional da produção.
 */

function normalizaModoParadaManutencao115_(value){
  var mode = upper_(value || "DECISAO_EXECUTOR");
  if(["OBRIGATORIA","DECISAO_EXECUTOR","SEM_PARADA"].indexOf(mode) < 0){
    return "DECISAO_EXECUTOR";
  }
  return mode;
}

function modoParadaAcao115_(acao){
  if(!acao) return "DECISAO_EXECUTOR";
  var direct = normalizaModoParadaManutencao115_(acao.modo_parada_manutencao);
  if(clean_(acao.modo_parada_manutencao)) return direct;

  var plano = clean_(acao.plano_id) ? find_("planos_manutencao","id",acao.plano_id) : null;
  return normalizaModoParadaManutencao115_(plano && plano.modo_parada_manutencao);
}

function normalizaDecisaoParada115_(value){
  var decision = upper_(value);
  if(decision === "PARAR" || decision === "COM_PARADA") return "PARAR_EQUIPAMENTO";
  if(decision === "SEM_PARADA") return "SEM_PARADA";
  if(decision === "PARAR_EQUIPAMENTO") return decision;
  return "";
}

function resolverDecisaoInicioManutencao115_(acao, p){
  var configured = modoParadaAcao115_(acao);
  var operationalStop = typeof paradaAtivaPorAtivo114_ === "function"
    ? paradaAtivaPorAtivo114_(acao.ativo_id)
    : null;

  if(configured === "OBRIGATORIA"){
    return {
      modo_configurado:configured,
      decisao:"PARAR_EQUIPAMENTO",
      parada_operacional:operationalStop
    };
  }

  if(configured === "SEM_PARADA"){
    return {
      modo_configurado:configured,
      decisao:"SEM_PARADA",
      parada_operacional:operationalStop
    };
  }

  // Se a produção já informou uma parada, a manutenção apenas registra
  // que executou com o equipamento parado. A parada operacional continua independente.
  if(operationalStop){
    return {
      modo_configurado:configured,
      decisao:"PARAR_EQUIPAMENTO",
      parada_operacional:operationalStop
    };
  }

  var decision = normalizaDecisaoParada115_(p && p.decisao_parada_manutencao);
  if(!decision){
    err_(
      "MAINTENANCE_STOP_DECISION_REQUIRED",
      "Escolha PARAR_EQUIPAMENTO ou SEM_PARADA antes de iniciar a execução.",
      400
    );
  }

  return {
    modo_configurado:configured,
    decisao:decision,
    parada_operacional:null
  };
}

function paradaManutencaoAtivaPorAcao115_(acaoId){
  ensureParadasOperacionaisSchema114_();
  return rows_("paradas_manutencao", true)
    .filter(function(r){
      return String(r.acao_id) === String(acaoId) &&
        upper_(r.status) === ST.EM_EXECUCAO;
    })
    .sort(sortByDateDesc_("iniciada_em"))[0] || null;
}

function paradaManutencaoAtivaPorAtivo115_(ativoId){
  ensureParadasOperacionaisSchema114_();
  return rows_("paradas_manutencao", true)
    .filter(function(r){
      return String(r.ativo_id) === String(ativoId) &&
        upper_(r.status) === ST.EM_EXECUCAO &&
        upper_(r.decisao_execucao) === "COM_PARADA";
    })
    .sort(sortByDateDesc_("iniciada_em"))[0] || null;
}

function paradaManutencaoSerializada115_(row){
  if(!row) return null;
  var out = strip_(row);
  out.duracao_segundos = clean_(row.finalizada_em)
    ? num_(row.duracao_segundos,0)
    : secondsBetween114_(row.iniciada_em, "");
  out.equipamento_ja_parado = bool_(row.equipamento_ja_parado);
  out.alterou_status_ativo = bool_(row.alterou_status_ativo);
  return out;
}

function iniciarCondicaoManutencao115_(acao, ex, auth, policy){
  ensureParadasOperacionaisSchema114_();

  var executionRow = find_("execucoes","id",ex.id) || ex;
  var existing = paradaManutencaoAtivaPorAcao115_(acao.id);

  if(existing){
    if(executionRow.__rowIndex){
      update_("execucoes", executionRow.__rowIndex, {
        modo_execucao_manutencao:upper_(existing.decisao_execucao),
        atualizado_em:now_()
      });
    }
    return paradaManutencaoSerializada115_(existing);
  }

  if(policy.decisao === "SEM_PARADA"){
    if(executionRow.__rowIndex){
      update_("execucoes", executionRow.__rowIndex, {
        modo_execucao_manutencao:"SEM_PARADA",
        atualizado_em:now_()
      });
    }

    hist_({
      ativo_id:acao.ativo_id,
      componente_id:acao.componente_id,
      os_id:acao.os_id,
      acao_id:acao.id,
      execucao_id:ex.id,
      evento:"MANUTENCAO_INICIADA_SEM_PARADA",
      descricao:"Execução técnica iniciada sem parada do equipamento.",
      usuario_id:auth.usuario_id || "",
      perfil:auth.perfil || ROLE.OPERADOR
    });
    return null;
  }

  var ativo = find_("ativos","id",acao.ativo_id);
  if(!ativo) err_("ASSET_NOT_FOUND","Equipamento não encontrado.",404);

  var alreadyStopped = !!policy.parada_operacional || upper_(ativo.status) === ST.PARADO;
  var changedAssetStatus = !alreadyStopped;

  var row = fit_("paradas_manutencao", {
    id:uuid_("MST"),
    ativo_id:acao.ativo_id,
    componente_id:acao.componente_id || "",
    os_id:acao.os_id || "",
    acao_id:acao.id,
    execucao_id:ex.id,
    modo_configurado:policy.modo_configurado,
    decisao_execucao:"COM_PARADA",
    status:ST.EM_EXECUCAO,
    equipamento_ja_parado:alreadyStopped ? "SIM" : "NAO",
    alterou_status_ativo:changedAssetStatus ? "SIM" : "NAO",
    iniciada_em:now_(),
    finalizada_em:"",
    duracao_segundos:0,
    usuario_id:auth.usuario_id || "",
    criado_em:now_(),
    atualizado_em:now_()
  });

  append_("paradas_manutencao", row);
  var inserted = find_("paradas_manutencao","id",row.id);
  if(!inserted) err_("MAINTENANCE_STOP_CREATE_FAILED","Falha ao registrar a parada técnica.",500);

  if(changedAssetStatus){
    atualizarStatusAtivo114_(ativo, ST.PARADO);
  }

  if(executionRow.__rowIndex){
    update_("execucoes", executionRow.__rowIndex, {
      modo_execucao_manutencao:"COM_PARADA",
      atualizado_em:now_()
    });
  }

  hist_({
    ativo_id:acao.ativo_id,
    componente_id:acao.componente_id,
    os_id:acao.os_id,
    acao_id:acao.id,
    execucao_id:ex.id,
    evento:"PARADA_TECNICA_MANUTENCAO_INICIADA",
    descricao:alreadyStopped
      ? "Manutenção iniciada com equipamento já parado pela operação."
      : "Equipamento parado pela manutenção para execução técnica.",
    usuario_id:auth.usuario_id || "",
    perfil:auth.perfil || ROLE.OPERADOR
  });

  return paradaManutencaoSerializada115_(inserted);
}

function finalizarCondicaoManutencao115_(acao, ex, auth){
  ensureParadasOperacionaisSchema114_();

  var row = paradaManutencaoAtivaPorAcao115_(acao.id);
  if(!row) return null;

  var endedAt = now_();
  var duration = secondsBetween114_(row.iniciada_em, endedAt);

  update_("paradas_manutencao", row.__rowIndex, {
    status:ST.FINALIZADA,
    finalizada_em:endedAt,
    duracao_segundos:duration,
    atualizado_em:endedAt
  });

  var operationalStop = typeof paradaAtivaPorAtivo114_ === "function"
    ? paradaAtivaPorAtivo114_(acao.ativo_id)
    : null;

  // Só devolve o status OPERANDO quando esta manutenção foi quem parou a máquina
  // e não existe uma parada operacional da produção ainda aberta.
  if(bool_(row.alterou_status_ativo) && !operationalStop){
    var ativo = find_("ativos","id",acao.ativo_id);
    atualizarStatusAtivo114_(ativo, ST.OPERANDO);
  }

  hist_({
    ativo_id:acao.ativo_id,
    componente_id:acao.componente_id,
    os_id:acao.os_id,
    acao_id:acao.id,
    execucao_id:ex.id,
    evento:"PARADA_TECNICA_MANUTENCAO_FINALIZADA",
    descricao:"Parada técnica encerrada. Duração: "+duration+" s.",
    usuario_id:auth.usuario_id || "",
    perfil:auth.perfil || ROLE.OPERADOR
  });

  return paradaManutencaoSerializada115_(
    find_("paradas_manutencao","id",row.id)
  );
}
