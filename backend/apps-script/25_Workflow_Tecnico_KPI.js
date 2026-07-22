const TECH_DEMAND_STATUS = {
  ABERTA:"ABERTA",
  EM_TRIAGEM:"EM_TRIAGEM",
  EM_VALIDACAO:"EM_VALIDACAO_TECNICA",
  AGUARDANDO_ASSINATURA:"AGUARDANDO_ASSINATURA",
  ENCAMINHADA:"ENCAMINHADA",
  DEVOLVIDA_ADMIN:"DEVOLVIDA_ADMIN",
  APROVADA:"APROVADA_TECNICAMENTE",
  LIBERADA_OPERACAO:"LIBERADA_OPERACAO",
  CONCLUIDA:"CONCLUIDA",
  CANCELADA:"CANCELADA"
};

const TECH_FINAL_STATUSES = [
  TECH_DEMAND_STATUS.DEVOLVIDA_ADMIN,
  TECH_DEMAND_STATUS.APROVADA,
  TECH_DEMAND_STATUS.LIBERADA_OPERACAO,
  TECH_DEMAND_STATUS.CONCLUIDA,
  TECH_DEMAND_STATUS.CANCELADA
];

function technicalEnsureSchema_(){
  var ss = getSpreadsheet_();
  var marker = find_("config", "chave", "workflow.tecnico.schema.version");
  if(marker && clean_(marker.valor) === FAB.SCHEMA_VERSION) return;
  var lock = LockService.getScriptLock();
  if(!lock.tryLock(20000)) err_("TECH_SCHEMA_BUSY", "A preparaÃ§Ã£o do workflow tÃ©cnico estÃ¡ em andamento. Tente novamente.", 409);
  try{
    marker = find_("config", "chave", "workflow.tecnico.schema.version");
    if(!marker || clean_(marker.valor) !== FAB.SCHEMA_VERSION){
      [
        "areas_tecnicas","cargos_tecnicos","demandas_tecnicas","demanda_tramitacoes",
        "assinaturas_tecnicas","analises_tecnicas","notificacoes","turnos",
        "apontamentos_producao","sla_politicas","usuarios"
      ].forEach(function(name){ ensureSheet_(ss, name, SH[name]); });
      technicalSeedCatalog_({usuario_id:"SISTEMA", perfil:ROLE.SISTEMA});
      upsert_("config", "chave", {
        chave:"workflow.tecnico.schema.version",
        valor:FAB.SCHEMA_VERSION,
        descricao:"VersÃ£o do roteamento, assinatura, anÃ¡lises e KPIs tÃ©cnicos",
        atualizado_em:now_()
      });
    }
  } finally {
    lock.releaseLock();
  }
}

function cmmsWorkflowTecnicoSchemaUpgrade_(p, auth){
  if(upper_(auth && auth.perfil) !== ROLE.ADMIN){
    err_("FORBIDDEN_ADMIN_REQUIRED", "A migraÃ§Ã£o do workflow tÃ©cnico exige perfil ADMIN.", 403);
  }
  technicalEnsureSchema_();
  var catalog = technicalSeedCatalog_(auth);
  upsert_("config", "chave", {
    chave:"workflow.tecnico.schema.version",
    valor:FAB.SCHEMA_VERSION,
    descricao:"VersÃ£o do roteamento, assinatura, anÃ¡lises e KPIs tÃ©cnicos",
    atualizado_em:now_()
  });
  invalidateRuntimeCache_();
  return {upgraded:true, schema_version:FAB.SCHEMA_VERSION, sheets:Object.keys(SH).length, catalog:catalog};
}

function technicalSeedCatalog_(auth){
  var definitions = [
    {codigo:"MANUTENCAO", nome:"ManutenÃ§Ã£o", descricao:"DiagnÃ³stico, reparo, confiabilidade e liberaÃ§Ã£o tÃ©cnica.", exige:"NAO", cargo:"TÃ‰CNICO DE MANUTENÃ‡ÃƒO"},
    {codigo:"QUALIDADE", nome:"Qualidade", descricao:"Conformidade, inspeÃ§Ã£o e assinatura de qualidade.", exige:"SIM", cargo:"INSPETOR DE QUALIDADE"},
    {codigo:"SEGURANCA", nome:"SeguranÃ§a", descricao:"Riscos, bloqueios e liberaÃ§Ã£o de seguranÃ§a.", exige:"SIM", cargo:"TÃ‰CNICO DE SEGURANÃ‡A"},
    {codigo:"SUPERVISAO", nome:"SupervisÃ£o", descricao:"CoordenaÃ§Ã£o operacional e decisÃ£o de turno.", exige:"NAO", cargo:"SUPERVISOR"},
    {codigo:"LIDERANCA_SETOR", nome:"LideranÃ§a de setor", descricao:"GestÃ£o do escopo da linha ou setor.", exige:"NAO", cargo:"LÃDER DE SETOR"}
  ];
  var createdAreas = 0;
  var createdRoles = 0;
  definitions.forEach(function(definition){
    var area = rows_("areas_tecnicas", true).find(function(item){ return upper_(item.codigo) === definition.codigo; });
    if(!area){
      area = fit_("areas_tecnicas", {
        id:eid_("ATEC", definition.codigo), codigo:definition.codigo, nome:definition.nome,
        descricao:definition.descricao, status:ST.ATIVO, exige_assinatura_padrao:definition.exige,
        criado_por:auth.usuario_id, criado_em:now_(), atualizado_em:now_()
      });
      append_("areas_tecnicas", area);
      createdAreas++;
    }
    var roleCode = slug_(definition.cargo);
    var role = rows_("cargos_tecnicos", true).find(function(item){
      return String(item.area_id) === String(area.id) && upper_(item.codigo) === roleCode;
    });
    if(!role){
      append_("cargos_tecnicos", fit_("cargos_tecnicos", {
        id:eid_("CTEC", definition.codigo), area_id:area.id, codigo:roleCode,
        nome:definition.cargo, descricao:definition.descricao, status:ST.ATIVO,
        pode_assinar:"SIM", criado_por:auth.usuario_id, criado_em:now_(), atualizado_em:now_()
      }));
      createdRoles++;
    }
  });
  [
    {prioridade:"CRITICA", resposta:15, resolucao:120},
    {prioridade:"ALTA", resposta:30, resolucao:240},
    {prioridade:"MEDIA", resposta:120, resolucao:480},
    {prioridade:"NORMAL", resposta:120, resolucao:480},
    {prioridade:"BAIXA", resposta:240, resolucao:1440}
  ].forEach(function(definition){
    var policyId = "SLA-DEFAULT-" + definition.prioridade;
    if(find_("sla_politicas", "id", policyId)) return;
    append_("sla_politicas", fit_("sla_politicas", {
      id:policyId, tipo_demanda:"", prioridade:definition.prioridade, area_id:"",
      resposta_minutos:definition.resposta, resolucao_minutos:definition.resolucao,
      calendario_id:"24X7", status:ST.ATIVO, criado_em:now_(), atualizado_em:now_()
    }));
  });
  return {areas_criadas:createdAreas, cargos_criados:createdRoles};
}

