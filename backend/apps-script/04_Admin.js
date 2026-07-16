const ADMIN_ENT = {
  plantas:"plantas", setores:"setores", linhas:"linhas", ativos:"ativos", componentes:"componentes",
  materiais:"materiais", planos:"planos_manutencao", plano_itens:"plano_itens", usuarios:"usuarios"
};

function adminResumo_(){
  return {
    version:FAB.VERSION,
    totais:{
      plantas:rows_("plantas").length,
      setores:rows_("setores").length,
      linhas:rows_("linhas").length,
      ativos:rows_("ativos").length,
      componentes:rows_("componentes").length,
      planos:rows_("planos_manutencao").length,
      plano_itens:rows_("plano_itens").length,
      usuarios:rows_("usuarios").length,
      acoes_abertas:rows_("os_acoes").filter(acaoAberta_).length,
      os_abertas:rows_("ordens_servico").filter(function(o){ return !terminal_(o.status); }).length
    },
    serverTime:now_()
  };
}

function adminListar_(p){
  var ent = clean_(p.entidade);
  var sh = ADMIN_ENT[ent];
  if(!sh) err_("ENTITY_INVALID","Entidade inválida: "+ent,400);
  var r = rows_(sh).map(function(x){ x = strip_(x); if(sh === "usuarios") delete x.pin_hash; return x; });
  if(p.filtro_campo) r = r.filter(function(x){ return String(x[p.filtro_campo]) === String(p.filtro_valor); });
  return {entidade:ent, total:r.length, rows:r.slice(0, Math.min(num_(p.limite,300),500))};
}

function adminObter_(p){
  req_(p, ["entidade","id"]);
  var sh = ADMIN_ENT[clean_(p.entidade)];
  if(!sh) err_("ENTITY_INVALID","Entidade inválida.",400);
  var r = find_(sh,"id",p.id);
  if(!r) err_("NOT_FOUND","Registro não encontrado.",404);
  r = strip_(r);
  if(sh === "usuarios") delete r.pin_hash;
  return {entidade:p.entidade, row:r};
}

function adminSalvar_(p){
  req_(p, ["entidade","dados"]);
  var ent = clean_(p.entidade);
  var sh = ADMIN_ENT[ent];
  if(!sh) err_("ENTITY_INVALID","Entidade inválida: "+ent,400);
  var row = normalizeEnt_(ent, p.dados || {});
  var old = row.id ? find_(sh,"id",row.id) : null;
  if(old){
    row.criado_em = old.criado_em || row.criado_em || now_();
    row.atualizado_em = now_();
    update_(sh, old.__rowIndex, row);
    return {saved:true, mode:"update", entidade:ent, row:strip_(Object.assign({}, old, row))};
  }
  row.criado_em = row.criado_em || now_();
  row.atualizado_em = now_();
  append_(sh, row);
  return {saved:true, mode:"insert", entidade:ent, row:strip_(row)};
}

