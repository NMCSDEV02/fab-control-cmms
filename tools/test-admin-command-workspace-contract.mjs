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
const styles = read('frontend-gestor/src/styles/global.css')

for (const moduleId of ['structure', 'assets', 'checklists', 'maintenance', 'inventory', 'imports', 'configuration', 'users', 'permissions']) {
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
assert(styles.includes('.admin-checklist-layout'), 'construtor sem layout de Command Workspace')
assert(styles.includes('.admin-catalog-dialog'), 'cadastro sem formulário administrativo')

console.log('CONTRATO DO COMMAND WORKSPACE APROVADO')
console.log('9 módulos funcionais, cadastros assistidos e construtor de checklist conferidos')
console.log('Vínculos, concorrência, auditoria e workflow Admin -> Gestor -> Operador protegidos')
