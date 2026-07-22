import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/^\uFEFF/, '')
const assert = (condition, message) => {
  if (!condition) throw new Error(`Contrato do Command Workspace inválido: ${message}`)
}

const router = read('backend/apps-script/03_Http_Auth.js')
const admin = read('backend/apps-script/04_Admin.js')
const workspace = read('frontend-gestor/src/components/AdminWorkspace.tsx')
const page = read('frontend-gestor/src/pages/AdminPage.tsx')
const catalog = read('frontend-gestor/src/components/AdminCatalogWorkspace.tsx')
const checklist = read('frontend-gestor/src/components/AdminChecklistBuilder.tsx')
const checklistApi = read('frontend-gestor/src/services/api/checklists.ts')
const adminApi = read('frontend-gestor/src/services/api/admin.ts')
const technicalStructure = read('frontend-gestor/src/components/AdminTechnicalStructure.tsx')
const interventions = read('frontend-gestor/src/components/AdminInterventionsWorkspace.tsx')
const interventionsApi = read('frontend-gestor/src/services/api/interventions.ts')
const interventionsBackend = read('backend/apps-script/28_Admin_Intervencoes.js')
const analytics = read('frontend-gestor/src/components/AdminAnalyticsWorkspace.tsx')
const analyticsApi = read('frontend-gestor/src/services/api/analytics.ts')
const styles = read('frontend-gestor/src/styles/global.css')

for (const moduleId of ['structure', 'assets', 'checklists', 'maintenance', 'inventory', 'workforce', 'operations', 'analytics', 'imports', 'configuration', 'users', 'permissions']) {
  assert(workspace.includes(`id: '${moduleId}'`), `módulo ausente na navegação: ${moduleId}`)
  assert(page.includes(`tab === '${moduleId}'`), `módulo sem conteúdo: ${moduleId}`)
}

assert(router.includes('case "admin.salvar": return adminSalvarSeguro_(p, p.__auth)'), 'cadastro manual não usa barreira segura')
assert(admin.includes('adminAssertEntityReferences_'), 'vínculos não são validados no backend')
assert(admin.includes('adminProtectManualPlan_'), 'plano manual pode ignorar o workflow')
assert(admin.includes('row.status = ST.INATIVO'), 'plano manual pode nascer ativo')
assert(admin.includes('row.workflow_status = ST.RASCUNHO'), 'plano manual pode pular a validação')
assert(admin.includes('LockService.getScriptLock()'), 'cadastro manual sem lock de concorrência')
assert(admin.includes('ADMIN_ENTITY_CREATED'), 'criação manual sem auditoria')
assert(admin.includes('ADMIN_ENTITY_UPDATED'), 'alteração manual sem auditoria')

for (const relation of ['planta_id', 'setor_id', 'linha_id', 'ativo_id', 'componente_id']) {
  assert(catalog.includes(`key: '${relation}'`), `dropdown de vínculo ausente: ${relation}`)
}
assert(catalog.includes("type: 'reference'"), 'cadastros relacionados não usam dropdown')
assert(catalog.includes("dependsOn: { field: 'ativo_id'"), 'componente não é filtrado pelo ativo')
assert(catalog.includes("value: 'DECISAO_EXECUTOR'"), 'modo de parada não usa valor canônico')

for (const action of ['admin.listar_modelos_checklist', 'admin.detalhe_modelo_checklist', 'admin.salvar_modelo_checklist', 'admin.enviar_modelo_checklist_validacao']) {
  assert(checklistApi.includes(`'${action}'`), `cliente de checklist não usa ${action}`)
}
for (const assistedField of ['Ativo *', 'Componente', 'Tipo de resposta', 'Área responsável *', 'Cargo técnico', 'Exigir assinatura']) {
  assert(checklist.includes(assistedField), `campo assistido ausente: ${assistedField}`)
}
assert(checklist.includes('availableComponents'), 'componentes não são filtrados pelo ativo')
assert(checklist.includes('availableRoles'), 'cargos não são filtrados pela área')
assert(checklist.includes('saveModel()'), 'envio não garante rascunho salvo')
for (const action of ['admin.areas_tecnicas.listar', 'admin.areas_tecnicas.salvar', 'admin.cargos_tecnicos.listar', 'admin.cargos_tecnicos.salvar']) {
  assert(adminApi.includes(`'${action}'`), `cliente da estrutura técnica não usa ${action}`)
}
assert(technicalStructure.includes('Área técnica *'), 'cargo não usa dropdown de área')
assert(technicalStructure.includes('Pode assinar documentos'), 'permissão de assinatura não é assistida')
assert(technicalStructure.includes("editor.kind === 'role'"), 'formulário de cargo não é protegido por tipo')
for (const action of ['admin.intervencoes.listar', 'admin.intervencoes.salvar', 'admin.intervencoes.enviar_validacao']) {
  assert(interventionsApi.includes(`'${action}'`), `cliente de intervenção não usa ${action}`)
  assert(router.includes(`case "${action}"`), `rota de intervenção ausente: ${action}`)
}
assert(interventions.includes('Área responsável *'), 'intervenção não usa dropdown de área')
assert(interventions.includes('routeRoles'), 'cargo da intervenção não é filtrado pela área')
assert(interventionsBackend.includes('O rascunho não cria os_acoes'), 'rascunho pode vazar ao Operador')
assert(interventionsBackend.indexOf('append_("os_acoes"') > interventionsBackend.indexOf('adminIntervencaoLiberarOperacao_'), 'ação não está restrita à liberação')
assert(analyticsApi.includes("'cmms.kpis_tecnicos'"), 'painel administrativo não consulta KPIs técnicos')
for (const metric of ['MTTR', 'MTBF', 'Lead time de OS', 'SLA resposta', 'OEE']) {
  assert(analytics.includes(metric), `indicador ausente no Admin: ${metric}`)
}
assert(analytics.includes('Sem amostra'), 'ausência de dados pode ser confundida com zero')
assert(analytics.includes('Exportar CSV'), 'relatório exportável ausente')
assert(styles.includes('.admin-checklist-layout'), 'construtor sem layout de Command Workspace')
assert(styles.includes('.admin-catalog-dialog'), 'cadastro sem formulário administrativo')

console.log('CONTRATO DO COMMAND WORKSPACE APROVADO')
console.log('12 módulos funcionais, cadastros assistidos, checklist, intervenções e KPI conferidos')
console.log('Vínculos, concorrência, auditoria e workflow Admin -> Gestor -> Operador protegidos')
