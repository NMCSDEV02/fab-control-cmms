import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve(import.meta.dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/^\uFEFF/, '')
const assert = (condition, message) => {
  if (!condition) throw new Error(`Fluxo técnico E2E inválido: ${message}`)
}

let sequence = 0
const context = vm.createContext({
  console,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(_algorithm, value) {
      return [...crypto.createHash('sha256').update(String(value), 'utf8').digest()]
    },
    formatDate(date) {
      return new Date(date).toISOString().slice(0, 19)
    },
    getUuid() {
      sequence += 1
      return `${String(sequence).padStart(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`
    },
  },
  LockService: {
    getScriptLock() {
      return { tryLock() { return true }, releaseLock() {} }
    },
  },
})

vm.runInContext(
  [
    read('backend/apps-script/00_Config.js'),
    read('backend/apps-script/01_Utils.js'),
    read('backend/apps-script/25_Workflow_Tecnico_KPI.js'),
    read('backend/apps-script/28_Admin_Intervencoes.js'),
    `
      var TEST_DB = {
        usuarios: [
          {id:'USR-ADMIN',nome:'Admin',perfil:'ADMIN',status:'ATIVO',area_id:'',cargo_id:'',__rowIndex:2},
          {id:'USR-QUALIDADE',nome:'Gestora Qualidade',perfil:'GESTOR',status:'ATIVO',area_id:'AREA-QUALIDADE',cargo_id:'CARGO-QUALIDADE',__rowIndex:3},
          {id:'USR-MANUTENCAO',nome:'Gestor Manutencao',perfil:'GESTOR',status:'ATIVO',area_id:'AREA-MANUTENCAO',cargo_id:'CARGO-MANUTENCAO',__rowIndex:4},
          {id:'USR-OPERADOR',nome:'Operador',perfil:'OPERADOR',status:'ATIVO',area_id:'',cargo_id:'',__rowIndex:5}
        ],
        areas_tecnicas: [
          {id:'AREA-QUALIDADE',codigo:'QUALIDADE',nome:'Qualidade',status:'ATIVO',exige_assinatura_padrao:'SIM',__rowIndex:2},
          {id:'AREA-MANUTENCAO',codigo:'MANUTENCAO',nome:'Manutencao',status:'ATIVO',exige_assinatura_padrao:'NAO',__rowIndex:3}
        ],
        cargos_tecnicos: [
          {id:'CARGO-QUALIDADE',area_id:'AREA-QUALIDADE',nome:'Inspetor',status:'ATIVO',pode_assinar:'SIM',__rowIndex:2},
          {id:'CARGO-MANUTENCAO',area_id:'AREA-MANUTENCAO',nome:'Tecnico',status:'ATIVO',pode_assinar:'SIM',__rowIndex:3}
        ],
        sla_politicas: [{id:'SLA-ALTA',tipo_demanda:'',prioridade:'ALTA',area_id:'',resposta_minutos:30,resolucao_minutos:240,status:'ATIVO',__rowIndex:2}],
        demandas_tecnicas: [], demanda_tramitacoes: [], assinaturas_tecnicas: [],
        analises_tecnicas: [], notificacoes: [], audit_log: [],
        ocorrencias_operacionais: [{id:'OCR-1',ativo_id:'ATV-1',componente_id:'CMP-1',titulo:'Vibracao',descricao:'Vibracao elevada',severidade:'ALTA',status:'AGUARDANDO_ANALISE',__rowIndex:2}],
        planos_manutencao: [{id:'PLN-1',nome:'Inspecao critica',status:'INATIVO',workflow_status:'EM_VALIDACAO_GESTAO',__rowIndex:2}],
        ativos: [{id:'ATV-1',tag:'EQ-01',nome:'Prensa 01',status:'OPERANDO',__rowIndex:2}],
        componentes: [{id:'CMP-1',ativo_id:'ATV-1',tag:'MOTOR',nome:'Motor principal',status:'ATIVO',__rowIndex:2}],
        ordens_servico: [], os_acoes: [], historico: []
      };
      function technicalEnsureSchema_(){}
      function rows_(name){ return TEST_DB[name] || []; }
      function find_(name, key, value){ return rows_(name).find(function(row){ return String(row[key]) === String(value); }) || null; }
      function fit_(name, data){ var out = {}; SH[name].forEach(function(key){ out[key] = data[key] === undefined ? '' : data[key]; }); return out; }
      function append_(name, data){ if(!TEST_DB[name]) TEST_DB[name] = []; data.__rowIndex = TEST_DB[name].length + 2; TEST_DB[name].push(data); return data; }
      function update_(name, rowIndex, patch){ var row = rows_(name).find(function(item){ return item.__rowIndex === rowIndex; }); if(!row) throw new Error('Linha ausente: '+name+'#'+rowIndex); Object.assign(row, patch); }
      function configurationRuntimeValue_(key, fallback){ return fallback; }
      function audit_(){}
      function getSpreadsheet_(){ return {}; }
      function ensureSheet_(){}
      function adminRequireIdentityAdmin_(auth){ if(upper_(auth && auth.perfil) !== ROLE.ADMIN) err_('FORBIDDEN_ADMIN_REQUIRED','Somente ADMIN.',403); }
      function normalizaModoParadaManutencao115_(value){ var mode=upper_(value||'DECISAO_EXECUTOR'); return ['OBRIGATORIA','SEM_PARADA','DECISAO_EXECUTOR'].indexOf(mode)>=0?mode:'DECISAO_EXECUTOR'; }
      function hist_(data){ append_('historico', fit_('historico', Object.assign({id:uuid_('HIS'),criado_em:now_()},data))); }
    `,
  ].join('\n'),
  context,
)