function technicalRequireAdmin_(auth){
  if(upper_(auth && auth.perfil) !== ROLE.ADMIN){
    err_("FORBIDDEN_ADMIN_REQUIRED", "Esta operaÃ§Ã£o exige perfil ADMIN.", 403);
  }
}

function technicalRequireManager_(auth){
  var profile = upper_(auth && auth.perfil);
  if([ROLE.GESTOR, ROLE.ADMIN].indexOf(profile) < 0){
    err_("FORBIDDEN_GESTOR_REQUIRED", "Esta operaÃ§Ã£o exige perfil GESTOR ou ADMIN.", 403);
  }
}

function technicalIdentity_(auth){
  var user = auth && auth.usuario_id ? find_("usuarios", "id", auth.usuario_id) : null;
  var area = user && user.area_id ? find_("areas_tecnicas", "id", user.area_id) : null;
  var role = user && user.cargo_id ? find_("cargos_tecnicos", "id", user.cargo_id) : null;
  return {
    usuario_id:clean_(auth && auth.usuario_id),
    nome:clean_(user && user.nome || auth && auth.nome),
    perfil:upper_(user && user.perfil || auth && auth.perfil),
    area_id:clean_(user && user.area_id),
    area_nome:clean_(area && area.nome),
    cargo_id:clean_(user && user.cargo_id),
    cargo_nome:clean_(role && role.nome),
    pode_assinar:!!(role && bool_(role.pode_assinar)),
    especialidades:technicalJsonArray_(user && user.especialidades_json),
    escopo_ids:technicalJsonArray_(user && user.escopo_ids_json)
  };
}

function technicalJsonArray_(value){
  if(Array.isArray(value)) return value.map(clean_).filter(Boolean);
  if(!clean_(value)) return [];
  try{
    var parsed = JSON.parse(clean_(value));
    return Array.isArray(parsed) ? parsed.map(clean_).filter(Boolean) : [];
  } catch(e){
    return clean_(value).split(",").map(clean_).filter(Boolean);
  }
}

function technicalSerializeArray_(value){
  return JSON.stringify(technicalJsonArray_(value));
}

function technicalActiveArea_(id){
  var area = id ? find_("areas_tecnicas", "id", id) : null;
  if(!area || upper_(area.status) !== ST.ATIVO){
    err_("TECH_AREA_INVALID", "Ãrea tÃ©cnica inexistente ou inativa.", 400);
  }
  return area;
}

function technicalActiveRole_(id, areaId){
  if(!id) return null;
  var role = find_("cargos_tecnicos", "id", id);
  if(!role || upper_(role.status) !== ST.ATIVO){
    err_("TECH_ROLE_INVALID", "Cargo tÃ©cnico inexistente ou inativo.", 400);
  }
  if(areaId && String(role.area_id) !== String(areaId)){
    err_("TECH_ROLE_AREA_MISMATCH", "O cargo nÃ£o pertence Ã  Ã¡rea tÃ©cnica informada.", 400);
  }
  return role;
}

function adminAreasTecnicasListar_(p, auth){
  technicalRequireAdmin_(auth);
  technicalEnsureSchema_();
  var status = upper_(p.status);
  var items = rows_("areas_tecnicas", true).filter(function(item){
    return !status || upper_(item.status) === status;
  }).sort(function(a,b){ return clean_(a.nome).localeCompare(clean_(b.nome)); }).map(strip_);
  return {total:items.length, areas:items};
}

function adminAreasTecnicasSalvar_(p, auth){
  technicalRequireAdmin_(auth);
  technicalEnsureSchema_();
  var data = Object.assign({}, p.dados || p.area || {});
  req_(data, ["nome"]);
  var old = data.id ? find_("areas_tecnicas", "id", data.id) : null;
  var code = upper_(data.codigo || slug_(data.nome));
  if(!code) err_("TECH_AREA_CODE_REQUIRED", "Informe o cÃ³digo da Ã¡rea tÃ©cnica.", 400);
  var duplicate = rows_("areas_tecnicas", true).find(function(item){
    return (!old || String(item.id) !== String(old.id)) && upper_(item.codigo) === code;
  });
  if(duplicate) err_("TECH_AREA_CODE_EXISTS", "JÃ¡ existe uma Ã¡rea com este cÃ³digo.", 409);
  var saved = fit_("areas_tecnicas", Object.assign({}, old || {}, {
    id:old ? old.id : uuid_("ATEC"),
    codigo:code,
    nome:clean_(data.nome),
    descricao:clean_(data.descricao),
    status:upper_(data.status || ST.ATIVO),
    exige_assinatura_padrao:bool_(data.exige_assinatura_padrao) ? "SIM" : "NAO",
    criado_por:old ? old.criado_por : auth.usuario_id,
    criado_em:old ? old.criado_em : now_(),
    atualizado_em:now_()
  }));
  if(old) update_("areas_tecnicas", old.__rowIndex, saved); else append_("areas_tecnicas", saved);
  audit_(auth, old ? "TECH_AREA_UPDATED" : "TECH_AREA_CREATED", "areas_tecnicas", saved.id, old && strip_(old), saved, clean_(p.user_agent));
  return {saved:true, area:saved};
}

function adminCargosTecnicosListar_(p, auth){
  technicalRequireAdmin_(auth);
  technicalEnsureSchema_();
  var areaId = clean_(p.area_id);
  var status = upper_(p.status);
  var items = rows_("cargos_tecnicos", true).filter(function(item){
    if(areaId && String(item.area_id) !== String(areaId)) return false;
    return !status || upper_(item.status) === status;
  }).sort(function(a,b){ return clean_(a.nome).localeCompare(clean_(b.nome)); }).map(strip_);
  return {total:items.length, cargos:items};
}

