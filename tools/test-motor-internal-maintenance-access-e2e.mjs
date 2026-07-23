import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve(import.meta.dirname, '..')
const commercialSource = fs.readFileSync(
  path.join(root, 'backend/apps-script/30_Motor_Acesso_Comercial.js'),
  'utf8',
)
const internalSource = fs.readFileSync(
  path.join(root, 'backend/apps-script/31_Motor_Acesso_Interno.js'),
  'utf8',
)

const properties = {}
const sessions = []
const audits = []
let environment = 'HOMOLOGACAO'

function clean(value) {
  return value == null ? '' : String(value).trim()
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const context = vm.createContext({
  console,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Math,
  ROLE: { ADMIN: 'ADMIN', GESTOR: 'GESTOR', OPERADOR: 'OPERADOR', SISTEMA: 'SISTEMA' },
  ST: { ATIVO: 'ATIVO', INATIVO: 'INATIVO' },
  clean_: clean,
  upper_: (value) => clean(value).toUpperCase(),
  num_: (value, fallback = 0) => {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? Number(fallback) : parsed
  },
  now_: () => new Date().toISOString(),
  iso_: (date) => date.toISOString(),
  addMinutes_: (date, minutes) => new Date(date.getTime() + Number(minutes) * 60000),
  authSecureEquals_: (left, right) => {
    const a = String(left || '')
    const b = String(right || '')
    return crypto.timingSafeEqual(
      Buffer.from(a.padEnd(Math.max(a.length, b.length), '\0')),
      Buffer.from(b.padEnd(Math.max(a.length, b.length), '\0')),
    ) && a.length === b.length
  },
  authRandomToken_: (prefix) => `${prefix}-TOKEN-${sessions.length + 1}`,
  ensureAuthSchema_: () => true,
  releaseVersionInfo_: () => ({ release_version: '1.4.0' }),
  audit_: (...args) => audits.push(args),
  append_: (sheet, row) => {
    if (sheet === 'sessoes') sessions.push({ ...row, __rowIndex: sessions.length + 2 })
    return row
  },
  fit_: (_sheet, row) => ({ ...row }),
  err_: (code, message, status) => {
    const error = new Error(message)
    error.code = code
    error.status = status
    throw error
  },
  find_: (sheet, key, value) => {
    if (sheet === 'config' && key === 'chave' && value === 'app.environment') {
      return { valor: environment }
    }
    return null
  },
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(key) {
          return Object.prototype.hasOwnProperty.call(properties, key) ? properties[key] : null
        },
        setProperty(key, value) {
          properties[key] = String(value)
          return this
        },
        deleteProperty(key) {
          delete properties[key]
          return this
        },
      }
    },
  },
  LockService: {
    getScriptLock() {
      return {
        tryLock: () => true,
        releaseLock: () => {},
      }
    },
  },
  Utilities: {
    sleep: () => {},
    computeHmacSha256Signature(value, secret) {
      return [...crypto.createHmac('sha256', String(secret)).update(String(value), 'utf8').digest()]
    },
    base64EncodeWebSafe(bytes) {
      return Buffer.from(bytes).toString('base64url')
    },
  },
})

vm.runInContext(commercialSource, context)
vm.runInContext(internalSource, context)

function resetCaches() {
  vm.runInContext(`
    MOTOR_SUBSCRIPTION_CACHE = null;
    MOTOR_MAINTENANCE_CACHE = null;
    MOTOR_INTERNAL_IDENTITY_CACHE = null;
    MOTOR_INTERNAL_MAINTENANCE_CACHE = null;
  `, context)
}

function clearProperties() {
  for (const key of Object.keys(properties)) delete properties[key]
  sessions.length = 0
  audits.length = 0
  resetCaches()
}

function signProperty(propertyName, secretName, data, secret = `secret-${secretName}`) {
  const payload = JSON.stringify(data)
  properties[secretName] = secret
  const signature = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64url')
  properties[propertyName] = JSON.stringify({ payload, signature })
  resetCaches()
}

function challengeHash(code, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`FAB_CONTROL_MAINTENANCE_CHALLENGE_V1:${code}`, 'utf8')
    .digest('base64url')
}

