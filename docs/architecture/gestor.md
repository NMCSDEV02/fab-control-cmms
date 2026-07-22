# Aplicação do gestor

## Escopo 1.4.0

O frontend do gestor é uma aplicação independente em `frontend-gestor/`, compatível com o contrato backend 1.3.1.

Fluxos implementados:

1. autenticação, primeiro acesso, expiração e revogação de sessão;
2. warmup autenticado sem bloquear o carregamento do painel;
3. consolidação de ações, paradas, ocorrências e KPI base;
4. aprovação ou reprovação de execução após auditoria;
5. aprovação ou devolução de modelos técnicos de checklist;
6. consulta somente leitura de ativos e componentes;
7. configuração e teste da URL publicada do Web App.

## Limites do contrato atual

- `cmms.kpis_base` não representa OEE formal. OEE exige disponibilidade planejada, desempenho, qualidade e consolidação por turno.
- Ocorrências possuem consulta gerencial, mas ainda não possuem workflow de classificação, atribuição e encerramento pelo gestor.
- Solicitações de base técnica ainda não possuem entidade persistente nem endpoint dedicado.
- A matriz de permissões permanece definida no backend e ainda não é configurável pela interface administrativa.

Esses fluxos não devem ser simulados apenas no frontend. Cada incremento exige contrato, persistência, auditoria e teste próprios.