function adminCargosTecnicosSalvar_(p, auth){
  technicalRequireAdmin_(auth);
  technicalEnsureSchema_();
  var data = Object.assign({}, p.dados || p.cargo || {});
  req_(data, ["area_id","nome"]);
  technicalActiveArea_(data.area_id);
  var old = data.id ? find_("cargos_tecnicos", "id", data.id) : null;
  var code = upper_(data.codigo || slug_(data.nome));
  var duplicate = rows_("cargos_tecnicos", true).find(function(item){
    return (!old || String(item.id) !== String(old.id)) &&
      String(item.area_id) === String(data.area_id) && upper_(item.codigo) === code;
  });
  if(duplicate) err_("TECH_ROLE_CODE_EXISTS", "JÃ¡ existe um cargo com este cÃ³digo na Ã¡rea.", 409);
  var saved = fit_("cargos_tecnicos", Object.assign({}, old || {}, {
    id:old ? old.id : uuid_("CTEC"),
    area_id:clean_(data.area_id),
    codigo:code,
    nome:clean_(data.nome),
    descricao:clean_(data.descricao),
    status:upper_(data.status || ST.ATIVO),
    pode_assinar:bool_(data.pode_assinar) ? "SIM" : "NAO",
    criado_por:old ? old.criado_por : auth.usuario_id,
    criado_em:old ? old.criado_em : now_(),
    atualizado_em:now_()
  }));
  if(old) update_("cargos_tecnicos", old.__rowIndex, saved); else append_("cargos_tecnicos", saved);
  audit_(auth, old ? "TECH_ROLE_UPDATED" : "TECH_ROLE_CREATED", "cargos_tecnicos", saved.id, old && strip_(old), saved, clean_(p.user_agent));
  return {saved:true, cargo:saved};
}

function technicalSlaPolicy_(type, priority, areaId){
  var matches = rows_("sla_politicas", true).filter(function(policy){
    if(upper_(policy.status || ST.ATIVO) !== ST.ATIVO) return false;
    if(clean_(policy.tipo_demanda) && upper_(policy.tipo_demanda) !== upper_(type)) return false;
    if(clean_(policy.prioridade) && upper_(policy.prioridade) !== upper_(priority)) return false;
    if(clean_(policy.area_id) && String(policy.area_id) !== String(areaId)) return false;
    return true;
  }).sort(function(a,b){
    return (clean_(b.area_id) ? 2 : 0) + (clean_(b.prioridade) ? 1 : 0) -
      ((clean_(a.area_id) ? 2 : 0) + (clean_(a.prioridade) ? 1 : 0));
  });
  return matches[0] || null;
}

function technicalAddMinutesIso_(minutes){
  return minutes > 0 ? iso_(addMinutes_(new Date(), minutes)) : "";
}

function technicalDemandHash_(data){
  return sha256_(JSON.stringify({
    entidade_tipo:upper_(data.entidade_tipo),
    entidade_id:clean_(data.entidade_id),
    versao_entidade:clean_(data.versao_entidade || "1"),
    titulo:clean_(data.titulo),
    descricao:clean_(data.descricao),
    area_atual_id:clean_(data.area_atual_id),
    cargo_atual_id:clean_(data.cargo_atual_id)
  }));
}

function technicalNotify_(target, type, title, message, entityType, entityId, priority){
  var users = rows_("usuarios", true).filter(function(user){
    if(upper_(user.status) !== ST.ATIVO) return false;
    if(target.usuario_id) return String(user.id) === String(target.usuario_id);
    if(target.perfil && upper_(user.perfil) !== upper_(target.perfil)) return false;
    if(target.area_id && String(user.area_id) !== String(target.area_id)) return false;
    if(target.cargo_id && String(user.cargo_id) !== String(target.cargo_id)) return false;
    return !!(target.perfil || target.area_id || target.cargo_id);
  });
  users.forEach(function(user){
    append_("notificacoes", fit_("notificacoes", {
      id:uuid_("NOT"), usuario_id:user.id, perfil:user.perfil, area_id:user.area_id,
      tipo:type, titulo:title, mensagem:message, entidade_tipo:entityType,
      entidade_id:entityId, prioridade:priority || "MEDIA", status:"NAO_LIDA",
      lida_em:"", criado_em:now_()
    }));
  });
  return users.length;
}

function technicalAppendTransition_(demand, action, identity, target, decision, opinion, reason){
  var sequence = rows_("demanda_tramitacoes", true).filter(function(item){
    return String(item.demanda_id) === String(demand.id);
  }).length + 1;
  var row = fit_("demanda_tramitacoes", {
    id:uuid_("TRM"), demanda_id:demand.id, sequencia:sequence, acao:action,
    de_area_id:identity.area_id, de_cargo_id:identity.cargo_id, de_usuario_id:identity.usuario_id,
    para_area_id:clean_(target && target.area_id), para_cargo_id:clean_(target && target.cargo_id),
    para_usuario_id:clean_(target && target.usuario_id), decisao:clean_(decision),
    parecer:clean_(opinion), motivo:clean_(reason), payload_hash:demand.payload_hash, criado_em:now_()
  });
  append_("demanda_tramitacoes", row);
  return row;
}

function adminDemandasTecnicasEnviar_(p, auth){
  technicalRequireAdmin_(auth);
  technicalEnsureSchema_();
  var data = Object.assign({}, p.demanda || p.dados || p);
  req_(data, ["entidade_tipo","entidade_id","titulo","area_atual_id"]);
  var area = technicalActiveArea_(data.area_atual_id);
  technicalActiveRole_(data.cargo_atual_id, area.id);
  if(data.responsavel_atual_id){
    var targetUser = find_("usuarios", "id", data.responsavel_atual_id);
    if(!targetUser || upper_(targetUser.status) !== ST.ATIVO || upper_(targetUser.perfil) !== ROLE.GESTOR){
      err_("TECH_ASSIGNEE_INVALID", "ResponsÃ¡vel tÃ©cnico inexistente, inativo ou fora do perfil GESTOR.", 400);
    }
    if(clean_(targetUser.area_id) && String(targetUser.area_id) !== String(area.id)){
      err_("TECH_ASSIGNEE_AREA_MISMATCH", "O responsÃ¡vel nÃ£o pertence Ã  Ã¡rea de destino.", 400);
    }
  }
  var priority = upper_(data.prioridade || "MEDIA");
  var policy = technicalSlaPolicy_(data.tipo || data.entidade_tipo, priority, area.id);
  var needsSignature = data.exige_assinatura === undefined
    ? bool_(area.exige_assinatura_padrao)
    : bool_(data.exige_assinatura);
  var demand = fit_("demandas_tecnicas", {
    id:uuid_("DMT"), tipo:upper_(data.tipo || "VALIDACAO_TECNICA"),
    entidade_tipo:upper_(data.entidade_tipo), entidade_id:clean_(data.entidade_id),
    origem_tipo:upper_(data.origem_tipo || "ADMIN"), origem_id:clean_(data.origem_id || auth.usuario_id),
    titulo:clean_(data.titulo), descricao:clean_(data.descricao), prioridade:priority,
    status:needsSignature ? TECH_DEMAND_STATUS.AGUARDANDO_ASSINATURA : TECH_DEMAND_STATUS.EM_VALIDACAO,
    area_origem_id:clean_(data.area_origem_id), area_atual_id:area.id,
    cargo_atual_id:clean_(data.cargo_atual_id), responsavel_atual_id:clean_(data.responsavel_atual_id),
    criado_por:auth.usuario_id, criado_perfil:auth.perfil,
    exige_assinatura:needsSignature ? "SIM" : "NAO",
    assinaturas_necessarias:needsSignature ? Math.max(1, num_(data.assinaturas_necessarias, 1)) : 0,
    assinaturas_realizadas:0, exige_segregacao:bool_(data.exige_segregacao) ? "SIM" : "NAO",
    prazo_primeira_resposta_em:technicalAddMinutesIso_(num_(data.resposta_minutos, policy && policy.resposta_minutos)),
    prazo_resolucao_em:technicalAddMinutesIso_(num_(data.resolucao_minutos, policy && policy.resolucao_minutos)),
    primeiro_atendimento_em:"", concluido_em:"", versao_entidade:clean_(data.versao_entidade || "1"),
    payload_hash:"", criado_em:now_(), atualizado_em:now_()
  });
  demand.payload_hash = technicalDemandHash_(demand);
  append_("demandas_tecnicas", demand);
  technicalAppendTransition_(demand, "ENVIADA_PELO_ADMIN", technicalIdentity_(auth), {
    area_id:demand.area_atual_id, cargo_id:demand.cargo_atual_id, usuario_id:demand.responsavel_atual_id
  }, "", data.parecer, data.motivo);
  technicalNotify_({usuario_id:demand.responsavel_atual_id, area_id:demand.responsavel_atual_id ? "" : demand.area_atual_id, cargo_id:demand.cargo_atual_id}, "DEMANDA_TECNICA", demand.titulo, "Nova demanda tÃ©cnica aguardando tratamento.", "demandas_tecnicas", demand.id, demand.prioridade);
  audit_(auth, "TECH_DEMAND_SENT", "demandas_tecnicas", demand.id, null, demand, clean_(p.user_agent));
  return {sent:true, demanda:technicalDemandPublic_(demand)};
}

