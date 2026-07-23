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
const documents = read('frontend-gestor/src/components/AdminDocumentsWorkspace.tsx')
const governance = read('frontend-gestor/src/components/AdminGovernanceWorkspace.tsx')
const backup = read('frontend-gestor/src/components/AdminBackupWorkspace.tsx')
const governanceApi = read('frontend-gestor/src/services/api/governance.ts')
const governanceBackend = read('backend/apps-script/29_Admin_Governanca.js')
const styles = read('frontend-gestor/src/styles/global.css')

for (const snapTarget of ['maximize', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']) {
  assert(workspace.includes(`'${snapTarget}'`), `encaixe de janela ausente: ${snapTarget}`)
}
assert(workspace.includes('detectSnapTarget('), 'arraste nao detecta bordas e cantos do Workspace')
assert(workspace.includes('snapWindow('), 'arraste nao aplica o encaixe selecionado')
assert(workspace.includes('windowLayerRef'), 'coordenadas das janelas nao usam a area util do Workspace')
assert(workspace.includes('const restoresOnDrag = item.maximized'), 'janela maximizada nao restaura sob o ponteiro ao arrastar')
assert(workspace.includes('if (distance < 5) return'), 'clique simples no titulo pode ser confundido com arraste')
assert(workspace.includes('restoreBounds'), 'encaixe perde o tamanho anterior da janela')
assert(workspace.includes('tiled: true'), 'janelas organizadas nao usam modo compacto')
assert(workspace.includes('const divider = 1'), 'layout organizado nao preserva o divisor de 1 px')
assert(workspace.includes('QUICK_ACCESS_MODULES'), 'barra inferior nao oferece acesso rapido')
assert(workspace.includes('layoutQuickOpen'), 'modo inferior nao abre o seletor de organizacao')
assert(workspace.includes('admin-window-snap-preview'), 'encaixe nao possui pre-visualizacao visual')
assert(styles.includes('container-type: inline-size'), 'modulos nao respondem a largura da propria janela')
assert(styles.includes('@container admin-window'), 'layouts internos nao possuem pontos de adaptacao por janela')
assert(styles.includes('scrollbar-width: none'), 'barra de rolagem permanece visivel no Firefox')
assert(styles.includes('::-webkit-scrollbar'), 'barra de rolagem permanece visivel no Chromium')
assert(styles.includes('touch-action: none'), 'barra de titulo nao protege o gesto de arraste por ponteiro')
assert(styles.includes('.admin-app-window.is-tiled'), 'janela encaixada nao possui acabamento proprio')
assert(styles.includes('flex-basis: 24px'), 'cabecalho encaixado nao foi compactado')
assert(styles.includes('max-height: none'), 'janela encaixada nao ocupa toda a altura util')
assert(styles.includes('.admin-app-window__body .admin-import-guardrail ol'), 'trilha da importacao nao adapta as etapas por janela')
assert(styles.includes('.admin-app-window__body .admin-filter-bar'), 'filtros de usuarios nao adaptam as colunas por janela')
assert(styles.includes('.admin-app-window__body .admin-user-row'), 'diretorio de usuarios nao converte linhas em cartoes compactos')
assert(styles.includes('.admin-status-layout-menu'), 'seletor rapido de layout nao foi estilizado')
assert(styles.includes('.admin-status-quick-access'), 'atalhos inferiores nao foram estilizados')

for (const moduleId of ['structure', 'assets', 'checklists', 'maintenance', 'inventory', 'workforce', 'operations', 'analytics', 'documents', 'governance', 'backup', 'imports', 'configuration', 'users', 'permissions']) {
  assert(workspace.includes(`id: '${moduleId}'`), `módulo ausente na navegação: ${moduleId}`)
  assert(page.includes(`tab === '${moduleId}'`), `módulo sem conteúdo: ${moduleId}`)
}

for (const desktopContract of ['admin-desktop-shell', 'admin-desktop-command', 'admin-desktop-rail', 'admin-app-window', 'admin-window-manager', 'admin-command-palette']) {
  assert(workspace.includes(desktopContract), `shell desktop sem ${desktopContract}`)
}
for (const windowAction of ['beginDrag', 'toggleMaximize', 'minimizeWindow', 'closeWindow', 'arrangeWindows']) {
  assert(workspace.includes(`${windowAction}(`), `gerenciador de janelas sem ${windowAction}`)
}
assert(workspace.includes("event.key.toLocaleLowerCase('pt-BR') === 'k'"), 'paleta não oferece atalho Ctrl K')
assert(workspace.includes('maximized: true'), 'janelas novas não abrem maximizadas por padrão')
assert(workspace.includes('useState<WorkspaceWindow[]>([])'), 'Workspace não inicia livre, com zero janelas')
for (const layout of ['smart', 'focus', 'columns', 'rows', 'grid', 'cascade']) {
  assert(workspace.includes(`arrangeWindows('${layout}')`), `layout da vFinal ausente: ${layout}`)
}
for (const shellFeature of ['FAB CONTROL · ADMINISTRAÇÃO INDUSTRIAL', 'admin-profile-menu', 'Organizar ao abrir', 'DESEMPENHO DO WORKSPACE', 'Otimizar cache']) {
  assert(workspace.includes(shellFeature), `refinamento da vFinal ausente: ${shellFeature}`)
}
assert(!workspace.includes('vFinal Enterprise'), 'tela inicial ainda exibe marcacao interna de desenvolvimento')
assert(workspace.includes('CENTRAL DE AJUDA'), 'ajuda nao possui apresentacao de produto final')
assert(workspace.includes('Em caso de dúvida, acesse a Central de Ajuda'), 'tela inicial nao direciona duvidas ao botao de ajuda')
const railIcons = [...workspace.matchAll(/id: '[^']+'.+?Icon: (\w+)Icon/g)].map((match) => match[1])
assert(railIcons.length === 16, 'catálogo do rail não contém os 16 módulos esperados')
assert(new Set(railIcons).size === railIcons.length, 'rail repete ícones entre módulos')
assert(styles.includes('.admin-desktop-workspace'), 'canvas do Workspace não foi estilizado')
assert(styles.includes('resize: both'), 'janelas administrativas não podem ser redimensionadas')
assert(styles.includes('.admin-window-manager__performance'), 'gerenciador não exibe desempenho e cache')

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
for (const assistedContext of ['planta_contexto', 'setor_contexto', 'linha_contexto']) {
  assert(catalog.includes(`key: '${assistedContext}'`), `filtro encadeado ausente: ${assistedContext}`)
}
assert(catalog.includes('MATERIAL_UNIT_OPTIONS'), 'unidade de material permanece manual')
assert(catalog.includes('RECURRENCE_OPTIONS'), 'periodicidade de plano permanece manual')
assert(catalog.includes('ESTIMATED_TIME_OPTIONS'), 'tempo estimado de plano permanece manual')
assert(catalog.includes('Selecione o campo anterior…'), 'dropdown dependente não orienta a sequência de cadastro')

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
for (const action of ['admin.documentos.listar', 'admin.documentos.detalhe', 'admin.documentos.upload', 'admin.documentos.atualizar', 'admin.auditoria.listar', 'admin.monitoramento.estado', 'admin.backups.listar', 'admin.backups.criar', 'admin.backups.preparar_restauracao', 'admin.backups.confirmar_restauracao']) {
  assert(router.includes(`case "${action}"`), `rota de governança ausente: ${action}`)
  assert(governanceApi.includes(`'${action}'`), `cliente de governança não usa ${action}`)
}
for (const assistedField of ['Tipo *', 'Status *', 'Escopo *', 'Cadastro vinculado', 'Responsável', 'Validade']) {
  assert(documents.includes(assistedField), `campo documental assistido ausente: ${assistedField}`)
}
assert(documents.includes('<select value={form.entidade_tipo}'), 'escopo documental não usa dropdown')
assert(documents.includes('targetOptions.map'), 'vínculo documental não é preenchido pelo cadastro')
assert(governance.includes('Dados sensíveis protegidos'), 'auditoria não informa a proteção de segredos')
assert(governanceBackend.includes('adminGovernanceRedact_'), 'servidor não mascara dados sensíveis')
assert(governanceBackend.includes('ADMIN_DOCUMENT_MAX_BYTES'), 'upload documental não limita tamanho')
assert(governanceBackend.includes('LockService.getScriptLock()'), 'documentos e backup não bloqueiam concorrência')
assert(backup.includes('<select value={reasonType}'), 'motivo do backup não usa dropdown')
assert(backup.includes('Restauração operacional protegida'), 'risco de restauração não está sinalizado')
assert(backup.includes('<select value={selectedBackupId}'), 'seleção de backup não usa dropdown')
assert(backup.includes('1ª confirmação') && backup.includes('2ª confirmação'), 'restauração sem dupla confirmação')
assert(governanceBackend.includes('ADMIN_RESTORE_PROTECTED_SHEETS'), 'restauração não preserva o núcleo de segurança')
assert(governanceBackend.includes('SAFETY_BACKUP_CREATED'), 'restauração não cria backup automático de segurança')
assert(styles.includes('.admin-checklist-layout'), 'construtor sem layout de Command Workspace')
assert(styles.includes('.admin-catalog-dialog'), 'cadastro sem formulário administrativo')
assert(styles.includes('.admin-governance-table'), 'governança sem layout de Command Workspace')

console.log('CONTRATO DO COMMAND WORKSPACE APROVADO')
console.log('15 módulos funcionais, cadastros assistidos, documentos, backup, intervenções e KPI conferidos')
console.log('Vínculos, concorrência, auditoria e workflow Admin -> Gestor -> Operador protegidos')
