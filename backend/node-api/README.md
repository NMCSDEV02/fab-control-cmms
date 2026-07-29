# Fab Control Node API

Backend transacional em Node.js, Fastify e PostgreSQL. Durante a migração, esta API permanece paralela ao Apps Script e não é a fonte operacional de produção.

## Requisitos

- Node.js 24 LTS;
- npm 11;
- PostgreSQL 18;
- banco criado pelas migrações em `database/postgres/migrations`;
- usuário de runtime membro de `fab_control_runtime`, sem privilégios administrativos.

## Instalação

```powershell
npm ci
Copy-Item .env.example .env
```

Preencha `.env` apenas com credenciais locais. O arquivo `.env` é ignorado pelo Git.

## Comandos

```powershell
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run validate
npm run seed:homologation
```

Validação integral com PostgreSQL local isolado:

```powershell
.\scripts\test-local.ps1
```

## Rotas implementadas

| Método | Rota                    | Finalidade                          |
| ------ | ----------------------- | ----------------------------------- |
| `GET`  | `/health/live`          | processo ativo                      |
| `GET`  | `/health/ready`         | API e PostgreSQL prontos            |
| `GET`  | `/v1/bootstrap`         | versões e capacidades públicas      |
| `POST` | `/v1/auth/login`        | login por matrícula e senha         |
| `POST` | `/v1/auth/first-access` | troca da senha temporária           |
| `POST` | `/v1/auth/recovery`     | solicitação genérica de recuperação |
| `GET`  | `/v1/auth/session`      | identidade, papéis e capacidades    |
| `POST` | `/v1/auth/logout`       | revogação imediata da sessão        |

### Catálogo CMMS

| Método         | Rota                                        | Finalidade                                   |
| -------------- | ------------------------------------------- | -------------------------------------------- |
| `GET`          | `/v1/cmms/structure`                        | árvore de plantas, setores e linhas          |
| `POST`/`PATCH` | `/v1/cmms/plants[/:plantId]`                | cadastro e desativação de plantas            |
| `POST`/`PATCH` | `/v1/cmms/sectors[/:sectorId]`              | cadastro e desativação de setores            |
| `POST`/`PATCH` | `/v1/cmms/lines[/:lineId]`                  | cadastro e desativação de linhas             |
| `GET`/`POST`   | `/v1/cmms/assets`                           | pesquisa paginada e cadastro de ativos       |
| `GET`/`PATCH`  | `/v1/cmms/assets/:assetId`                  | ficha técnica e alteração de ativo           |
| `GET`          | `/v1/cmms/assets/resolve/:code`             | resolução de TAG ou QR Code canônico         |
| `GET`/`POST`   | `/v1/cmms/assets/:assetId/components`       | componentes vinculados ao ativo              |
| `PATCH`        | `/v1/cmms/components/:componentId`          | alteração ou desativação de componente       |
| `GET`/`POST`   | `/v1/cmms/materials`                        | estoque técnico e cadastro de materiais      |
| `PATCH`        | `/v1/cmms/materials/:materialId`            | estoque, cadastro ou situação do material    |
| `POST`/`PATCH` | `/v1/cmms/parameters[/:parameterId]`        | definições técnicas de parâmetros            |
| `POST`         | `/v1/cmms/parameters/:parameterId/policies` | versão imutável de limites                   |
| `GET`/`POST`   | `/v1/cmms/parameters/:parameterId/readings` | histórico e registro idempotente de leituras |

Todas as rotas de domínio exigem sessão ativa e capacidade específica calculada no servidor.

## Massa controlada de homologação

O seed é bloqueado em produção, exige cinco senhas fornecidas por variáveis de ambiente e pode ser executado repetidamente sem duplicar registros.

```powershell
$env:DEMO_ADMIN_PASSWORD = '<senha-forte>'
$env:DEMO_QUALITY_PASSWORD = '<senha-forte>'
$env:DEMO_SAFETY_PASSWORD = '<senha-forte>'
$env:DEMO_MAINTENANCE_PASSWORD = '<senha-forte>'
$env:DEMO_OPERATOR_PASSWORD = '<senha-forte>'
npm run seed:homologation
```

A carga do bloco 3.2 inclui cinco perfis, áreas de Qualidade, Segurança e Manutenção, estrutura fabril, quatro estados operacionais de ativos, componentes, materiais com e sem necessidade de reposição, parâmetros decimais e booleanos, faixas, leituras normais/críticas e alerta operacional.

## Segurança aplicada

- Argon2id com `m=19456`, `t=2`, `p=1` e pepper externo;
- senha mínima de 12 caracteres, com maiúscula, minúscula, número e símbolo;
- token opaco aleatório; somente SHA-256 é persistido;
- sessão revogável com prazo;
- token de primeiro acesso separado e de curta duração;
- bloqueio progressivo por tentativas;
- resposta genérica para recuperação e credenciais inválidas;
- rate limit;
- Helmet e CORS explícito;
- logs com campos sensíveis ocultados;
- auditoria de login, primeiro acesso, recuperação e logout;
- autorização por capacidade em cada rota CMMS;
- paginação por cursor e busca preparada para índices;
- leitura técnica idempotente e classificação no PostgreSQL;
- histórico imutável de ativos e auditoria de todas as mutações;
- ausência de rotas de exclusão física no catálogo;
- contexto RLS definido dentro da transação.

## Regra operacional

Não apontar os frontends de Administrador, Gestor ou Operador para esta API antes da conclusão dos módulos de domínio, da Fase 4 de migração e da aprovação formal do corte.