function expectCode(callback, expectedCode, message) {
  let received = null
  try {
    callback()
  } catch (error) {
    received = error
  }
  assert(received?.code === expectedCode, `${message}; recebido: ${received?.code || 'nenhum erro'}`)
}

function configureWindow({
  tenantId = 'TENANT-01',
  identityTenantId = tenantId,
  identityEnvironment = 'HOMOLOGACAO',
  windowEnvironment = 'HOMOLOGACAO',
  operatorId = 'DEV-NMCS-01',
  windowOperatorId = operatorId,
  windowId = 'MW-VALIDA-01',
  code = 'codigo-temporario-seguro-123456789',
  active = true,
  expiresAt = new Date(Date.now() + 45 * 60000).toISOString(),
} = {}) {
  const identitySecret = 'identity-secret'
  const maintenanceSecret = 'maintenance-secret'
  properties.FAB_CONTROL_SPREADSHEET_ID = tenantId
  signProperty('FAB_CONTROL_PLATFORM_IDENTITY_V1', 'FAB_CONTROL_PLATFORM_IDENTITY_SIGNING_SECRET', {
    usuario_id: operatorId,
    nome: 'Engenharia Interna',
    email: 'engenharia@fabcontrol.internal',
    status: 'ATIVO',
    tenant_id: identityTenantId,
    ambientes: [identityEnvironment],
  }, identitySecret)
  signProperty('FAB_CONTROL_MOTOR_MAINTENANCE_V1', 'FAB_CONTROL_MOTOR_MAINTENANCE_SIGNING_SECRET', {
    ativa: active,
    janela_id: windowId,
    operador_id: windowOperatorId,
    tenant_id: tenantId,
    ambiente: windowEnvironment,
    motivo: 'Evolução controlada do Motor',
    expira_em: expiresAt,
    desafio_hash: challengeHash(code, maintenanceSecret),
  }, maintenanceSecret)
  return { code, windowId }
}

clearProperties()
expectCode(
  () => context.motorInternalMaintenanceExchange_({ codigo: 'codigo-inexistente-com-tamanho-valido' }),
  'MAINTENANCE_ACCESS_INVALID',
  'acesso sem identidade e janela deveria falhar',
)

const configured = configureWindow()
assert(context.motorInternalIdentityState_().ativa === true, 'identidade interna assinada deveria ficar ativa')
assert(context.motorInternalMaintenanceState_().aberta === true, 'janela assinada deveria abrir')

for (let attempt = 1; attempt <= 5; attempt += 1) {
  expectCode(
    () => context.motorInternalMaintenanceExchange_({ codigo: `codigo-incorreto-${attempt}-com-tamanho` }),
    'MAINTENANCE_ACCESS_INVALID',
    `tentativa inválida ${attempt} deveria falhar`,
  )
}
const guard = JSON.parse(properties.FAB_CONTROL_MOTOR_LOGIN_GUARD_V1)
assert(guard.tentativas === 5, 'limite de tentativas não foi persistido')
assert(Boolean(guard.bloqueado_ate), 'quinta tentativa não bloqueou a janela')
expectCode(
  () => context.motorInternalMaintenanceExchange_({ codigo: configured.code }),
  'MAINTENANCE_ACCESS_INVALID',
  'janela bloqueada não deveria aceitar o código correto',
)

delete properties.FAB_CONTROL_MOTOR_LOGIN_GUARD_V1
const exchanged = context.motorInternalMaintenanceExchange_({
  codigo: configured.code,
  user_agent: 'E2E',
})
assert(exchanged.acesso_integral === true, 'troca válida não concedeu acesso integral')
assert(exchanged.usuario.perfil === 'SISTEMA', 'sessão interna não recebeu o perfil SISTEMA')
assert(sessions.length === 1, 'troca válida deveria criar uma única sessão')
assert(sessions[0].escopo === 'PLATFORM_MAINTENANCE', 'sessão interna recebeu escopo incorreto')
assert(sessions[0].janela_id === configured.windowId, 'sessão não foi vinculada à janela')
assert(sessions[0].tenant_id === 'TENANT-01', 'sessão não foi vinculada ao tenant')
assert(sessions[0].ambiente === 'HOMOLOGACAO', 'sessão não foi vinculada ao ambiente')
assert(Number(sessions[0].expira_ms) <= Date.now() + 30 * 60000 + 1000, 'sessão excedeu 30 minutos')
assert(properties.FAB_CONTROL_MOTOR_MAINTENANCE_REDEEMED_V1 === configured.windowId, 'janela não foi marcada como utilizada')