function technicalDemandAccessible_(demand, identity){
  if(identity.perfil === ROLE.ADMIN) return true;
  if(identity.perfil !== ROLE.GESTOR) return false;
  if(clean_(demand.responsavel_atual_id)) return String(demand.responsavel_atual_id) === String(identity.usuario_id);
  if(clean_(demand.area_atual_id) && clean_(identity.area_id) && String(demand.area_atual_id) !== String(identity.area_id)) return false;
  if(clean_(demand.cargo_atual_id) && String(demand.cargo_atual_id) !== String(identity.cargo_id)) return false;
  return !clean_(demand.area_atual_id) || String(demand.area_atual_id) === String(identity.area_id);
}

function technicalRequireDemand_(id, identity){
  var demand = find_("demandas_tecnicas", "id", id);
  if(!demand) err_("TECH_DEMAND_NOT_FOUND", "Demanda tÃ©cnica nÃ£o encontrada.", 404);
  if(!technicalDemandAccessible_(demand, identity)) err_("TECH_DEMAND_FORBIDDEN", "Demanda fora do seu escopo tÃ©cnico.", 403);
  return demand;
}

function technicalAssertDemandOpen_(demand){
  if(TECH_FINAL_STATUSES.indexOf(upper_(demand.status)) >= 0){
    err_("TECH_DEMAND_FINAL", "A demanda jÃ¡ estÃ¡ encerrada e nÃ£o aceita novas transiÃ§Ãµes.", 409);
  }
  return true;
}

function technicalDemandPublic_(demand){
  var out = strip_(demand);
  var area = demand.area_atual_id ? find_("areas_tecnicas", "id", demand.area_atual_id) : null;
  var role = demand.cargo_atual_id ? find_("cargos_tecnicos", "id", demand.cargo_atual_id) : null;
  var assignee = demand.responsavel_atual_id ? find_("usuarios", "id", demand.responsavel_atual_id) : null;
  var now = Date.now();
  var responseDeadline = new Date(clean_(demand.prazo_primeira_resposta_em)).getTime();
  var resolutionDeadline = new Date(clean_(demand.prazo_resolucao_em)).getTime();
  out.area_atual_nome = clean_(area && area.nome);
  out.cargo_atual_nome = clean_(role && role.nome);
  out.responsavel_atual_nome = clean_(assignee && assignee.nome);
  out.sla_resposta_atrasado = !!(responseDeadline && !clean_(demand.primeiro_atendimento_em) && responseDeadline < now);
  out.sla_resolucao_atrasado = !!(resolutionDeadline && TECH_FINAL_STATUSES.indexOf(upper_(demand.status)) < 0 && resolutionDeadline < now);
  return out;
}

function technicalListDemands_(p, auth, adminOnly){
  if(adminOnly) technicalRequireAdmin_(auth); else technicalRequireManager_(auth);
  technicalEnsureSchema_();
  var identity = technicalIdentity_(auth);
  var statuses = clean_(p.status).split(",").map(upper_).filter(Boolean);
  var demands = rows_("demandas_tecnicas", true).filter(function(demand){
    if(!adminOnly && !technicalDemandAccessible_(demand, identity)) return false;
    if(statuses.length && statuses.indexOf(upper_(demand.status)) < 0) return false;
    if(clean_(p.tipo) && upper_(demand.tipo) !== upper_(p.tipo)) return false;
    return true;
  }).sort(function(a,b){
    var score = priorityScore_(b.prioridade) - priorityScore_(a.prioridade);
    return score || clean_(a.criado_em).localeCompare(clean_(b.criado_em));
  });
  var limit = Math.max(1, Math.min(num_(p.limite, 200), 500));
  return {total:demands.length, demandas:demands.slice(0, limit).map(technicalDemandPublic_)};
}

function adminDemandasTecnicasListar_(p, auth){ return technicalListDemands_(p, auth, true); }
function gestorDemandasListar_(p, auth){ return technicalListDemands_(p, auth, false); }

function gestorContextoTecnico_(p, auth){
  technicalRequireManager_(auth);
  technicalEnsureSchema_();
  var identity = technicalIdentity_(auth);
  return {
    identidade:identity,
    areas:rows_("areas_tecnicas", true).filter(function(item){ return upper_(item.status) === ST.ATIVO; }).map(strip_),
    cargos:rows_("cargos_tecnicos", true).filter(function(item){ return upper_(item.status) === ST.ATIVO; }).map(strip_),
    pode_encaminhar:true,
    pode_assinar:identity.perfil === ROLE.ADMIN || identity.pode_assinar
  };
}

function gestorDemandaDetalhe_(p, auth){
  technicalRequireManager_(auth);
  technicalEnsureSchema_();
  req_(p, ["demanda_id"]);
  var identity = technicalIdentity_(auth);
  var demand = technicalRequireDemand_(p.demanda_id, identity);
  var transitions = rows_("demanda_tramitacoes", true).filter(function(item){ return String(item.demanda_id) === String(demand.id); }).sort(function(a,b){ return num_(a.sequencia,0)-num_(b.sequencia,0); }).map(strip_);
  var signatures = rows_("assinaturas_tecnicas", true).filter(function(item){ return String(item.demanda_id) === String(demand.id) && !clean_(item.revogado_em); }).map(strip_);
  var analyses = rows_("analises_tecnicas", true).filter(function(item){ return String(item.demanda_id) === String(demand.id); }).map(strip_);
  return {demanda:technicalDemandPublic_(demand), tramitacoes:transitions, assinaturas:signatures, analises:analyses};
}

