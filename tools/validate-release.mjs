import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const releasePath = path.join(root, 'release', 'fab-control.release.json')
const backend = path.join(root, 'backend', 'apps-script')
const frontendPackage = path.join(root, 'frontend', 'package.json')

function fail(message) {
  console.error('ERRO: ' + message)
  process.exit(1)
}

function read(file) {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

function gitCheckIgnore(relativePath) {
  const result = spawnSync(
    'git',
    ['check-ignore', '-q', '--', relativePath],
    { cwd: root, stdio: 'ignore' },
  )
  return result.status === 0
}

function gitIsTracked(relativePath) {
  const result = spawnSync(
    'git',
    ['ls-files', '--error-unmatch', '--', relativePath],
    { cwd: root, stdio: 'ignore' },
  )
  return result.status === 0
}

const manifest = JSON.parse(read(releasePath))
const expected = manifest.release

for (const [name, version] of Object.entries(manifest.components)) {
  if (version !== expected) {
    fail(name + ' = ' + version + '; esperado ' + expected)
  }
}

const packageJson = JSON.parse(read(frontendPackage))
if (packageJson.version !== expected) {
  fail('frontend/package.json = ' + packageJson.version)
}

const config = read(path.join(backend, '00_Config.js'))
const releaseMatch = config.match(/const FAB_RELEASE_VERSION = "([^"]+)";/)
if (!releaseMatch || releaseMatch[1] !== expected) {
  fail('FAB_RELEASE_VERSION divergente')
}

for (const field of [
  'RELEASE_VERSION',
  'API_VERSION',
  'SCHEMA_VERSION',
  'CONTRACT_VERSION',
  'FRONTEND_VERSION',
]) {
  if (!config.includes(field + ': FAB_RELEASE_VERSION')) {
    fail('campo central ausente em 00_Config.js: ' + field)
  }
}

const db = read(path.join(backend, '02_Db.js'))
for (const key of [
  'release.version',
  'app.version',
  'api.version',
  'schema.version',
  'contract.version',
  'frontend.version',
]) {
  if (!db.includes('chave:"' + key + '"')) {
    fail('chave ausente em 02_Db.js: ' + key)
  }
}

const http = read(path.join(backend, '03_Http_Auth.js'))
for (const key of [
  'release_version',
  'api_version',
  'schema_version',
  'contract_version',
  'frontend_version',
]) {
  if (!db.includes(key) && !http.includes(key)) {
    fail('campo de versão ausente: ' + key)
  }
}

const contract = read(path.join(backend, '18_Contrato_Frontend_UI.js'))
if (contract.includes('"1.1.1"')) {
  fail('contrato legado 1.1.1 ainda ativo')
}
if (!contract.includes('FAB.CONTRACT_VERSION')) {
  fail('contrato central não utilizado')
}

const visual = read(path.join(backend, '19_Tela_Operador_Visual_Final.js'))
if (visual.includes('"1.1.2b"')) {
  fail('contrato legado 1.1.2b ainda ativo')
}
if (!visual.includes('CMMS112B_CONTRACT_VERSION = FAB.CONTRACT_VERSION')) {
  fail('contrato visual não centralizado')
}

const sourceFiles = fs
  .readdirSync(backend)
  .filter((name) => name.endsWith('.js') || name === 'appsscript.json')
  .sort()

if (sourceFiles.length !== 26) {
  fail('quantidade de fontes backend = ' + sourceFiles.length + '; esperado 26')
}

if (fs.readdirSync(backend).some((name) => name.endsWith('.gs'))) {
  fail('arquivo .gs ativo encontrado')
}

for (const name of sourceFiles.filter((name) => name.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', path.join(backend, name)], {
    stdio: 'pipe',
  })
}

JSON.parse(read(path.join(backend, 'appsscript.json')))
execFileSync('git', ['diff', '--check'], { cwd: root, stdio: 'pipe' })

