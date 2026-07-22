# FAB Control CMMS

Sistema CMMS industrial para operação, manutenção, PCM e gestão.

## Ambientes

- `main`: versão estável e aprovada.
- `dev`: desenvolvimento e integração.
- `feature/*`: funcionalidades isoladas.
- `fix/*`: correções isoladas.

## Estrutura

```text
frontend/   Aplicação web responsiva do operador
frontend-gestor/ Aplicação web responsiva do gestor e supervisor técnico
backend/    API, regras de negócio e integração com o banco
docs/       Arquitetura, padrões e contratos
mockups/    Referências visuais aprovadas
scripts/    Scripts de apoio
```

Referências visuais oficiais:

- `mockups/FAB-Control-Mockup operador.html`
- `mockups/FAB-Control-Mockup gestor.html`
- `mockups/FAB-Control-Mockup admin.html`

Não versionar tokens, credenciais, URLs privadas ou dados reais de produção.
