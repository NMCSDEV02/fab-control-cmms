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

for (const action of requiredActions.filter((action) => action.startsWith('gestor.') || action === 'cmms.kpis_tecnicos')) {
  assert(gestorApi.includes(`'${action}'`), `cliente gestor não usa ${action}`)
}

assert(validations.includes('Fila técnica'), 'fila técnica não está visível')
assert(validations.includes('Criar análise técnica'), 'ocorrência não permite análise técnica')
assert(dashboard.includes('MTBF'), 'painel não exibe MTBF')
assert(dashboard.includes('Lead time OS'), 'painel não exibe lead time')
assert(dashboard.includes('SLA resolução'), 'painel não exibe SLA')
assert(dashboard.includes("'Aguardando dados'"), 'OEE sem amostra não é diferenciado de zero')
assert(workflow.includes('TECH_SIGNATURE_SEGREGATION'), 'segregação de assinatura ausente')
assert(workflow.includes('payload_hash'), 'assinatura não está vinculada ao hash do payload')

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
