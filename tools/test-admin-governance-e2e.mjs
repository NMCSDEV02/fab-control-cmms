import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve(import.meta.dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/^\uFEFF/, '')
const assert = (condition, message) => {
  if (!condition) throw new Error(`Governança E2E inválida: ${message}`)
}

let uuidSequence = 0
let fileSequence = 0
let folderSequence = 0
const properties = new Map()
const files = new Map()
const folders = new Map()

class FakeFile {
  constructor(id, name, size, folderId = '') {
    this.id = id
    this.name = name
    this.size = size
    this.folderId = folderId
    this.createdAt = new Date('2026-07-22T18:00:00.000Z')
    this.updatedAt = new Date(this.createdAt)
    this.trashed = false
    this.description = ''
  }

  getId() { return this.id }
  getName() { return this.name }
  getSize() { return this.size }
  getDateCreated() { return this.createdAt }
  getLastUpdated() { return this.updatedAt }
  getUrl() { return `https://drive.google.test/file/${this.id}` }
  setDescription(value) { this.description = String(value); return this }
  setTrashed(value) { this.trashed = Boolean(value); return this }
  makeCopy(name, folder) { return folder.createStoredFile(name, this.size) }
}

class FakeFolder {
  constructor(id, name) {
    this.id = id
    this.name = name
  }

  getId() { return this.id }
  createStoredFile(name, size) {
    fileSequence += 1
    const file = new FakeFile(`FILE-${fileSequence}`, name, size, this.id)
    files.set(file.id, file)
    return file
  }
  createFile(blob) { return this.createStoredFile(blob.name, blob.bytes.length) }
  getFiles() {
    const items = [...files.values()].filter((file) => file.folderId === this.id && !file.trashed)
    let index = 0
    return { hasNext() { return index < items.length }, next() { return items[index++] } }
  }
}

files.set('SHEET-CANARY', new FakeFile('SHEET-CANARY', 'FAB Control - CANARIO', 2048))

const context = vm.createContext({
  console,
  Date,
  JSON,
  Math,
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(key) { return properties.get(key) || '' },
        setProperty(key, value) { properties.set(key, String(value)) },
      }
    },
  },
  DriveApp: {
    createFolder(name) {
      folderSequence += 1
      const folder = new FakeFolder(`FOLDER-${folderSequence}`, name)
      folders.set(folder.id, folder)
      return folder
    },
    getFolderById(id) {
      const folder = folders.get(String(id))
      if (!folder) throw new Error('Folder not found')
      return folder
    },
    getFileById(id) {
      const file = files.get(String(id))
      if (!file || file.trashed) throw new Error('File not found')
      return file
    },
  },
  SpreadsheetApp: { flush() {} },
  LockService: {
    getScriptLock() { return { tryLock() { return true }, releaseLock() {} } },
  },
  Utilities: {
    formatDate(date) { return new Date(date).toISOString().slice(0, 19) },
    getUuid() {
      uuidSequence += 1
      return `${String(uuidSequence).padStart(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`
    },
    base64Decode(value) { return [...Buffer.from(String(value), 'base64')] },
    newBlob(bytes, mimeType, name) { return { bytes, mimeType, name } },
  },
})