function normalizeEnt_(ent,d){
  var o = Object.assign({}, d);

  if(ent === "plantas"){
    req_(d,["tag","nome"]); o.tag=upper_(d.tag); o.id=clean_(d.id)||eid_("PLT",o.tag); o.status=upper_(d.status||ST.ATIVO);
  }
  if(ent === "setores"){
    req_(d,["planta_id","tag","nome"]); o.tag=upper_(d.tag); o.id=clean_(d.id)||eid_("SET",d.planta_id+"-"+o.tag); o.status=upper_(d.status||ST.ATIVO);
  }
  if(ent === "linhas"){
    req_(d,["setor_id","tag","nome"]); o.tag=upper_(d.tag); o.id=clean_(d.id)||eid_("LIN",d.setor_id+"-"+o.tag); o.status=upper_(d.status||ST.ATIVO);
  }
  if(ent === "ativos"){
    req_(d,["linha_id","tag","nome"]); o.tag=upper_(d.tag); o.id=clean_(d.id)||eid_("ATV",o.tag); o.qr_payload=clean_(d.qr_payload)||o.tag; o.criticidade=upper_(d.criticidade||"MEDIA"); o.status=upper_(d.status||ST.OPERANDO); o.saude_pct=num_(d.saude_pct,100); o.horimetro_atual=num_(d.horimetro_atual,0);
  }
  if(ent === "componentes"){
    req_(d,["ativo_id","tag","nome"]); o.tag=upper_(d.tag); o.id=clean_(d.id)||eid_("CMP",d.ativo_id+"-"+o.tag); o.qr_payload=clean_(d.qr_payload)||o.id; o.criticidade=upper_(d.criticidade||"MEDIA"); o.status=upper_(d.status||ST.ATIVO); o.vida_util_horas=num_(d.vida_util_horas,0); o.vida_util_dias=num_(d.vida_util_dias,0); o.horas_acumuladas=num_(d.horas_acumuladas,0);
  }
  if(ent === "materiais"){
    req_(d,["sku","nome"]); o.sku=upper_(d.sku); o.id=clean_(d.id)||eid_("MAT",o.sku); o.unidade=clean_(d.unidade||"un"); o.estoque_atual=num_(d.estoque_atual,0); o.estoque_minimo=num_(d.estoque_minimo,0); o.status=upper_(d.status||ST.ATIVO);
  }
  if(ent === "planos"){
    req_(d,["ativo_id","nome","gatilho_tipo","gatilho_valor"]); o.id=clean_(d.id)||eid_("PLN",d.ativo_id+"-"+(d.componente_id||"ATIVO")+"-"+d.nome); o.tipo=upper_(d.tipo||"PREVENTIVA"); o.criticidade=upper_(d.criticidade||"MEDIA"); o.gatilho_tipo=upper_(d.gatilho_tipo||"HORAS"); o.gatilho_valor=num_(d.gatilho_valor,0); o.unidade=clean_(d.unidade||""); o.recorrencia_dias=num_(d.recorrencia_dias,0); o.tempo_estimado_min=num_(d.tempo_estimado_min,0); o.requer_bloqueio=bool_(d.requer_bloqueio===undefined?"SIM":d.requer_bloqueio)?"SIM":"NAO"; o.requer_evidencia=bool_(d.requer_evidencia===undefined?"NAO":d.requer_evidencia)?"SIM":"NAO"; o.max_sessoes=Math.max(1,num_(d.max_sessoes,1)); o.status=upper_(d.status||ST.INATIVO); o.workflow_status=upper_(d.workflow_status||ST.RASCUNHO); o.validado_gestao=bool_(d.validado_gestao)?"SIM":"NAO"; o.revisao=Math.max(1,num_(d.revisao,1)); o.setor_id=clean_(d.setor_id); o.modelo_base_id=clean_(d.modelo_base_id); o.revisao_origem_id=clean_(d.revisao_origem_id); o.substitui_plano_id=clean_(d.substitui_plano_id); o.substituido_por=clean_(d.substituido_por); o.substituido_em=clean_(d.substituido_em);
  }
  if(ent === "plano_itens"){
    req_(d,["plano_id","titulo"]); o.id=clean_(d.id)||eid_("PIT",d.plano_id+"-"+(d.ordem||1)+"-"+d.titulo); o.ordem=num_(d.ordem,1); o.tipo_resposta=normalizaTipoChecklist_(d.tipo_resposta||"OK_NOK"); o.obrigatorio=bool_(d.obrigatorio===undefined?"SIM":d.obrigatorio)?"SIM":"NAO"; o.evidencia_obrigatoria=bool_(d.evidencia_obrigatoria===undefined?"NAO":d.evidencia_obrigatoria)?"SIM":"NAO"; o.parametro_nome=clean_(d.parametro_nome); o.valor_esperado=clean_(d.valor_esperado); o.opcoes_json=normalizaOpcoesJson_(d.opcoes||d.opcoes_json); o.bloqueia_finalizacao=bool_(d.bloqueia_finalizacao)?"SIM":"NAO"; o.categoria=upper_(d.categoria||"OPERACIONAL"); o.peso=num_(d.peso,1); o.status=upper_(d.status||ST.ATIVO); o.validacao_regra=clean_(d.validacao_regra);
  }
  if(ent === "usuarios"){
    req_(d,["nome","email","perfil"]); o.email=clean_(d.email).toLowerCase(); o.perfil=upper_(d.perfil); o.status=upper_(d.status||ST.ATIVO); o.id=clean_(d.id)||eid_("USR",o.email.split("@")[0]); if(d.pin) o.pin_hash=hashPin_(d.pin); var old=find_("usuarios","id",o.id); if(!o.pin_hash && old) o.pin_hash=old.pin_hash; if(!o.pin_hash) err_("PIN_REQUIRED","PIN obrigatório para novo usuário.",400);
  }

  return fit_(shForEnt_(ent), o);
}

