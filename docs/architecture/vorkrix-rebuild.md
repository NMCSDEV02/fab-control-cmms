# VORQIX — fundação da reconstrução operacional

## Decisão de produto

VORQIX deixa de organizar o cliente pelos antigos perfis `ADMIN`, `GESTOR` e
`OPERADOR`. O novo produto possui dois tipos de conta do cliente:

1. `OPERADOR`: pessoa que opera a máquina e acompanha somente o contexto
   operacional permitido.
2. `TECNICO_MANUTENCAO`: pessoa técnica, com especialidades e personas
   delegadas pelo PCM.

O Comando Interno não é uma conta operacional do cliente. Ele é uma sessão
temporária, auditada e protegida para suporte, versão, continuidade e operação
interna da plataforma.

## Autoridade do PCM

PCM é uma persona protegida de `TECNICO_MANUTENCAO`. Ela recebe a autoridade
operacional do cliente:

- estrutura industrial, ativos e componentes;
- usuários técnicos, especialidades, escopos e personas delegáveis;
- planos, checklists, programação, intervenções, OS e fila técnica;
- ocorrências, prioridades, SLA, pausas, materiais e acompanhamento;
- políticas de documento, notificações e participação de Qualidade/Segurança;
- indicadores, histórico, recorrência e auditoria do cliente.

PCM não altera contratos protegidos da plataforma, segurança de sessão,
versionamento, credenciais de manutenção ou políticas exclusivas do Comando
Interno.

## Personas técnicas

Uma conta `TECNICO_MANUTENCAO` pode receber mais de uma persona, sempre com
escopo, validade, autor e trilha de auditoria:

- PCM;
- Mecânica;
- Elétrica;
- Automação;
- Instrumentação;
- Utilidades;
- Qualidade;
- Segurança.

Qualidade e Segurança não são aprovadores obrigatórios do fluxo de manutenção.
Elas participam apenas quando um documento, uma exigência operacional do PCM ou
uma política protegida solicitar evidência, parecer ou assinatura.

## Fluxo de campo

### Operador

1. Localiza ativo por QR Code, TAG ou busca manual.
2. Visualiza resumo operacional permitido, leituras, parada e suas ocorrências.
3. Registra leitura, ocorrência ou parada com contexto do ativo/componente.
4. Acompanha estado, técnico responsável e retorno autorizado.

O QR Code deve funcionar com câmera quando disponível e oferecer digitação de
TAG/código quando a câmera for inexistente, negada ou indisponível.

### Técnico de manutenção

1. Recebe fila dentro de especialidade e escopo.
2. Assume atividade de forma transacional.
3. Diagnostica, inicia, pausa, retoma e conclui.
4. Registra componentes, ações técnicas, materiais, evidências e tempos.
5. Encaminha somente os documentos que exigirem participação adicional.

## Notificações

Notificações deixam de ser uma cadeia fixa de aprovações. Cada evento resolve
destinatários por contexto e política:

- ocorrência/parada: PCM e técnicos elegíveis pelo escopo;
- atividade assumida/pausada/concluída: PCM, Operador responsável e envolvidos;
- documento solicitado: Qualidade e/ou Segurança somente se selecionados;
- evento de plataforma: apenas Comando Interno.

Uma notificação sempre contém destino, contexto permitido, estado da ação,
autor, data e link direto. Falha de entrega secundária nunca expira uma sessão
nem bloqueia a abertura do portal.

## Entregas do PR de reconstrução

1. Contrato de identidade e autorização com tipos de conta, personas e escopos.
2. Migração aditiva e reversível dos dados atuais.
3. API de runtime para o portal do Operador e QR Code.
4. Aplicação de campo responsiva em 320, 360, 390, 768, 1024, 1366 e 1920 px.
5. Portal PCM desktop/tablet/mobile para controle operacional do cliente.
6. Comando Interno isolado, desktop-first e fora do login normal.
7. Políticas documentais opcionais para Qualidade e Segurança.
8. Testes unitários, integração PostgreSQL/RLS, contratos, E2E e smoke tests.

## Invariantes

- Nenhuma conta de cliente acessa Comando Interno pelo login comum.
- Nenhum endpoint confia em `tenant_id` enviado pelo navegador.
- A última configuração íntegra continua ativa diante de falha de publicação.
- Registros operacionais são invalidados com auditoria; nunca apagados.
- A ausência de câmera nunca gera tela vazia.
- A experiência de Operador e Técnico é responsiva; o Comando Interno é
  desktop-first.