const result = JSON.parse(vm.runInContext(`JSON.stringify((function(){
  var admin = {usuario_id:'USR-ADMIN',perfil:'ADMIN',nome:'Admin'};
  var quality = {usuario_id:'USR-QUALIDADE',perfil:'GESTOR',nome:'Gestora Qualidade'};
  var maintenance = {usuario_id:'USR-MANUTENCAO',perfil:'GESTOR',nome:'Gestor Manutencao'};

  var sent = adminDemandasTecnicasEnviar_({demanda:{
    tipo:'VALIDACAO_CHECKLIST', entidade_tipo:'CHECKLIST_MODELO', entidade_id:'PLN-1',
    titulo:'Validar inspecao critica', descricao:'Requer assinatura da qualidade', prioridade:'ALTA',
    area_atual_id:'AREA-QUALIDADE', cargo_atual_id:'CARGO-QUALIDADE', exige_segregacao:true,
    versao_entidade:'2'
  },__auth:admin}, admin);
  var demandId = sent.demanda.id;
  var qualityQueueBefore = gestorDemandasListar_({}, quality).demandas;
  var maintenanceQueueBefore = gestorDemandasListar_({}, maintenance).demandas;
  gestorDemandaAssumir_({demanda_id:demandId}, quality);
  gestorDemandaAssinar_({demanda_id:demandId,declaracao:'Conformidade de qualidade verificada.'}, quality);
  gestorDemandaEncaminhar_({demanda_id:demandId,para_area_id:'AREA-MANUTENCAO',para_cargo_id:'CARGO-MANUTENCAO',motivo:'Liberacao final pela manutencao.'}, quality);
  var maintenanceQueueAfter = gestorDemandasListar_({}, maintenance).demandas;
  var decision = gestorDemandaDecidir_({demanda_id:demandId,decisao:'LIBERAR_OPERACAO',parecer:'Checklist seguro e tecnicamente executavel.'}, maintenance);

  var analysis = gestorAnaliseSalvar_({analise:{
    ocorrencia_id:'OCR-1',titulo:'Analise de vibracao',diagnostico:'Desalinhamento provavel',
    risco:'Falha de rolamento',causa_provavel:'Acoplamento',recomendacao:'Criar checklist de alinhamento',
    recomenda_checklist:true,recomenda_os:true,prioridade:'ALTA'
  }}, quality);
  gestorAnaliseEnviarAdmin_({analise_id:analysis.analise.id}, quality);

  var interventionSaved = adminIntervencaoSalvar_({dados:{
    ativo_id:'ATV-1',componente_id:'CMP-1',tipo:'CORRETIVA',titulo:'Corrigir vibracao',
    descricao:'Inspecionar acoplamento e corrigir desalinhamento.',prioridade:'ALTA',
    modo_parada_manutencao:'OBRIGATORIA'
  }}, admin);
  var actionsBeforeRelease = rows_('os_acoes').length;
  var interventionSent = adminIntervencaoEnviarValidacao_({
    intervencao_id:interventionSaved.intervencao.id,area_atual_id:'AREA-MANUTENCAO',
    cargo_atual_id:'CARGO-MANUTENCAO',comentario:'Validar risco e liberar execucao.',
    exige_assinatura:'NAO',exige_segregacao:'SIM'
  }, admin);
  var interventionDecision = gestorDemandaDecidir_({
    demanda_id:interventionSent.demanda.id,decisao:'LIBERAR_OPERACAO',
    parecer:'Intervencao segura e liberada para o operador.'
  }, maintenance);
  var interventionOrder = find_('ordens_servico','id',interventionSaved.intervencao.id);
  var interventionAction = rows_('os_acoes').find(function(item){ return String(item.os_id) === String(interventionOrder.id); });

  return {
    demandId:demandId,
    qualityQueueBefore:qualityQueueBefore.length,
    maintenanceQueueBefore:maintenanceQueueBefore.length,
    maintenanceQueueAfter:maintenanceQueueAfter.length,
    decision:decision,
    demand:find_('demandas_tecnicas','id',demandId),
    plan:find_('planos_manutencao','id','PLN-1'),
    signatures:rows_('assinaturas_tecnicas'),
    transitions:rows_('demanda_tramitacoes').filter(function(item){ return String(item.demanda_id) === String(demandId); }),
    analysis:find_('analises_tecnicas','id',analysis.analise.id),
    occurrence:find_('ocorrencias_operacionais','id','OCR-1'),
    adminNotifications:rows_('notificacoes').filter(function(item){ return item.usuario_id === 'USR-ADMIN'; }),
    actionsBeforeRelease:actionsBeforeRelease,
    interventionDecision:interventionDecision,
    interventionOrder:interventionOrder,
    interventionAction:interventionAction
  };
})())`, context))

