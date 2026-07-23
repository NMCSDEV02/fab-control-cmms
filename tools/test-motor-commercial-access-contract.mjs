import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`FALHA: ${message}`)
    process.exit(1)
  }
}

const motor = read('backend/apps-script/30_Motor_Acesso_Comercial.js')
const auth = read('backend/apps-script/03_Http_Auth.js')
const configuration = read('backend/apps-script/26_Motor_Configuracao.js')

for (const plan of ['INICIAL', 'BASICO', 'COMPLETO']) {
  assert(motor.includes(`${plan}: {`), `plano comercial ausente: ${plan}`)
}

for (const feature of [
  'CADASTROS',
  'ORDENS_SERVICO',
  'CHECKLISTS',
  'GESTAO_TECNICA',
  'INDICADORES',
  'DOCUMENTOS',
  'IMPORTACOES',
  'AUDITORIA',
  'CONTINUIDADE',
  'MOTOR_LIMITADO',
]) {
  assert(motor.includes(`${feature}: "${feature}"`), `recurso comercial ausente: ${feature}`)
}

assert(motor.includes('computeHmacSha256Signature'), 'assinatura HMAC da política comercial ausente')
assert(motor.includes('authSecureEquals_'), 'comparação segura da assinatura comercial ausente')
assert(motor.includes('PADRAO_SEGURO_DE_MIGRACAO'), 'migração compatível do canário atual ausente')
assert(motor.includes('motorBlockedSubscription_'), 'falha fechada da assinatura ausente')
assert(motor.includes('SUBSCRIPTION_FEATURE_REQUIRED'), 'bloqueio por recurso não contratado ausente')
assert(motor.includes('MOTOR_MAINTENANCE_REQUIRED'), 'bloqueio do motor integral ausente')
assert(motor.includes('upper_(auth && auth.perfil) === ROLE.SISTEMA'), 'motor integral não exige identidade interna')
assert(!auth.includes('case "platform.motor.'), 'operações internas do motor não podem estar expostas na API pública')
assert(motor.includes('tenantId !== configuredTenantId'), 'assinatura não está vinculada ao cliente configurado')
assert(motor.includes('SUBSCRIPTION_ACTION_UNCLASSIFIED'), 'novas ações não falham de forma fechada')

const authorizationCalls = auth.match(/motorAuthorizeAction_\(action,/g) || []
assert(authorizationCalls.length === 2, 'autorização comercial deve validar sessão em cache e sessão persistida')
assert(configuration.includes('acesso_comercial:typeof motorCommercialAccessContext_'), 'estado do motor não informa o escopo comercial seguro')

const publicActions = new Set([
  'sistema.health',
  'sistema.bootstrap',
  'auth.login',
  'auth.first_access.complete',
  'auth.recovery.request',
  'auth.logout',
])
const routeActions = [...auth.matchAll(/case "([^"]+)"/g)].map((match) => match[1])
const featurePrefixes = [...motor.matchAll(/\{prefixo:"([^"]+)", recurso:/g)].map((match) => match[1])
const coreStart = motor.indexOf('const MOTOR_CORE_ACTIONS = [')
const coreEnd = motor.indexOf('];', coreStart)
const coreActions = new Set([...motor.slice(coreStart, coreEnd).matchAll(/"([^"]+)"/g)].map((match) => match[1]))
for (const action of routeActions) {
  if (publicActions.has(action)) continue
  const classified = coreActions.has(action) || featurePrefixes.some((prefix) => action.startsWith(prefix))
  assert(classified, `ação autenticada sem classificação comercial: ${action}`)
}

console.log('CONTRATO DO ACESSO COMERCIAL AO MOTOR APROVADO')
console.log(`${routeActions.length - publicActions.size} ações autenticadas, planos, assinatura e manutenção conferidos`)
