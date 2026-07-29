# PostgreSQL — Fab Control

Status: esquema da Fase 2, aguardando aprovação antes da criação do backend Node.js.

## Objetivo

Este diretório contém o novo modelo relacional aditivo. Ele não substitui o Apps Script, não lê as planilhas e não executa migração de dados.

## Versão validada

- PostgreSQL 18.4
- extensão `pg_trgm`
- codificação UTF-8
- datas persistidas como `timestamptz`
- isolamento obrigatório por `tenant_id`

## Ordem das migrações

1. `0001_platform.sql`
2. `0002_iam.sql`
3. `0003_cmms.sql`
4. `0004_checklists_and_plans.sql`
5. `0005_operations.sql`
6. `0006_workflow_governance_migration.sql`
7. `0007_integrity_security_views.sql`

Cada arquivo abre e confirma a própria transação. Uma falha interrompe a aplicação e não confirma o arquivo incompleto.

## Validação local

O script abaixo:

1. cria um banco novo e isolado;
2. aplica todas as migrações em ordem;
3. executa o contrato relacional;
4. preserva o banco de teste para inspeção.

```powershell
.\database\postgres\scripts\validate-local.ps1
```

O teste cobre:

- RLS forçada em todas as tabelas multiempresa;
- catálogo completo dos nove tipos de checklist;
- vínculo componente/equipamento;
- bloqueio de checklist sem etapas;
- bloqueio de OS sem assinatura;
- assinatura permanente e imutável;
- liberação segura para a fila do Operador;
- persistência de leitura de notificação.

## Segredos

Nenhuma senha ou string de conexão pertence ao repositório. A instância local usa credencial protegida por DPAPI no perfil do Windows:

`%LOCALAPPDATA%\FabControl\postgres-dev-credential.xml`

As credenciais de homologação e produção serão fornecidas por cofre de segredos na Fase 3.

## Regras para os próximos blocos

- não editar migrações já aplicadas em ambiente compartilhado;
- adicionar novas alterações em arquivos numerados;
- nunca executar migração diretamente em produção;
- executar backup e ensaio de restauração antes de qualquer corte;
- usar usuário de aplicação sem privilégios de proprietário;
- definir `app.tenant_id` e `app.user_id` dentro de cada transação autenticada;
- não conceder `BYPASSRLS` ao backend.