const material = sourceFiles
  .map((name) => {
    const canonical =
      name === 'appsscript.json'
        ? name
        : path.basename(name, path.extname(name)) + '.script'

    const hash = crypto
      .createHash('sha256')
      .update(read(path.join(backend, name)), 'utf8')
      .digest('hex')
      .toUpperCase()

    return { canonical, hash }
  })
  .sort((a, b) => a.canonical.localeCompare(b.canonical))
  .map((item) => item.canonical + '\n' + item.hash + '\n')
  .join('')

const aggregate = crypto
  .createHash('sha256')
  .update(material, 'utf8')
  .digest('hex')
  .toUpperCase()

const expectedHash = manifest.target?.backendSourceSha256
if (!expectedHash) {
  fail('target.backendSourceSha256 ausente no manifesto')
}
if (aggregate !== expectedHash) {
  fail(
    'SHA256 agregado divergente. Manifesto=' +
      expectedHash +
      '; calculado=' +
      aggregate,
  )
}

const claspRelative = 'backend/apps-script/.clasp.json'
if (!gitCheckIgnore(claspRelative)) {
  fail('.clasp.json não está protegido pelo .gitignore')
}
if (gitIsTracked(claspRelative)) {
  fail('.clasp.json está rastreado pelo Git')
}

const environmentRelative = 'release/fab-control.environment.local.json'
if (!gitCheckIgnore(environmentRelative)) {
  fail('arquivo local de ambiente não está protegido pelo .gitignore')
}
if (gitIsTracked(environmentRelative)) {
  fail('arquivo local de ambiente está rastreado pelo Git')
}

const environmentPath = path.join(root, environmentRelative)
if (!fs.existsSync(environmentPath)) {
  fail('arquivo local de ambiente ausente: ' + environmentRelative)
}

const environment = JSON.parse(read(environmentPath))
const target = manifest.target || {}
const authFeature = manifest.features?.operatorAuthentication || {}
const bootstrapFeature = manifest.features?.productionBootstrap || {}
const canaryEvidence = manifest.canaryEvidence || {}

if (
  !Number.isInteger(target.immutableAppsScriptVersion) ||
  target.immutableAppsScriptVersion < 1
) {
  fail('target.immutableAppsScriptVersion inválido')
}
if (!target.deploymentId || String(target.deploymentId).toUpperCase() === 'HEAD') {
  fail('target.deploymentId imutável ausente')
}
if (!target.gitCommit || !/^[0-9a-f]{7,40}$/i.test(target.gitCommit)) {
  fail('target.gitCommit inválido')
}
if (authFeature.remoteValidation !== 'approved') {
  fail('homologação remota da autenticação não está aprovada')
}
if (authFeature.status !== 'homologated') {
  fail('status da autenticação não está homologated')
}
if (bootstrapFeature.remoteValidation !== 'approved') {
  fail('homologação remota do bootstrap não está aprovada')
}
if (bootstrapFeature.status !== 'canary-homologated') {
  fail('status do bootstrap não está canary-homologated')
}

if (environment.environment !== 'homologation') {
  fail('ambiente local não está identificado como homologation')
}
if (environment.release !== expected) {
  fail('release do ambiente local divergente')
}
if (environment.immutableAppsScriptVersion !== target.immutableAppsScriptVersion) {
  fail('versão imutável local divergente do manifesto')
}
if (environment.deploymentId !== target.deploymentId) {
  fail('deployment local divergente do manifesto')
}
if (environment.gitCommit !== target.gitCommit) {
  fail('commit homologado local divergente do manifesto')
}
if (environment.backendSourceSha256 !== aggregate) {
  fail('hash homologado local divergente do backend')
}
if (environment.isolatedFromProduction !== true) {
  fail('isolamento da planilha de homologação não confirmado')
}
if (
  !environment.webAppUrl ||
  !environment.webAppUrl.includes('/s/' + target.deploymentId + '/exec')
) {
  fail('URL imutável de homologação inválida')
}

