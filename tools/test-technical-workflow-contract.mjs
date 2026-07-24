import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve(import.meta.dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/^\uFEFF/, '')
}

function assert(condition, message) {
  if (!condition) throw new Error(`Contrato técnico inválido: ${message}`)
}

function near(actual, expected, tolerance = 0.001) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance
}

const config = read('backend/apps-script/00_Config.js')
const router = read('backend/apps-script/03_Http_Auth.js')
const workflow = read('backend/apps-script/25_Workflow_Tecnico_KPI.js')
const gestorApi = read('frontend-gestor/src/services/api/gestor.ts')
const decisions = read('frontend-gestor/src/pages/GestorDecisionWorkspace.tsx')
const analytics = read('frontend-gestor/src/pages/GestorAnalyticsWorkspace.tsx')
const assetJourney = read('frontend-gestor/src/components/AssetJourneyPanel.tsx')
const checklistBuilder = read('frontend-gestor/src/components/AdminChecklistBuilder.tsx')
const notifications = read('frontend-gestor/src/components/NotificationCenter.tsx')
const gestorApp = read('frontend-gestor/src/app/App.tsx')
const technicalAnalysis = read('frontend-gestor/src/components/TechnicalAnalysisDialog.tsx')
const demandDialog = read('frontend-gestor/src/components/TechnicalDemandDialog.tsx')
const navigation = read('frontend-gestor/src/components/AppNavigation.tsx')
const gestorStyles = read('frontend-gestor/src/styles/global.css')
const operatorAction = read('frontend/src/pages/ActionDetailPage.tsx')
const operatorChecklist = read('frontend/src/pages/ChecklistExecutionPage.tsx')
const operatorContract = read('backend/apps-script/17_Consolidacao_Operacional_UI.js')
const interventionsApi = read('frontend-gestor/src/services/api/interventions.ts')
const interventionsBackend = read('backend/apps-script/28_Admin_Intervencoes.js')

const requiredSheets = [
  'areas_tecnicas',
  'cargos_tecnicos',
  'demandas_tecnicas',
  'demanda_tramitacoes',
  'assinaturas_tecnicas',
  'analises_tecnicas',
  'notificacoes',
  'turnos',
  'apontamentos_producao',
  'sla_politicas',
]

for (const sheet of requiredSheets) {
  assert(config.includes(`${sheet}: [`), `schema ausente: ${sheet}`)
}

for (const column of ['area_id', 'cargo_id', 'especialidades_json', 'escopo_ids_json']) {
  assert(config.includes(`"${column}"`), `dimensão de identidade ausente: ${column}`)
}

const requiredActions = [
  'cmms.workflow_tecnico_schema_upgrade',
  'cmms.kpis_tecnicos',
  'admin.demandas_tecnicas.enviar',
  'admin.analises_tecnicas.converter',
  'admin.intervencoes.listar',
  'admin.intervencoes.salvar',
  'admin.intervencoes.enviar_validacao',
  'gestor.contexto_tecnico',
  'gestor.demandas.listar',
  'gestor.demandas.assumir',
  'gestor.demandas.encaminhar',
  'gestor.demandas.assinar',
  'gestor.demandas.decidir',
  'gestor.analises.salvar',
  'gestor.analises.enviar_admin',
]

for (const action of requiredActions) {
  assert(router.includes(`case "${action}"`), `rota ausente: ${action}`)
  assert(config.includes(`"${action}"`), `permissão ausente: ${action}`)
}

for (const action of requiredActions.filter((action) => action.startsWith('admin.intervencoes.'))) {
  assert(interventionsApi.includes(`'${action}'`), `cliente de intervenção não usa ${action}`)
}

for (const action of requiredActions.filter((action) => action.startsWith('gestor.') || action === 'cmms.kpis_tecnicos')) {
  assert(gestorApi.includes(`'${action}'`), `cliente gestor não usa ${action}`)
}