assert(result.qualityQueueBefore === 1, 'Qualidade não recebeu a demanda do administrador')
assert(result.maintenanceQueueBefore === 0, 'Manutenção viu demanda antes do encaminhamento')
assert(result.maintenanceQueueAfter === 1, 'Manutenção não recebeu a demanda encaminhada')
assert(result.signatures.length === 1, 'assinatura técnica não foi persistida')
assert(result.signatures[0].payload_hash === result.demand.payload_hash, 'assinatura não corresponde à versão/hash da demanda')
assert(result.transitions.length === 5, 'trilha deveria conter envio, aceite, assinatura, encaminhamento e decisão')
assert(result.demand.status === 'LIBERADA_OPERACAO', 'demanda não foi liberada ao operador')
assert(result.plan.status === 'ATIVO' && result.plan.workflow_status === 'VALIDADO', 'plano não foi ativado após aprovação')
assert(result.analysis.status === 'ENVIADA_ADMIN', 'análise de ocorrência não chegou ao administrador')
assert(result.occurrence.status === 'ANALISADA_TECNICAMENTE', 'ocorrência não foi encerrada pela análise')
assert(result.adminNotifications.length >= 2, 'administrador não recebeu decisão e análise')
assert(result.actionsBeforeRelease === 0, 'rascunho administrativo apareceu ao Operador antes da validação')
assert(result.interventionDecision.demanda.status === 'LIBERADA_OPERACAO', 'intervenção não recebeu liberação técnica')
assert(result.interventionOrder.status === 'ABERTA', 'OS não foi aberta depois da liberação')
assert(result.interventionAction.status === 'PENDENTE', 'ação não chegou ao Operador depois da liberação')
assert(result.interventionAction.modo_parada_manutencao === 'OBRIGATORIA', 'modo de parada não foi preservado')

console.log('FLUXO TÉCNICO E2E EM MEMÓRIA APROVADO')
console.log('ADMIN → QUALIDADE (assinatura) → MANUTENÇÃO (liberação) → OPERADOR')
console.log('OPERADOR (ocorrência) → GESTOR (análise) → ADMIN')
console.log('ADMIN (intervenção) → GESTOR (liberação) → OPERADOR (ação pendente)')