function gestorDemandaAssumir_(p, auth){
  technicalRequireManager_(auth);
  technicalEnsureSchema_();
  req_(p, ["demanda_id"]);
  var identity = technicalIdentity_(auth);
  var demand = technicalRequireDemand_(p.demanda_id, identity);
  technicalAssertDemandOpen_(demand);
  if(clean_(demand.responsavel_atual_id) && String(demand.responsavel_atual_id) !== String(identity.usuario_id)){
    err_("TECH_DEMAND_ALREADY_ASSIGNED", "A demanda jÃ¡ possui outro responsÃ¡vel.", 409);
  }
  var patch = {responsavel_atual_id:identity.usuario_id, status:TECH_DEMAND_STATUS.EM_TRIAGEM, atualizado_em:now_()};
  if(!clean_(demand.primeiro_atendimento_em)) patch.primeiro_atendimento_em = now_();
  update_("demandas_tecnicas", demand.__rowIndex, patch);
  technicalAppendTransition_(Object.assign({}, demand, patch), "ASSUMIDA", identity, identity, "", clean_(p.parecer), "");
  return {assumed:true, demanda:technicalDemandPublic_(Object.assign({}, demand, patch))};
}

function gestorDemandaEncaminhar_(p, auth){
  technicalRequireManager_(auth);
  technicalEnsureSchema_();
  req_(p, ["demanda_id","para_area_id","motivo"]);
  if(clean_(p.motivo).length < 5) err_("TECH_FORWARD_REASON_REQUIRED", "Informe o motivo tÃ©cnico do encaminhamento.", 400);
  var identity = technicalIdentity_(auth);
  var demand = technicalRequireDemand_(p.demanda_id, identity);
  technicalAssertDemandOpen_(demand);
  var area = technicalActiveArea_(p.para_area_id);
  technicalActiveRole_(p.para_cargo_id, area.id);
  var targetUser = p.para_usuario_id ? find_("usuarios", "id", p.para_usuario_id) : null;
  if(p.para_usuario_id && (!targetUser || upper_(targetUser.status) !== ST.ATIVO || upper_(targetUser.perfil) !== ROLE.GESTOR)){
    err_("TECH_ASSIGNEE_INVALID", "ResponsÃ¡vel de destino invÃ¡lido.", 400);
  }
  if(targetUser && clean_(targetUser.area_id) && String(targetUser.area_id) !== String(area.id)){
    err_("TECH_ASSIGNEE_AREA_MISMATCH", "O responsÃ¡vel nÃ£o pertence Ã  Ã¡rea de destino.", 400);
  }
  var patch = {
    area_atual_id:area.id, cargo_atual_id:clean_(p.para_cargo_id),
    responsavel_atual_id:clean_(p.para_usuario_id), status:TECH_DEMAND_STATUS.ENCAMINHADA,
    primeiro_atendimento_em:clean_(demand.primeiro_atendimento_em) || now_(), atualizado_em:now_()
  };
  update_("demandas_tecnicas", demand.__rowIndex, patch);
  technicalAppendTransition_(Object.assign({}, demand, patch), "ENCAMINHADA", identity, {
    area_id:patch.area_atual_id, cargo_id:patch.cargo_atual_id, usuario_id:patch.responsavel_atual_id
  }, "", clean_(p.parecer), clean_(p.motivo));
  technicalNotify_({usuario_id:patch.responsavel_atual_id, area_id:patch.responsavel_atual_id ? "" : patch.area_atual_id, cargo_id:patch.cargo_atual_id}, "DEMANDA_ENCAMINHADA", demand.titulo, "Demanda encaminhada por " + identity.nome + ".", "demandas_tecnicas", demand.id, demand.prioridade);
  audit_(auth, "TECH_DEMAND_FORWARDED", "demandas_tecnicas", demand.id, strip_(demand), Object.assign({}, strip_(demand), patch), clean_(p.user_agent));
  return {forwarded:true, demanda:technicalDemandPublic_(Object.assign({}, demand, patch))};
}

function gestorDemandaAssinar_(p, auth){
  technicalRequireManager_(auth);
  technicalEnsureSchema_();
  req_(p, ["demanda_id","declaracao"]);
  var identity = technicalIdentity_(auth);
  if(identity.perfil !== ROLE.ADMIN && !identity.pode_assinar){
    err_("TECH_SIGNATURE_NOT_ALLOWED", "Seu cargo tÃ©cnico nÃ£o possui permissÃ£o para assinar.", 403);
  }
  var demand = technicalRequireDemand_(p.demanda_id, identity);
  technicalAssertDemandOpen_(demand);
  if(!bool_(demand.exige_assinatura)) err_("TECH_SIGNATURE_NOT_REQUIRED", "Esta demanda nÃ£o exige assinatura.", 409);
  if(bool_(demand.exige_segregacao) && String(demand.criado_por) === String(identity.usuario_id)){
    err_("TECH_SIGNATURE_SEGREGATION", "O autor da demanda nÃ£o pode assinÃ¡-la quando hÃ¡ segregaÃ§Ã£o de funÃ§Ãµes.", 409);
  }
  var duplicate = rows_("assinaturas_tecnicas", true).find(function(item){
    return String(item.demanda_id) === String(demand.id) && String(item.usuario_id) === String(identity.usuario_id) && !clean_(item.revogado_em);
  });
  if(duplicate) return {signed:true, already_signed:true, assinatura:strip_(duplicate), demanda:technicalDemandPublic_(demand)};
  var signature = fit_("assinaturas_tecnicas", {
    id:uuid_("AST"), demanda_id:demand.id, entidade_tipo:demand.entidade_tipo,
    entidade_id:demand.entidade_id, versao_entidade:demand.versao_entidade,
    usuario_id:identity.usuario_id, perfil:identity.perfil, area_id:identity.area_id,
    cargo_id:identity.cargo_id, significado:upper_(p.significado || "VALIDACAO_TECNICA"),
    declaracao:clean_(p.declaracao), payload_hash:demand.payload_hash,
    criado_em:now_(), revogado_em:"", motivo_revogacao:""
  });
  append_("assinaturas_tecnicas", signature);
  var count = rows_("assinaturas_tecnicas", true).filter(function(item){
    return String(item.demanda_id) === String(demand.id) && !clean_(item.revogado_em) && String(item.payload_hash) === String(demand.payload_hash);
  }).length;
  var patch = {assinaturas_realizadas:count, primeiro_atendimento_em:clean_(demand.primeiro_atendimento_em) || now_(), atualizado_em:now_()};
  if(count >= num_(demand.assinaturas_necessarias, 1)) patch.status = TECH_DEMAND_STATUS.EM_VALIDACAO;
  update_("demandas_tecnicas", demand.__rowIndex, patch);
  technicalAppendTransition_(Object.assign({}, demand, patch), "ASSINADA", identity, identity, "ASSINAR", p.declaracao, "");
  audit_(auth, "TECH_DEMAND_SIGNED", "assinaturas_tecnicas", signature.id, null, signature, clean_(p.user_agent));
  return {signed:true, already_signed:false, assinatura:signature, demanda:technicalDemandPublic_(Object.assign({}, demand, patch))};
}