function shForEnt_(ent){ return ADMIN_ENT[ent]; }

function adminRecalcularAtivo_(p){
  req_(p,["ativo_id"]);
  var auth = p.__auth || {};
  var ativoId = clean_(p.ativo_id);
  var ativoAntes = find_("ativos","id",ativoId);
  if(!ativoAntes) err_("NOT_FOUND","Ativo não encontrado: "+ativoId,404);

  var saudeAnterior = num_(ativoAntes.saude_pct,100);
  var motor = cmmsMotorRecalcular_({ativo_id:ativoId, __auth:auth});

  var metricas = calcularSaudeAtivoCMMS_(ativoId);
  var ativoAtual = find_("ativos","id",ativoId);
  if(ativoAtual){
    update_("ativos", ativoAtual.__rowIndex, {saude_pct:metricas.pct, atualizado_em:now_()});
  }

  hist_({
    ativo_id:ativoId,
    componente_id:"",
    os_id:"",
    acao_id:"",
    execucao_id:"",
    evento:"ATIVO_RECALCULADO_ADMIN",
    descricao:"Ativo recalculado por "+(auth.perfil||"")+". Saúde: "+saudeAnterior+"% -> "+metricas.pct+"%.",
    usuario_id:auth.usuario_id||"",
    perfil:auth.perfil||""
  });

  return {
    recalculado:true,
    ativo_id:ativoId,
    saude_anterior:saudeAnterior,
    saude_atual:metricas.pct,
    saude_status:metricas.status,
    acoes_abertas:metricas.acoes_abertas,
    os_abertas:metricas.os_abertas,
    motor:motor
  };
}

function adminGerarQr_(p){
  req_(p,["tipo","id"]);
  var tipo = upper_(p.tipo);
  var row = tipo === "ATIVO" ? find_("ativos","id",p.id) : tipo === "COMPONENTE" ? find_("componentes","id",p.id) : null;
  if(!row) err_("NOT_FOUND","Registro não encontrado para QR.",404);
  var payload = clean_(row.qr_payload || row.tag || row.id);
  return {tipo:tipo, id:row.id, tag:row.tag, nome:row.nome, qr_payload:payload, qr_url:"https://api.qrserver.com/v1/create-qr-code/?size=420x420&data="+encodeURIComponent(payload)};
}

function adminCriarDemo_(p){
  adminSalvar_({entidade:"plantas", dados:{id:"PLT-PLT-01", tag:"PLT-01", nome:"Planta 01"}});
  adminSalvar_({entidade:"setores", dados:{id:"SET-PLT-PLT-01-ENV", planta_id:"PLT-PLT-01", tag:"ENV", nome:"Envase"}});
  adminSalvar_({entidade:"linhas", dados:{id:"LIN-SET-PLT-PLT-01-ENV-L01", setor_id:"SET-PLT-PLT-01-ENV", tag:"L01", nome:"Linha 01"}});
  var atv = adminSalvar_({entidade:"ativos", dados:{id:"ATV-ENV-001", linha_id:"LIN-SET-PLT-PLT-01-ENV-L01", tag:"ENV-001", nome:"Envasadora 01", tipo:"Envasadora", criticidade:"CRITICA", status:"OPERANDO", saude_pct:100, horimetro_atual:3990}}).row;
  var comp = adminSalvar_({entidade:"componentes", dados:{id:"CMP-ATV-ENV-001-ROL-001", ativo_id:atv.id, tag:"ROL-001", qr_payload:"CMP-ATV-ENV-001-ROL-001", nome:"Rolamento principal", tipo:"Rolamento", criticidade:"ALTA", status:"ATIVO", vida_util_horas:4000, horas_acumuladas:3990}}).row;
  var plano = adminSalvar_({entidade:"planos", dados:{id:"PLN-ATV-ENV-001-CMP-ATV-ENV-001-ROL-001-INSPECIONAR-ROLAMENTO-PR", ativo_id:atv.id, componente_id:comp.id, nome:"Inspecionar rolamento principal", tipo:"INSPECAO", criticidade:"ALTA", gatilho_tipo:"HORAS", gatilho_valor:4000, unidade:"h", tempo_estimado_min:15, requer_bloqueio:"SIM", requer_evidencia:"NAO", max_sessoes:1, status:"ATIVO"}}).row;
  ensureDefaultPlanoItem_(plano);
  return {created:true, ativo:atv, componente:comp, plano:plano};
}
