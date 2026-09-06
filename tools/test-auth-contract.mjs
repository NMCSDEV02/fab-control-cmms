import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const nodeAuth = read('backend/node-api/src/modules/auth/auth.service.ts')
const gestorSession = read('frontend-gestor/src/services/auth/session.ts')
const gestorConfig = read('frontend-gestor/src/services/api/config.ts')
const gestorAuth = read('frontend-gestor/src/services/api/auth.ts')
const gestorLogin = read('frontend-gestor/src/pages/LoginPage.tsx')
const gestorPortal = read('frontend-gestor/src/portal.ts')
const operatorSession = read('frontend/src/services/auth/session.ts')
const operatorConfig = read('frontend/src/services/api/config.ts')
const operatorAuth = read('frontend/src/services/api/auth.ts')
const operatorLogin = read('frontend/src/pages/LoginPage.tsx')

assert(nodeAuth.includes("'ARGON2ID'"), 'Node não valida credencial Argon2id')
assert(nodeAuth.includes('APPLICATION'), 'Node não emite sessão APPLICATION')
assert(nodeAuth.includes('completeFirstAccess'), 'Node não implementa primeiro acesso')

for (const source of [gestorSession, operatorSession]) {
  assert(source.includes('window.sessionStorage'), 'sessão não usa sessionStorage')
  assert(!source.includes('window.localStorage'), 'sessão auth não pode usar localStorage')
  assert(!source.includes('saveGestorToken') && !source.includes('saveOperatorToken'), 'sessão não pode manter token paralelo')
}

for (const source of [gestorConfig, operatorConfig]) {
  assert(source.includes('JSON.parse(raw)'), 'token não é derivado da sessão autenticada')
  assert(!source.includes('inMemoryGestorToken') && !source.includes('inMemoryOperatorToken'), 'token paralelo em memória ainda ativo')
}

for (const source of [gestorAuth, operatorAuth]) {
  assert(source.includes("'auth.login'"), 'frontend não chama auth.login')
  assert(source.includes("'auth.first_access.complete'"), 'frontend não conclui primeiro acesso')
  assert(source.includes("'auth.logout'"), 'frontend não revoga sessão')
  assert(source.includes('expira_ms'), 'contrato não contém expiração da sessão')
  assert(source.includes('capacidades?'), 'contrato não expõe capacidades')
}

for (const source of [gestorLogin, operatorLogin]) {
  assert(source.includes('onAuthenticated({'), 'primeiro acesso não autentica diretamente')
  assert(source.includes('password.length >= 12'), 'política de senha de 12 caracteres ausente')
}

assert(gestorPortal.includes('isGestorIdentity'), 'política de portal não está centralizada')
assert(gestorPortal.includes('papeis'), 'portal não considera papéis efetivos')
assert(!gestorPortal.includes('GESTOR_PCM'), 'contrato de persona indevido introduzido na estabilização')

console.log('CONTRATO NODE DE AUTENTICAÇÃO APROVADO')
console.log('Sessão única, primeiro acesso direto, política de portal e token derivado verificados')
