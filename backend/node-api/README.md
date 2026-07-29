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
- contexto RLS definido dentro da transação.

## Regra operacional

Não apontar os frontends de Administrador, Gestor ou Operador para esta API antes da conclusão dos módulos de domínio, da Fase 4 de migração e da aprovação formal do corte.