function technicalApplyApprovedEntity_(demand, identity){
  var type = upper_(demand.entidade_tipo);
  if(["CHECKLIST_MODELO","PLANO_MANUTENCAO","PLANO_CHECKLIST"].indexOf(type) >= 0){
    var plan = find_("planos_manutencao", "id", demand.entidade_id);
    if(plan){
      update_("planos_manutencao", plan.__rowIndex, {
        workflow_status:ST.VALIDADO, validado_gestao:"SIM", validado_por:identity.usuario_id,
        validado_em:now_(), status:ST.ATIVO, atualizado_em:now_()
      });
    }
  }
}

function gestorDemandaDecidir_(p, auth){
  technicalRequireManager_(auth);
  technicalEnsureSchema_();
  req_(p, ["demanda_id","decisao","parecer"]);
  var identity = technicalIdentity_(auth);
  var demand = technicalRequireDemand_(p.demanda_id, identity);
  technicalAssertDemandOpen_(demand);
  var decision = upper_(p.decisao);
  if(["APROVAR","DEVOLVER_ADMIN","LIBERAR_OPERACAO"].indexOf(decision) < 0){
    err_("TECH_DECISION_INVALID", "DecisÃ£o deve ser APROVAR, DEVOLVER_ADMIN ou LIBERAR_OPERACAO.", 400);
  }
  if(clean_(p.parecer).length < 5) err_("TECH_OPINION_REQUIRED", "Registre um parecer tÃ©cnico objetivo.", 400);
  if(bool_(demand.exige_segregacao) && String(demand.criado_por) === String(identity.usuario_id)){
    err_("TECH_DECISION_SEGREGATION", "O autor nÃ£o pode aprovar a prÃ³pria demanda.", 409);
  }
  if(decision !== "DEVOLVER_ADMIN" && bool_(demand.exige_assinatura) && num_(demand.assinaturas_realizadas,0) < num_(demand.assinaturas_necessarias,1)){
    err_("TECH_SIGNATURES_PENDING", "Ainda existem assinaturas tÃ©cnicas obrigatÃ³rias pendentes.", 409);
  }
  var status = decision === "DEVOLVER_ADMIN"
    ? TECH_DEMAND_STATUS.DEVOLVIDA_ADMIN
    : (decision === "LIBERAR_OPERACAO" ? TECH_DEMAND_STATUS.LIBERADA_OPERACAO : TECH_DEMAND_STATUS.APROVADA);
  var patch = {
    status:status, primeiro_atendimento_em:clean_(demand.primeiro_atendimento_em) || now_(),
    concluido_em:now_(), atualizado_em:now_()
  };
  update_("demandas_tecnicas", demand.__rowIndex, patch);
  technicalAppendTransition_(Object.assign({}, demand, patch), "DECIDIDA", identity, {}, decision, p.parecer, p.motivo);
  if(decision !== "DEVOLVER_ADMIN") technicalApplyApprovedEntity_(demand, identity);
  technicalNotify_({perfil:ROLE.ADMIN}, "DECISAO_TECNICA", demand.titulo, "DecisÃ£o: " + decision + ". Parecer: " + clean_(p.parecer), "demandas_tecnicas", demand.id, demand.prioridade);
  audit_(auth, "TECH_DEMAND_DECIDED", "demandas_tecnicas", demand.id, strip_(demand), Object.assign({}, strip_(demand), patch), clean_(p.user_agent));
  return {decided:true, decisao:decision, demanda:technicalDemandPublic_(Object.assign({}, demand, patch))};
}

function gestorAnaliseSalvar_(p, auth){
  technicalRequireManager_(auth);
  technicalEnsureSchema_();
  var data = Object.assign({}, p.analise || p.dados || p);
  req_(data, ["ocorrencia_id","titulo","diagnostico","recomendacao"]);
  var identity = technicalIdentity_(auth);
  var occurrence = find_("ocorrencias_operacionais", "id", data.ocorrencia_id);
  if(!occurrence) err_("OCCURRENCE_NOT_FOUND", "OcorrÃªncia operacional nÃ£o encontrada.", 404);
  var old = data.id ? find_("analises_tecnicas", "id", data.id) : null;
  if(old && String(old.autor_id) !== String(identity.usuario_id) && identity.perfil !== ROLE.ADMIN){
    err_("TECH_ANALYSIS_FORBIDDEN", "Somente o autor pode editar esta anÃ¡lise.", 403);
  }
  if(old && upper_(old.status) !== ST.RASCUNHO) err_("TECH_ANALYSIS_LOCKED", "AnÃ¡lise enviada nÃ£o pode ser alterada.", 409);
  var saved = fit_("analises_tecnicas", Object.assign({}, old || {}, {
    id:old ? old.id : uuid_("ANT"), demanda_id:clean_(data.demanda_id),
    ocorrencia_id:occurrence.id, ativo_id:clean_(data.ativo_id || occurrence.ativo_id),
    componente_id:clean_(data.componente_id || occurrence.componente_id), autor_id:identity.usuario_id,
    area_id:identity.area_id, cargo_id:identity.cargo_id, titulo:clean_(data.titulo),
    diagnostico:clean_(data.diagnostico), risco:clean_(data.risco),
    causa_provavel:clean_(data.causa_provavel), recomendacao:clean_(data.recomendacao),
    recomenda_checklist:bool_(data.recomenda_checklist) ? "SIM" : "NAO",
    recomenda_os:bool_(data.recomenda_os) ? "SIM" : "NAO",
    prioridade:upper_(data.prioridade || occurrence.severidade || "MEDIA"), status:ST.RASCUNHO,
    enviado_admin_em:"", criado_em:old ? old.criado_em : now_(), atualizado_em:now_()
  }));
  if(old) update_("analises_tecnicas", old.__rowIndex, saved); else append_("analises_tecnicas", saved);
  update_("ocorrencias_operacionais", occurrence.__rowIndex, {status:"EM_ANALISE_TECNICA", atualizado_em:now_()});
  audit_(auth, old ? "TECH_ANALYSIS_UPDATED" : "TECH_ANALYSIS_CREATED", "analises_tecnicas", saved.id, old && strip_(old), saved, clean_(p.user_agent));
  return {saved:true, analise:saved};
}