vm.runInContext([
  read('backend/apps-script/00_Config.js'),
  read('backend/apps-script/01_Utils.js'),
  `
    var TEST_DB = {
      usuarios:[
        {id:'USR-ADMIN',nome:'Admin Demo',perfil:'ADMIN',status:'ATIVO',__rowIndex:2},
        {id:'USR-GESTOR',nome:'Gestor Demo',perfil:'GESTOR',status:'ATIVO',__rowIndex:3}
      ],
      plantas:[{id:'PLT-01',tag:'P01',nome:'Planta 01',__rowIndex:2}],
      setores:[{id:'SET-01',planta_id:'PLT-01',tag:'S01',nome:'Manutenção',__rowIndex:2}],
      linhas:[{id:'LIN-01',setor_id:'SET-01',tag:'L01',nome:'Linha 01',__rowIndex:2}],
      ativos:[{id:'ATV-01',linha_id:'LIN-01',tag:'EQ-01',nome:'Prensa',__rowIndex:2}],
      componentes:[{id:'CMP-01',ativo_id:'ATV-01',tag:'M01',nome:'Motor',__rowIndex:2}],
      documentos_tecnicos:[], documento_revisoes:[], audit_log:[]
    };
    function getSpreadsheet_(){ return {getId:function(){ return 'SHEET-CANARY'; }}; }
    function ensureSheet_(ss,name){ if(!TEST_DB[name]) TEST_DB[name] = []; }
    function rows_(name){ return TEST_DB[name] || []; }
    function find_(name,key,value){ return rows_(name).find(function(row){ return String(row[key]) === String(value); }) || null; }
    function fit_(name,data){ var out = {}; SH[name].forEach(function(key){ out[key] = data[key] === undefined ? '' : data[key]; }); return out; }
    function append_(name,data){ if(!TEST_DB[name]) TEST_DB[name] = []; data.__rowIndex = TEST_DB[name].length + 2; TEST_DB[name].push(data); return data; }
    function update_(name,rowIndex,patch){ var row = rows_(name).find(function(item){ return item.__rowIndex === rowIndex; }); if(!row) throw new Error('Linha ausente: '+name+'#'+rowIndex); Object.keys(patch).forEach(function(key){ if(key !== '__rowIndex') row[key] = patch[key]; }); }
    function deleteRow_(name,rowIndex){ TEST_DB[name] = rows_(name).filter(function(item){ return item.__rowIndex !== rowIndex; }); TEST_DB[name].forEach(function(item,index){ item.__rowIndex = index + 2; }); }
    function adminRequireIdentityAdmin_(auth){ if(!auth || auth.perfil !== 'ADMIN') err_('ADMIN_ONLY','Acesso exclusivo do administrador.',403); }
    function audit_(auth,action,entity,entityId,before,after,userAgent){ append_('audit_log',{id:'AUD-'+(rows_('audit_log').length+1),usuario_id:auth.usuario_id,perfil:auth.perfil,acao:action,entidade:entity,entidade_id:entityId,antes_json:JSON.stringify(before||{}),depois_json:JSON.stringify(after||{}),user_agent:userAgent||'',criado_em:now_()}); }
    function cmmsHigieneDiagnosticar_(){ return {dry_run:true,total_issues:0,by_code:{},issues:[]}; }
    function perfCacheStatus_(){ return {ok:true,entries:4}; }
    function sistemaHealth_(){ return {ok:true,app:FAB.APP_NAME,version:FAB.VERSION,spreadsheetId:getSpreadsheet_().getId(),serverTime:now_()}; }
  `,
  read('backend/apps-script/29_Admin_Governanca.js'),
].join('\n'), context)

const admin = `{usuario_id:'USR-ADMIN',perfil:'ADMIN'}`
const evaluate = (source) => JSON.parse(vm.runInContext(`JSON.stringify(${source})`, context))

const nonAdminBlocked = vm.runInContext(`try { adminDocumentosListar_({}, {usuario_id:'USR-GESTOR',perfil:'GESTOR'}); false } catch(error) { error.code === 'ADMIN_ONLY' }`, context)
assert(nonAdminBlocked, 'Gestor acessou documentos exclusivos do Admin')

context.invalidLink = {
  dados: { titulo: 'Manual inválido', tipo: 'MANUAL', status: 'RASCUNHO', entidade_tipo: 'ATIVO', entidade_id: 'ATV-INEXISTENTE', revisao: 'R1' },
  arquivo: { nome: 'manual.pdf', mime_type: 'application/pdf', base64: Buffer.from('pdf').toString('base64') },
}
const invalidLinkBlocked = vm.runInContext(`try { adminDocumentoUpload_(invalidLink, ${admin}); false } catch(error) { error.code === 'DOCUMENT_ENTITY_NOT_FOUND' }`, context)
assert(invalidLinkBlocked, 'vínculo documental inexistente foi aceito')

context.firstDocument = {
  dados: {
    codigo: 'DOC-001', titulo: 'Manual da prensa', tipo: 'MANUAL', status: 'VIGENTE',
    entidade_tipo: 'ATIVO', entidade_id: 'ATV-01', responsavel_id: 'USR-GESTOR',
    validade_em: '2027-07-22', revisao: 'R1', observacao: 'Emissão inicial'
  },
  arquivo: { nome: 'manual-prensa.pdf', mime_type: 'application/pdf', base64: Buffer.from('conteudo-r1').toString('base64') },
}
const created = evaluate(`adminDocumentoUpload_(firstDocument, ${admin})`)
assert(created.saved && created.mode === 'insert', 'documento inicial não foi salvo')
assert(created.documento.entidade_id === 'ATV-01', 'vínculo assistido não foi persistido')
assert(evaluate(`rows_('documento_revisoes').length`) === 1, 'revisão inicial não foi registrada')
context.documentId = created.documento.id

context.secondRevision = {
  dados: {
    documento_id: created.documento.id, titulo: 'Manual da prensa', tipo: 'MANUAL', status: 'VIGENTE',
    entidade_tipo: 'ATIVO', entidade_id: 'ATV-01', responsavel_id: 'USR-GESTOR',
    validade_em: '2028-07-22', revisao: 'R2', observacao: 'Atualização técnica'
  },
  arquivo: { nome: 'manual-prensa-r2.pdf', mime_type: 'application/pdf', base64: Buffer.from('conteudo-r2').toString('base64') },
}
const revised = evaluate(`adminDocumentoUpload_(secondRevision, ${admin})`)
assert(revised.mode === 'revision' && revised.documento.revisao_atual === 'R2', 'nova revisão não substituiu a revisão atual')
const revisionAudit = evaluate(`rows_('audit_log').filter(function(item){ return item.acao === 'DOCUMENT_REVISION_CREATED'; })[0]`)
assert(JSON.parse(revisionAudit.antes_json).revisao_atual === 'R1', 'auditoria perdeu o estado anterior da revisão')

