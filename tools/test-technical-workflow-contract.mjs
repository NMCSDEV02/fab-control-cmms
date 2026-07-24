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
const validations = read('frontend-gestor/src/pages/ValidationsPage.tsx')
const dashboard = read('frontend-gestor/src/pages/DashboardPage.tsx')
const performance = read('frontend-gestor/src/components/GestorPerformancePanel.tsx')
const demandDialog = read('frontend-gestor/src/components/TechnicalDemandDialog.tsx')
const navigation = read('frontend-gestor/src/components/AppNavigation.tsx')
const gestorStyles = read('frontend-gestor/src/styles/global.css')
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

assert(validations.includes('Central de trabalho'), 'central única de trabalho não está visível')
assert(!validations.includes('Fila técnica'), 'nome duplicado de fila técnica continua visível')
assert(dashboard.includes('Uma única entrada'), 'painel inicial não orienta para a central única')
assert(!dashboard.includes('MINHA FILA TÉCNICA'), 'painel inicial ainda apresenta uma segunda fila')
assert(navigation.includes("label: 'Trabalho'"), 'navegação não usa a Central de trabalho')
assert(
  gestorStyles.includes('.manager-work-page .validation-tabs') &&
    gestorStyles.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'),
  'quatro categorias não estão organizadas na mesma grade',
)
assert(validations.includes('Criar análise técnica'), 'ocorrência não permite análise técnica')
assert(demandDialog.includes('Assumir e continuar'), 'fluxo não orienta o primeiro aceite')
assert(demandDialog.includes('Assinaturas concluídas'), 'fluxo não evidencia o gate de assinatura')
assert(demandDialog.includes('ESCOLHA O RESULTADO'), 'decisão técnica não possui orientação')
assert(performance.includes("label: 'MTBF'"), 'painel não exibe MTBF')
assert(performance.includes("label: 'Lead time de OS'"), 'painel não exibe lead time')
assert(performance.includes("label: 'SLA de resolução'"), 'painel não exibe SLA')
assert(performance.includes('Aguardando apontamentos de produção'), 'OEE sem amostra não é diferenciado de zero')
assert(performance.includes('período anterior'), 'painel não compara tendências')
assert(performance.includes('Todos os ativos'), 'painel não permite recorte por ativo')
assert(gestorApi.includes('getGestorTechnicalKpisForPeriod'), 'cliente não envia período e ativo aos KPIs')
assert(workflow.includes('TECH_SIGNATURE_SEGREGATION'), 'segregação de assinatura ausente')
assert(workflow.includes('payload_hash'), 'assinatura não está vinculada ao hash do payload')
assert(workflow.includes('workflow.tecnico.text.repair.version'), 'catálogo técnico não versiona a correção de acentuação')
assert(workflow.includes('technicalLooksMojibake_'), 'catálogo técnico não detecta textos legados corrompidos')
assert(workflow.includes('var roleId = eid_("CTEC", definition.codigo)'), 'correção de cargos não preserva o identificador estável')
assert(!workflow.includes('tÃ©cnic') && !workflow.includes('ocorrÃªncia') && !workflow.includes('produÃ§Ã£o'), 'workflow ainda contém acentuação UTF-8 corrompida')
assert(interventionsBackend.includes('ADMIN_INTERVENTION_WAITING'), 'intervenção não possui estado de validação')
assert(interventionsBackend.includes('adminIntervencaoLiberarOperacao_'), 'liberação técnica não cria ação operacional')

const context = vm.createContext({ console })
vm.runInContext(
  [
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
