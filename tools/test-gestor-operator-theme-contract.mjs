import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (file) => readFileSync(resolve(root, file), 'utf8')

const app = read('frontend-gestor/src/app/App.tsx')
const main = read('frontend-gestor/src/main.tsx')
const theme = read(
  'frontend-gestor/src/styles/manager-operator-theme.css',
)

assert.match(
  app,
  /className="manager-app-stage"[\s\S]*?className="app-shell app-shell--manager"/,
  'O aplicativo do Gestor deve possuir um escopo visual próprio.',
)
assert.match(
  main,
  /import '\.\/styles\/global\.css'[\s\S]*?import '\.\/styles\/manager-operator-theme\.css'/,
  'O tema do Gestor deve ser carregado depois dos estilos estruturais.',
)

for (const selector of [
  '.app-shell--manager .topbar',
  '.app-shell--manager > .app-navigation',
  '.app-shell--manager .manager-workspace-heading__status > button',
  '.app-shell--manager .manager-analytics-tabs',
  '.app-shell--manager .manager-field-filters',
  '.app-shell--manager .manager-library-detail',
  '.app-shell--manager .manager-qr-camera',
  '.app-shell--manager .manager-notification-center',
  '.app-shell--manager .review-dialog',
]) {
  assert.ok(
    theme.includes(selector),
    `Bloco visual obrigatório ausente: ${selector}`,
  )
}

assert.match(
  theme,
  /\.app-shell--manager\s*\{[\s\S]*?width: min\(100%, 1120px\);[\s\S]*?border-radius: 32px;/,
  'O Gestor deve usar o mesmo enquadramento amigável e centralizado do Operador.',
)
assert.match(
  theme,
  /\.app-shell--manager > \.app-content\s*\{[\s\S]*?overflow-x: hidden;/,
  'A área principal do Gestor deve impedir vazamento horizontal.',
)
assert.match(
  theme,
  /@media \(max-width: 699px\)\s*\{[\s\S]*?\.app-shell--manager\s*\{[\s\S]*?width: 100%;[\s\S]*?border-radius: 0;/,
  'No mobile, o Gestor deve ocupar a tela sem moldura ou corte lateral.',
)
assert.doesNotMatch(
  theme,
  /\.admin-(?:workspace|command|window|shell)/,
  'O tema assimilado não pode modificar o Command Workspace do Admin.',
)

console.log('CONTRATO VISUAL GESTOR → OPERADOR APROVADO')
console.log('Escopo, navegação, cartões, modais e responsividade conferidos')