function gestorAnaliseEnviarAdmin_(p, auth){
  technicalRequireManager_(auth);
  technicalEnsureSchema_();
  req_(p, ["analise_id"]);
  var identity = technicalIdentity_(auth);
  var analysis = find_("analises_tecnicas", "id", p.analise_id);
  if(!analysis) err_("TECH_ANALYSIS_NOT_FOUND", "AnÃ¡lise tÃ©cnica nÃ£o encontrada.", 404);
  if(String(analysis.autor_id) !== String(identity.usuario_id) && identity.perfil !== ROLE.ADMIN){
    err_("TECH_ANALYSIS_FORBIDDEN", "Somente o autor pode enviar esta anÃ¡lise.", 403);
  }
  if(upper_(analysis.status) !== ST.RASCUNHO) return {sent:true, already_sent:true, analise:strip_(analysis)};
  var patch = {status:"ENVIADA_ADMIN", enviado_admin_em:now_(), atualizado_em:now_()};
  update_("analises_tecnicas", analysis.__rowIndex, patch);
  var occurrence = find_("ocorrencias_operacionais", "id", analysis.ocorrencia_id);
  if(occurrence) update_("ocorrencias_operacionais", occurrence.__rowIndex, {status:"ANALISADA_TECNICAMENTE", atualizado_em:now_()});
  technicalNotify_({perfil:ROLE.ADMIN}, "ANALISE_TECNICA", analysis.titulo, "AnÃ¡lise tÃ©cnica recebida com recomendaÃ§Ã£o para decisÃ£o administrativa.", "analises_tecnicas", analysis.id, analysis.prioridade);
  audit_(auth, "TECH_ANALYSIS_SENT_ADMIN", "analises_tecnicas", analysis.id, strip_(analysis), Object.assign({}, strip_(analysis), patch), clean_(p.user_agent));
  return {sent:true, already_sent:false, analise:Object.assign({}, strip_(analysis), patch)};
}

function adminAnalisesTecnicasListar_(p, auth){
  technicalRequireAdmin_(auth);
  technicalEnsureSchema_();
  var status = upper_(p.status);
  var analyses = rows_("analises_tecnicas", true).filter(function(item){ return !status || upper_(item.status) === status; }).sort(sortByDateDesc_("atualizado_em")).map(strip_);
  return {total:analyses.length, analises:analyses};
}

function adminAnaliseConverterChecklist_(p, auth){
  technicalRequireAdmin_(auth);
  technicalEnsureSchema_();
  req_(p, ["analise_id","plano","itens"]);
  var analysis = find_("analises_tecnicas", "id", p.analise_id);
  if(!analysis) err_("TECH_ANALYSIS_NOT_FOUND", "AnÃ¡lise tÃ©cnica nÃ£o encontrada.", 404);
  if(["ENVIADA_ADMIN","EM_TRATAMENTO_ADMIN"].indexOf(upper_(analysis.status)) < 0){
    err_("TECH_ANALYSIS_STATUS_INVALID", "A anÃ¡lise nÃ£o estÃ¡ disponÃ­vel para conversÃ£o.", 409);
  }
  var plan = Object.assign({}, p.plano || {});
  plan.ativo_id = clean_(plan.ativo_id || analysis.ativo_id);
  plan.componente_id = clean_(plan.componente_id || analysis.componente_id);
  plan.nome = clean_(plan.nome || analysis.titulo);
  var saved = adminSalvarModeloChecklist_({plano:plan, itens:p.itens, __auth:auth});
  update_("analises_tecnicas", analysis.__rowIndex, {status:"CONVERTIDA_CHECKLIST", atualizado_em:now_()});
  audit_(auth, "TECH_ANALYSIS_CONVERTED_CHECKLIST", "analises_tecnicas", analysis.id, strip_(analysis), {status:"CONVERTIDA_CHECKLIST", plano_id:saved.plano.id}, clean_(p.user_agent));
  return {converted:true, analise_id:analysis.id, plano:saved.plano, itens:saved.itens};
}

function gestorNotificacoesListar_(p, auth){
  technicalRequireManager_(auth);
  technicalEnsureSchema_();
  var status = upper_(p.status);
  var identity = technicalIdentity_(auth);
  var items = rows_("notificacoes", true).filter(function(item){
    if(String(item.usuario_id) !== String(identity.usuario_id)) return false;
    return !status || upper_(item.status) === status;
  }).sort(sortByDateDesc_("criado_em"));
  var limit = Math.max(1, Math.min(num_(p.limite, 100), 300));
  return {total:items.length, notificacoes:items.slice(0, limit).map(strip_)};
}

function gestorNotificacaoMarcarLida_(p, auth){
  technicalRequireManager_(auth);
  technicalEnsureSchema_();
  req_(p, ["notificacao_id"]);
  var item = find_("notificacoes", "id", p.notificacao_id);
  if(!item || String(item.usuario_id) !== String(auth.usuario_id)) err_("NOTIFICATION_NOT_FOUND", "NotificaÃ§Ã£o nÃ£o encontrada.", 404);
  if(upper_(item.status) === "LIDA") return {read:true, already_read:true, notificacao_id:item.id};
  update_("notificacoes", item.__rowIndex, {status:"LIDA", lida_em:now_()});
  return {read:true, already_read:false, notificacao_id:item.id};
}

function technicalSecondsBetween_(start, end){
  var startMs = new Date(clean_(start)).getTime();
  var endMs = new Date(clean_(end)).getTime();
  return startMs && endMs && endMs >= startMs ? Math.round((endMs - startMs) / 1000) : 0;
}

function technicalClamp_(value, minimum, maximum){
  return Math.max(minimum, Math.min(maximum, value));
}

function technicalAverage_(values){
  return values.length ? values.reduce(function(sum, value){ return sum + value; }, 0) / values.length : null;
}