vm.runInContext(`append_('audit_log',{id:'AUD-SECRET',usuario_id:'USR-ADMIN',perfil:'ADMIN',acao:'USER_SECRET_TEST',entidade:'usuarios',entidade_id:'USR-GESTOR',antes_json:JSON.stringify({senha_hash:'abc',nome:'Gestor'}),depois_json:JSON.stringify({nested:{token:'secreto'},pin_hash:'def'}),criado_em:now_()})`, context)
const audit = evaluate(`adminAuditoriaListar_({acao:'USER_SECRET_TEST'}, ${admin})`)
assert(audit.eventos[0].antes_json.includes('[PROTEGIDO]'), 'hash de senha vazou na auditoria')
assert(audit.eventos[0].depois_json.includes('[PROTEGIDO]'), 'token ou PIN vazou na auditoria')
assert(!audit.eventos[0].depois_json.includes('secreto'), 'valor secreto permaneceu na resposta')

const invalidResponsibleBlocked = vm.runInContext(`try { adminDocumentoAtualizar_({dados:{id:documentId,titulo:'Manual da prensa',tipo:'MANUAL',status:'VIGENTE',entidade_tipo:'ATIVO',entidade_id:'ATV-01',responsavel_id:'USR-INEXISTENTE'}}, ${admin}); false } catch(error) { error.code === 'DOCUMENT_RESPONSIBLE_NOT_FOUND' }`, context)
assert(invalidResponsibleBlocked, 'responsável inexistente foi aceito')

const beforeDocuments = evaluate(`rows_('documentos_tecnicos').length`)
const beforeRevisions = evaluate(`rows_('documento_revisoes').length`)
const beforeActiveFiles = [...files.values()].filter((file) => !file.trashed).length
context.failedDocument = {
  dados: { titulo: 'Documento com falha', tipo: 'LAUDO', status: 'RASCUNHO', entidade_tipo: 'EMPRESA', revisao: 'R1' },
  arquivo: { nome: 'falha.pdf', mime_type: 'application/pdf', base64: Buffer.from('falha').toString('base64') },
}
vm.runInContext(`var originalAuditForTest = audit_; audit_ = function(){ err_('AUDIT_FAILURE','Falha de auditoria simulada.',500); };`, context)
const transactionRolledBack = vm.runInContext(`try { adminDocumentoUpload_(failedDocument, ${admin}); false } catch(error) { error.code === 'AUDIT_FAILURE' }`, context)
vm.runInContext(`audit_ = originalAuditForTest;`, context)
assert(transactionRolledBack, 'falha transacional simulada não ocorreu')
assert(evaluate(`rows_('documentos_tecnicos').length`) === beforeDocuments, 'falha deixou documento órfão')
assert(evaluate(`rows_('documento_revisoes').length`) === beforeRevisions, 'falha deixou revisão órfã')
assert([...files.values()].filter((file) => !file.trashed).length === beforeActiveFiles, 'falha deixou arquivo ativo no Drive')

const backupWithoutConfirmation = vm.runInContext(`try { adminBackupCriar_({motivo:'Antes da release',confirmacao:'NAO'}, ${admin}); false } catch(error) { error.code === 'BACKUP_CONFIRMATION_REQUIRED' }`, context)
assert(backupWithoutConfirmation, 'backup foi criado sem confirmação explícita')
const backup = evaluate(`adminBackupCriar_({motivo:'Antes da release canário',confirmacao:'CRIAR BACKUP'}, ${admin})`)
assert(backup.created && backup.restauracao_disponivel === false, 'backup seguro não foi criado ou restauração foi exposta')
const backups = evaluate(`adminBackupsListar_({}, ${admin})`)
assert(backups.total === 1 && backups.backups[0].id === backup.backup.id, 'backup criado não apareceu na listagem')

const monitoring = evaluate(`adminMonitoramentoEstado_({}, ${admin})`)
assert(monitoring.health.ok && monitoring.diagnostico.dry_run, 'monitoramento alterou a base ou não retornou saúde')

console.log('GOVERNANÇA ADMINISTRATIVA E2E EM MEMÓRIA APROVADA')
console.log('Documentos, revisões, vínculos, redação de segredos e rollback transacional conferidos')
console.log('Backup exige confirmação, permanece privado e não expõe restauração destrutiva')