expectCode(
  () => context.motorInternalMaintenanceExchange_({ codigo: configured.code }),
  'MAINTENANCE_ACCESS_INVALID',
  'código de uso único foi reutilizado',
)

const authorized = context.motorInternalAuthorizeSession_(sessions[0])
assert(authorized.perfil === 'SISTEMA', 'sessão persistida não foi revalidada')
assert(context.motorAuthorizeAction_('admin.configuracao.estado', authorized) === true, 'sessão interna válida deveria ultrapassar o plano comercial')
const access = context.motorCommercialAccessState_({}, authorized)
assert(access.acesso_integral === true, 'estado interno não informou acesso integral')
assert(access.manutencao.janela_id === configured.windowId, 'estado interno omitiu a janela atual')

const catalog = context.motorPlatformCatalogState_({}, authorized)
assert(catalog.ambiente === 'HOMOLOGACAO', 'catálogo interno omitiu o ambiente')
assert(catalog.tenant_id === 'TENANT-01', 'catálogo interno omitiu o tenant')
assert(catalog.recursos.length === 10, 'catálogo interno não retornou os dez grupos de recursos')
assert(catalog.planos.length === 3, 'catálogo interno não retornou os três planos')
assert(catalog.politicas.padrao === 'NEGAR_ACAO_NAO_CLASSIFICADA', 'catálogo não informou a política de falha fechada')
assert(catalog.politicas.regras.length > 40, 'catálogo interno retornou poucas regras classificadas')
assert(catalog.protecoes.revalidacao_por_requisicao === true, 'catálogo omitiu a revalidação por requisição')

const adminAccess = context.motorCommercialAccessState_({}, { perfil: 'ADMIN', usuario_id: 'USR-ADMIN' })
assert(adminAccess.acesso_integral === false, 'administrador comum recebeu acesso integral')
assert(!adminAccess.manutencao.janela_id, 'administrador comum recebeu o identificador da janela')
expectCode(
  () => context.motorPlatformCatalogState_({}, { perfil: 'ADMIN', usuario_id: 'USR-ADMIN' }),
  'MOTOR_INTERNAL_IDENTITY_REQUIRED',
  'administrador comum acessou o catálogo interno',
)

signProperty('FAB_CONTROL_MOTOR_MAINTENANCE_V1', 'FAB_CONTROL_MOTOR_MAINTENANCE_SIGNING_SECRET', {
  ativa: false,
  janela_id: configured.windowId,
  operador_id: 'DEV-NMCS-01',
  tenant_id: 'TENANT-01',
  ambiente: 'HOMOLOGACAO',
  expira_em: new Date(Date.now() + 30 * 60000).toISOString(),
  desafio_hash: 'desativado',
}, 'maintenance-secret')
expectCode(
  () => context.motorInternalAuthorizeSession_(sessions[0]),
  'MOTOR_MAINTENANCE_REQUIRED',
  'sessão deveria ser revogada ao fechar a janela',
)

clearProperties()
configureWindow({ identityTenantId: 'OUTRO-TENANT' })
assert(context.motorInternalMaintenanceState_().aberta === false, 'identidade de outro tenant abriu a janela')

clearProperties()
configureWindow({ windowEnvironment: 'PRODUCAO' })
assert(context.motorInternalMaintenanceState_().aberta === false, 'janela de outro ambiente foi aceita')

clearProperties()
configureWindow({ expiresAt: new Date(Date.now() - 60000).toISOString() })
assert(context.motorInternalMaintenanceState_().aberta === false, 'janela expirada foi aceita')

clearProperties()
configureWindow({ windowOperatorId: 'OUTRO-OPERADOR' })
assert(context.motorInternalMaintenanceState_().aberta === false, 'janela de outro operador foi aceita')

assert(audits.length === 0, 'limpeza final deveria remover auditorias do cenário anterior')

console.log('E2E DO ACESSO INTERNO AO MOTOR APROVADO')
console.log('Identidade, uso único, bloqueio, sessão, revogação, tenant e ambiente conferidos')