for (const check of [
  'health',
  'bootstrap',
  'permanentAdminLogin',
  'authenticatedAdminRead',
  'remoteLogout',
  'revokedTokenRejected',
  'readinessAfterRevokedSessions',
  'frontendBuild',
]) {
  if (environment.checks?.[check] !== 'approved') {
    fail('evidência de homologação ausente: ' + check)
  }
}

const bootstrapPhase = environment.bootstrapPhase || {}
if (bootstrapPhase.immutableAppsScriptVersion !== 2) {
  fail('fase local de bootstrap não está vinculada ao Apps Script @2')
}
if (bootstrapPhase.gitCommit !== 'a30a7ea') {
  fail('commit local da fase de bootstrap divergente')
}
if (bootstrapPhase.deploymentId !== 'AKfycbyU6MBRAmtSrmBcZ1H1UruWquMCJoy95jgz_9SF9rJGDWmebb68HHF5DWl1dL2H4dtF') {
  fail('deployment local da fase de bootstrap divergente')
}
for (const check of [
  'productionSchema',
  'initialAdminBootstrap',
  'temporaryPasswordCleared',
  'firstAccess',
]) {
  if (bootstrapPhase.checks?.[check] !== 'approved') {
    fail('evidência local da fase de bootstrap ausente: ' + check)
  }
}

if (canaryEvidence.environment !== 'isolated') {
  fail('manifesto não confirma isolamento do canário')
}
if (canaryEvidence.release !== expected) {
  fail('release da evidência canária divergente')
}
if (canaryEvidence.backendSourceSha256 !== aggregate) {
  fail('hash da evidência canária divergente')
}

const manifestBootstrapPhase =
  canaryEvidence.phases?.bootstrapAndFirstAccess || {}
if (manifestBootstrapPhase.immutableAppsScriptVersion !== 2) {
  fail('manifesto não vincula o bootstrap à versão @2')
}
if (manifestBootstrapPhase.sourceGitCommit !== 'a30a7ea') {
  fail('manifesto possui commit incorreto para a fase de bootstrap')
}
if (manifestBootstrapPhase.deploymentId !== 'AKfycbyU6MBRAmtSrmBcZ1H1UruWquMCJoy95jgz_9SF9rJGDWmebb68HHF5DWl1dL2H4dtF') {
  fail('manifesto possui deployment incorreto para a fase de bootstrap')
}

const manifestFinalPhase = canaryEvidence.phases?.finalCandidate || {}
if (
  manifestFinalPhase.immutableAppsScriptVersion !==
  target.immutableAppsScriptVersion
) {
  fail('fase final do manifesto diverge da versão-alvo')
}
if (manifestFinalPhase.sourceGitCommit !== target.gitCommit) {
  fail('fase final do manifesto diverge do commit-alvo')
}
if (manifestFinalPhase.deploymentId !== target.deploymentId) {
  fail('fase final do manifesto diverge do deployment-alvo')
}

const legacyEvidence = manifest.homologationEvidence || {}
if (legacyEvidence.appliesToRelease !== '1.3.0') {
  fail('evidência legada não está vinculada à release 1.3.0')
}
for (const check of [
  'health',
  'bootstrap',
  'authenticationApi',
  'frontendIntegration',
  'sessionStorageOnly',
  'recoveryNonEnumeration',
  'temporaryLock',
]) {
  if (legacyEvidence[check] !== 'approved') {
    fail('evidência legada ausente: ' + check)
  }
}

console.log('VALIDAÇÃO LOCAL DA RELEASE APROVADA — VALIDADOR V1.6')
console.log('Release única: ' + expected)
console.log('Componentes: frontend, backend API, contrato e schema')
console.log('Arquivos backend: ' + sourceFiles.length)
console.log('SHA256 agregado do backend: ' + aggregate)
console.log('Hash conferido com release/fab-control.release.json')
console.log('Metadados locais sensíveis: ignorados e não rastreados')
console.log(
  'Gate remoto de homologação: APROVADO — Apps Script @' +
    target.immutableAppsScriptVersion,
)
console.log('Deployment imutável e planilha isolada: conferidos')
console.log('Gate de publicação: pendente de tag limpa e promoção controlada para produção')