function technicalAggregateKpis_(input){
  var observationSeconds = Math.max(0, num_(input.observation_seconds, 0));
  var downtimeSeconds = Math.max(0, num_(input.downtime_seconds, 0));
  var operatingSeconds = Math.max(0, observationSeconds - downtimeSeconds);
  var failures = Math.max(0, num_(input.failures, 0));
  var repairSeconds = Math.max(0, num_(input.repair_seconds, 0));
  var production = input.production || [];
  var plannedProduction = production.reduce(function(sum, row){ return sum + Math.max(0, num_(row.tempo_planejado_segundos,0)); },0);
  var operationProduction = production.reduce(function(sum, row){ return sum + Math.max(0, num_(row.tempo_operacao_segundos,0)); },0);
  var idealOutputSeconds = production.reduce(function(sum, row){
    return sum + Math.max(0, num_(row.ciclo_ideal_segundos,0)) * Math.max(0, num_(row.quantidade_total,0));
  },0);
  var totalQuantity = production.reduce(function(sum, row){ return sum + Math.max(0, num_(row.quantidade_total,0)); },0);
  var goodQuantity = production.reduce(function(sum, row){ return sum + Math.max(0, num_(row.quantidade_boas,0)); },0);
  var oeeAvailable = plannedProduction > 0 && operationProduction > 0 && totalQuantity > 0;
  var availability = oeeAvailable ? technicalClamp_(operationProduction / plannedProduction, 0, 1) : null;
  var performance = oeeAvailable ? technicalClamp_(idealOutputSeconds / operationProduction, 0, 1) : null;
  var quality = oeeAvailable ? technicalClamp_(goodQuantity / totalQuantity, 0, 1) : null;
  var slaResponseEligible = (input.sla_response || []).filter(function(item){ return item.eligible; });
  var slaResolutionEligible = (input.sla_resolution || []).filter(function(item){ return item.eligible; });
  return {
    disponibilidade_pct:observationSeconds > 0 ? technicalClamp_(operatingSeconds / observationSeconds * 100, 0, 100) : null,
    tempo_observado_segundos:observationSeconds,
    tempo_operacao_segundos:operatingSeconds,
    tempo_parada_segundos:downtimeSeconds,
    falhas_nao_planejadas:failures,
    mttr_segundos:failures > 0 ? Math.round(repairSeconds / failures) : null,
    mtbf_segundos:failures > 0 ? Math.round(operatingSeconds / failures) : null,
    lead_time_os_segundos:technicalAverage_(input.os_lead_times || []),
    lead_time_demanda_segundos:technicalAverage_(input.demand_lead_times || []),
    sla_resposta_pct:slaResponseEligible.length ? slaResponseEligible.filter(function(item){ return item.met; }).length / slaResponseEligible.length * 100 : null,
    sla_resolucao_pct:slaResolutionEligible.length ? slaResolutionEligible.filter(function(item){ return item.met; }).length / slaResolutionEligible.length * 100 : null,
    sla_resposta_amostra:slaResponseEligible.length,
    sla_resolucao_amostra:slaResolutionEligible.length,
    oee_disponivel:oeeAvailable,
    oee_pct:oeeAvailable ? availability * performance * quality * 100 : null,
    oee_disponibilidade_pct:oeeAvailable ? availability * 100 : null,
    oee_performance_pct:oeeAvailable ? performance * 100 : null,
    oee_qualidade_pct:oeeAvailable ? quality * 100 : null,
    producao_amostra:production.length
  };
}

function cmmsKpisTecnicos_(p, auth){
  technicalRequireManager_(auth);
  technicalEnsureSchema_();
  var endMs = clean_(p.fim_em) ? new Date(clean_(p.fim_em)).getTime() : Date.now();
  var startMs = clean_(p.inicio_em) ? new Date(clean_(p.inicio_em)).getTime() : endMs - 30 * 86400000;
  if(!startMs || !endMs || startMs >= endMs) err_("KPI_PERIOD_INVALID", "PerÃ­odo de indicadores invÃ¡lido.", 400);
  var assetId = clean_(p.ativo_id);
  var activeAssets = rows_("ativos", true).filter(function(asset){
    return (!assetId || String(asset.id) === String(assetId)) && upper_(asset.status || ST.ATIVO) !== ST.INATIVO;
  });
  var assetCount = Math.max(1, activeAssets.length);
  var stops = rows_("paradas_equipamento", true).filter(function(stop){
    if(assetId && String(stop.ativo_id) !== String(assetId)) return false;
    var started = new Date(clean_(stop.iniciada_em)).getTime();
    return started && started >= startMs && started <= endMs;
  });
  var unplanned = stops.filter(function(stop){
    var classification = upper_(stop.tipo || stop.origem);
    return classification.indexOf("PLANEJ") < 0 && classification.indexOf("PREVENT") < 0;
  });
  var downtime = unplanned.reduce(function(sum, stop){
    return sum + Math.max(0, num_(stop.tempo_parada_segundos, technicalSecondsBetween_(stop.iniciada_em, stop.finalizada_em || iso_(new Date(endMs)))));
  },0);
  var repair = unplanned.reduce(function(sum, stop){
    return sum + Math.max(0, num_(stop.tempo_execucao_segundos, technicalSecondsBetween_(stop.manutencao_iniciada_em, stop.manutencao_finalizada_em)));
  },0);
  var orders = rows_("ordens_servico", true).filter(function(order){
    if(assetId && String(order.ativo_id) !== String(assetId)) return false;
    var closed = new Date(clean_(order.finalizada_em)).getTime();
    return closed && closed >= startMs && closed <= endMs;
  });
  var demands = rows_("demandas_tecnicas", true).filter(function(demand){
    var closed = new Date(clean_(demand.concluido_em)).getTime();
    return closed && closed >= startMs && closed <= endMs;
  });
  var nowMs = Date.now();
  var slaResponse = rows_("demandas_tecnicas", true).map(function(demand){
    var deadline = new Date(clean_(demand.prazo_primeira_resposta_em)).getTime();
    var actual = new Date(clean_(demand.primeiro_atendimento_em)).getTime();
    return {eligible:!!deadline && (!!actual || deadline < nowMs), met:!!actual && actual <= deadline};
  });
  var slaResolution = rows_("demandas_tecnicas", true).map(function(demand){
    var deadline = new Date(clean_(demand.prazo_resolucao_em)).getTime();
    var actual = new Date(clean_(demand.concluido_em)).getTime();
    return {eligible:!!deadline && (!!actual || deadline < nowMs), met:!!actual && actual <= deadline};
  });
  var production = rows_("apontamentos_producao", true).filter(function(row){
    if(assetId && String(row.ativo_id) !== String(assetId)) return false;
    var started = new Date(clean_(row.inicio_em)).getTime();
    return started && started >= startMs && started <= endMs;
  });
  var metrics = technicalAggregateKpis_({
    observation_seconds:Math.round((endMs - startMs) / 1000) * assetCount,
    downtime_seconds:downtime,
    repair_seconds:repair,
    failures:unplanned.length,
    os_lead_times:orders.map(function(order){ return technicalSecondsBetween_(order.aberta_em, order.finalizada_em); }).filter(function(value){ return value > 0; }),
    demand_lead_times:demands.map(function(demand){ return technicalSecondsBetween_(demand.criado_em, demand.concluido_em); }).filter(function(value){ return value > 0; }),
    sla_response:slaResponse,
    sla_resolution:slaResolution,
    production:production
  });
  return Object.assign({
    ativo_id:assetId || "TODOS", inicio_em:iso_(new Date(startMs)), fim_em:iso_(new Date(endMs)),
    ativos_considerados:activeAssets.length, metodologia:"MTBF/MTTR por falhas nÃ£o planejadas; OEE somente com apontamento de produÃ§Ã£o."
  }, metrics);
}
