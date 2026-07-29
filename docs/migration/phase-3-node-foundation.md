# Fase 3 — Fundação Node.js

Status: bloco 3.1 concluído tecnicamente

Data: 29/07/2026

## Escopo concluído

Foi criada uma aplicação nova em `backend/node-api`, sem alterar nem desligar:

- Apps Script;
- Google Planilhas de produção;
- planilha canário;
- frontends atuais;
- dados existentes;
- implantações atuais.

O primeiro bloco implementa:

- Fastify 5 com TypeScript estrito;
- configuração validada por ambiente;
- conexão PostgreSQL com pool;
- transações com `app.tenant_id` e `app.user_id`;
- migrador com checksum e advisory lock;
- usuário de runtime com privilégio mínimo;
- healthcheck e bootstrap;
- autenticação;
- primeiro acesso;
- recuperação;
- consulta de sessão;
- logout;
- auditoria.

## Contrato de autenticação

### Senhas

Novas senhas usam Argon2id e pepper armazenado fora do banco. Hashes legados não serão silenciosamente aceitos pelo runtime. A Fase 4 definirá, por usuário, rehash seguro ou redefinição obrigatória.

### Sessões

O cliente recebe um token opaco aleatório. O banco guarda apenas o hash SHA-256. A sessão pode ser revogada imediatamente e nunca contém senha, PIN ou segredo de recuperação.

O token de primeiro acesso:

- possui finalidade própria;
- expira em quinze minutos por padrão;
- não autoriza rotas da aplicação;
- exige novamente a senha temporária;
- é revogado ao concluir a troca.

### Autorização

A sessão resolve:

- perfil público: `ADMIN`, `GESTOR` ou `OPERADOR`;
- papéis ativos;
- capacidades efetivas;
- negações explícitas;
- área técnica principal;
- cargo técnico.

As capacidades efetivas são calculadas no servidor. O frontend nunca é autoridade de permissão.

## Migração de esquema adicionada

`0008_runtime_access.sql` cria os grupos:

- `fab_control_runtime`;
- `fab_control_readonly`.

Nenhum deles pode:

- efetuar login diretamente;
- criar banco;
- criar papel;
- ignorar RLS;
- tornar-se superusuário;
- alterar `platform.schema_migrations`.

## Validação executada

Ambiente real:

- Node.js 24 LTS;
- PostgreSQL 18.4;
- banco isolado `fab_control_node_test_20260729_170455`;
- usuário `fab_control_api_local`;
- credencial protegida por DPAPI.

Resultado:

```text
7 testes
7 aprovados
0 falhas
0 ignorados
```

Foram comprovados:

- aplicação das oito migrações;
- contrato relacional;
- RLS com usuário não administrativo;
- login inválido;
- login válido;
- token restrito de primeiro acesso;
- alteração segura de senha;
- emissão de sessão da aplicação;
- resolução de papel e capacidade;
- recuperação sem revelar matrícula existente;
- cooldown da recuperação;
- logout com revogação;
- rejeição do token revogado;
- trilha de auditoria.

O banco foi preservado para inspeção. Nenhuma base existente foi removida.

## Blocos ainda pendentes da Fase 3

1. estrutura fabril, ativos, componentes, materiais e parâmetros;
2. checklists, versões e planos;
3. intervenções, OS, ações e execuções;
4. ocorrências, análises, validações e assinaturas permanentes;
5. notificações, outbox e atualização em tempo real;
6. documentos, evidências e armazenamento;
7. indicadores técnicos e auditoria administrativa;
8. contratos de compatibilidade e integração gradual dos três frontends;
9. testes E2E por perfil e por fluxo.

## Limite deste bloco

Nenhum dado das planilhas foi copiado. Nenhum frontend foi apontado para o Node.js. A Fase 4 continua bloqueada até que os módulos necessários da Fase 3 estejam implementados e exista nova aprovação explícita.