assert(decisions.includes('Decisões de hoje'), 'modo Decisão não apresenta a fila técnica única')
assert(decisions.includes('PRÓXIMO PASSO'), 'fila não orienta a próxima decisão')
assert(decisions.includes('<option value="demands">Solicitações') && decisions.includes('<option value="operations">Ocorrências'), 'categorias da fila não estão unificadas')
assert(navigation.includes("label: 'Fila'"), 'navegação não expõe a fila técnica')
assert(navigation.includes("label: 'Indicadores'"), 'navegação não expõe os indicadores')
assert(navigation.includes("label: 'Conta'") && !navigation.includes("label: 'Mais'"), 'navegação mantém uma aba genérica')
assert(!gestorApp.includes('manager-mode-switch'), 'cabeçalho repete a navegação inferior')
assert(
  gestorStyles.includes('.manager-decision-workspace') &&
    gestorStyles.includes('height: calc(100dvh - 184px)') &&
    gestorStyles.includes('.manager-decision-queue::-webkit-scrollbar'),
  'workspace não controla altura e rolagem interna invisível',
)
assert(decisions.includes('setSelectedOccurrence'), 'ocorrência não abre análise técnica')
assert(demandDialog.includes('Assumir e continuar'), 'fluxo não orienta o primeiro aceite')
assert(demandDialog.includes('Assinaturas concluídas'), 'fluxo não evidencia o gate de assinatura')
assert(demandDialog.includes('O QUE VOCÊ PRECISA FAZER AGORA'), 'decisão técnica não possui orientação')
assert(demandDialog.includes('RESUMO PARA O OPERADOR'), 'liberação não revisa o briefing do Operador')
assert(demandDialog.includes('Pedir ajuste') && demandDialog.includes('Adicionar observação'), 'alternativas da decisão simples estão ausentes')
assert(
  demandDialog.includes('getGestorChecklistModelDetail') &&
    demandDialog.includes('CHECKLIST ENVIADO PELO ADMINISTRADOR') &&
    demandDialog.includes('checklistDetail.itens.map') &&
    demandDialog.includes('simple-checklist-detail-dialog') &&
    demandDialog.includes('Concluir leitura'),
  'Gestor não consegue abrir as etapas do checklist roteado pelo Administrador',
)
assert(
  workflow.includes(
    '!adminOnly && !statuses.length && TECH_FINAL_STATUSES.indexOf(upper_(demand.status)) >= 0',
  ),
  'fila do Gestor inclui demandas encerradas quando nenhum estado e informado',
)
assert(
  gestorApi.includes('OPEN_TECHNICAL_DEMAND_STATUSES.join') &&
    gestorApi.includes('FINAL_TECHNICAL_DEMAND_STATUSES.has'),
  'cliente Gestor nao protege a fila contra demandas encerradas',
)
assert(
  decisions.includes('routedChecklistIds') &&
    decisions.includes('standaloneModels'),
  'fila de decisão duplica checklist roteado como solicitação e modelo',
)
assert(
  interventionsBackend.includes('adminIntervencaoRequireExecutablePlan_') &&
    interventionsBackend.includes('plano_id:executablePlan.plan.id') &&
    interventionsBackend.includes('INTERVENTION_CHECKLIST_REQUIRED'),
  'intervenção pode ser liberada sem checklist validado',
)
assert(
  operatorContract.includes('operationalPlanIds') &&
    operatorContract.includes('planItemCounts') &&
    operatorContract.includes('!clean_(a.plano_id)'),
  'fila do Operador aceita ação sem checklist executável',
)
assert(
  config.includes('ordens_servico: ["id", "codigo", "ativo_id", "componente_id", "plano_id"'),
  'ordem de serviço não persiste o vínculo com o checklist',
)
assert(analytics.includes("label: 'MTBF'"), 'modo Analítico não exibe MTBF')
assert(analytics.includes("label: 'Lead time'"), 'modo Analítico não exibe lead time')
assert(analytics.includes("label: 'SLA de resposta'"), 'modo Analítico não exibe SLA')
assert(analytics.includes("'Sem produção'"), 'OEE sem amostra não é diferenciado de zero')
assert(analytics.includes('período anterior'), 'painel não compara tendências')
assert(analytics.includes('Todos os ativos'), 'painel não permite recorte por ativo')
assert(analytics.includes("'monitoring'") && analytics.includes("'critical'") && analytics.includes("'library'"), 'áreas analíticas não estão separadas em abas')
assert(gestorApi.includes('getGestorTechnicalKpisForPeriod'), 'cliente não envia período e ativo aos KPIs')
assert(gestorApi.includes('getGestorAssetJourney') && gestorApi.includes("'operador.contexto_qr'"), 'ficha do ativo não usa o contexto técnico real')
assert(assetJourney.includes('Faixas configuradas') && assetJourney.includes('Últimas alterações') && assetJourney.includes('Histórico'), 'jornada completa do ativo está incompleta')
assert(checklistBuilder.includes('QUICK_ITEM_TYPES') && checklistBuilder.includes('admin-checklist-quick-types'), 'construtor não possui criação rápida por tipo')
assert(
  checklistBuilder.includes('admin-checklist-routing-dialog') &&
    checklistBuilder.includes('role="dialog"') &&
    checklistBuilder.includes('Definir filtro técnico'),
  'filtro técnico não abre em um popup dedicado',
)
for (const responseType of [
  'OK_NOK',
  'CONFIRMACAO',
  'NUMERO',
  'PARAMETRO',
  'TEXTO',
  'SELECAO',
  'EVIDENCIA',
  'LEITURA_OPERACIONAL',
  'INSTRUCAO',
]) {
  assert(
    checklistBuilder.includes(`value: '${responseType}'`),
    `criação rápida não oferece ${responseType}`,
  )
  assert(
    operatorChecklist.includes(`'${responseType}'`),
    `Operador não reconhece ${responseType}`,
  )
}
assert(
  operatorChecklist.includes('aria-pressed={currentDraft.answer === option}') &&
    operatorChecklist.includes('aria-labelledby={currentItemTitleId}') &&
    operatorChecklist.includes('aria-live="polite"'),
  'respostas do Operador não possuem os contratos mínimos de acessibilidade',
)
assert(gestorApi.includes('getGestorNotifications') && gestorApi.includes('markGestorNotificationRead'), 'central de notificações não usa o backend real')
assert(gestorApp.includes('notification.entidade_tipo') && notifications.includes('NAO_LIDA'), 'notificações não preservam contexto e leitura')
assert(
  analytics.includes('ATENÇÃO AGORA') &&
    analytics.includes('TRABALHO EM CAMPO') &&
    analytics.includes('Acompanhar ativo'),
  'acompanhamento do Gestor não apresenta desvios e execuções em campo',
)
assert(technicalAnalysis.includes('relatorio_tecnico: brief'), 'análise assistida não envia o relatório estruturado')
assert(workflow.includes('TECH_SIGNATURE_SEGREGATION'), 'segregação de assinatura ausente')
assert(workflow.includes('payload_hash'), 'assinatura não está vinculada ao hash do payload')
assert(config.includes('"analise_tecnica_json"') && config.includes('"relatorio_tecnico_json"'), 'schema não persiste o briefing técnico')
assert(workflow.includes('technicalAttachBriefToDemandEntity_'), 'decisão do Gestor não vincula o briefing à intervenção')
assert(interventionsBackend.includes('analise_tecnica_json:clean_(order.analise_tecnica_json)'), 'liberação não propaga o briefing para a ação')
assert(operatorContract.includes('analise_tecnica:CMMS110_technicalBrief_'), 'tela do Operador não recebe o briefing técnico')
assert(operatorAction.includes("titulo: 'Preparar e isolar'") && operatorAction.includes('technical-requirements-grid'), 'Operador não possui etapas e requisitos seguros de fallback')
assert(operatorAction.includes('technicalFacts.map') && !operatorAction.includes("<span>Duração prevista</span><strong>{detail.plano?.tempo_estimado_min"), 'análise do Operador ainda exibe fatos técnicos vazios')
assert(workflow.includes('workflow.tecnico.text.repair.version'), 'catálogo técnico não versiona a correção de acentuação')
assert(workflow.includes('technicalLooksMojibake_'), 'catálogo técnico não detecta textos legados corrompidos')
assert(workflow.includes('var roleId = eid_("CTEC", definition.codigo)'), 'correção de cargos não preserva o identificador estável')
assert(!workflow.includes('tÃ©cnic') && !workflow.includes('ocorrÃªncia') && !workflow.includes('produÃ§Ã£o'), 'workflow ainda contém acentuação UTF-8 corrompida')
assert(interventionsBackend.includes('ADMIN_INTERVENTION_WAITING'), 'intervenção não possui estado de validação')
assert(interventionsBackend.includes('adminIntervencaoLiberarOperacao_'), 'liberação técnica não cria ação operacional')

