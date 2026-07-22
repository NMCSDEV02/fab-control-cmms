# Aplicação do gestor

## Escopo 1.4.0

O frontend do gestor é uma aplicação independente em `frontend-gestor/`, compatível com o contrato backend 1.4.0.

Fluxos implementados:

1. autenticação, primeiro acesso, expiração e revogação de sessão;
2. warmup autenticado sem bloquear o carregamento do painel;
3. consolidação de ações, paradas, ocorrências e KPI base;
4. aprovação ou reprovação de execução após auditoria;
5. aprovação ou devolução de modelos técnicos de checklist;
6. consulta somente leitura de ativos e componentes;
7. configuração e teste da URL publicada do Web App;
8. recuperação de acesso por referência não enumerável;
9. administração de usuários, perfis, bloqueios, senhas temporárias e sessões;
10. matriz de capacidades configurável para os perfis `GESTOR` e `OPERADOR`.

## Segurança administrativa

- Os endpoints `admin.usuarios.*` e `admin.permissoes.*` são exclusivos do perfil `ADMIN`.
- Hashes de PIN e senha nunca são serializados pelas consultas administrativas.
- Alterar perfil ou inativar uma conta revoga suas sessões ativas.
- O último administrador ativo não pode ser removido ou inativado.
- O administrador autenticado não pode rebaixar ou inativar a própria conta.
- Toda redefinição de senha e mudança da matriz gera registro em `audit_log`.

## Limites do contrato atual

- `cmms.kpis_base` não representa OEE formal. OEE exige disponibilidade planejada, desempenho, qualidade e consolidação por turno.
- Ocorrências possuem consulta gerencial, mas ainda não possuem workflow de classificação, atribuição e encerramento pelo gestor.
- Solicitações de base técnica ainda não possuem entidade persistente nem endpoint dedicado.
- O perfil `ADMIN` permanece integral e não editável para evitar bloqueio administrativo do ambiente.

Esses fluxos não devem ser simulados apenas no frontend. Cada incremento exige contrato, persistência, auditoria e teste próprios.