const context = vm.createContext({ console })
vm.runInContext(
  [
    'var FAB = {SCHEMA_VERSION:"1.4.0"};',
    'function num_(value, fallback){ var number = Number(value); return isNaN(number) ? Number(fallback || 0) : number; }',
    'function upper_(value){ return String(value || "").trim().toUpperCase(); }',
    'function err_(code, message, status){ var error = new Error(message); error.code = code; error.status = status; throw error; }',
    workflow,
  ].join('\n'),
  context,
)

const calculated = JSON.parse(vm.runInContext(`JSON.stringify(technicalAggregateKpis_({
  observation_seconds: 36000,
  downtime_seconds: 3600,
  repair_seconds: 1800,
  failures: 2,
  os_lead_times: [7200, 3600],
  demand_lead_times: [1800],
  sla_response: [{eligible:true,met:true},{eligible:true,met:false},{eligible:false,met:false}],
  sla_resolution: [{eligible:true,met:true}],
  production: [{
    tempo_planejado_segundos:10000,
    tempo_operacao_segundos:9000,
    ciclo_ideal_segundos:10,
    quantidade_total:800,
    quantidade_boas:780
  }]
}))`, context))

assert(near(calculated.disponibilidade_pct, 90), 'disponibilidade deveria ser 90%')
assert(calculated.mttr_segundos === 900, 'MTTR deveria ser 900 segundos')
assert(calculated.mtbf_segundos === 16200, 'MTBF deveria ser 16200 segundos')
assert(calculated.lead_time_os_segundos === 5400, 'lead time médio de OS incorreto')
assert(calculated.lead_time_demanda_segundos === 1800, 'lead time de demanda incorreto')
assert(near(calculated.sla_resposta_pct, 50), 'SLA de resposta deveria ser 50%')
assert(near(calculated.sla_resolucao_pct, 100), 'SLA de resolução deveria ser 100%')
assert(near(calculated.oee_pct, 78), 'OEE deveria ser 78%')

const empty = JSON.parse(vm.runInContext('JSON.stringify(technicalAggregateKpis_({}))', context))
assert(empty.mttr_segundos === null, 'MTTR sem falhas deve ser indisponível')
assert(empty.mtbf_segundos === null, 'MTBF sem falhas deve ser indisponível')
assert(empty.oee_disponivel === false && empty.oee_pct === null, 'OEE sem produção não pode ser zero')
assert(vm.runInContext('technicalAssertDemandOpen_({status:"EM_TRIAGEM"})', context) === true, 'demanda aberta foi bloqueada')
assert(
  vm.runInContext('try { technicalAssertDemandOpen_({status:"CONCLUIDA"}); false } catch (error) { error.code === "TECH_DEMAND_FINAL" && error.status === 409 }', context),
  'demanda final aceita nova transição',
)

console.log('CONTRATO DO WORKFLOW TÉCNICO APROVADO')
console.log(`${requiredActions.length} rotas e ${requiredSheets.length} tabelas conferidas`)
console.log('Fórmulas controladas: disponibilidade, MTTR, MTBF, lead time, SLA e OEE')
