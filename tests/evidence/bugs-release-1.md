# Bugs — Release 01 (`v1.1-release-1`)

Bugs encontrados durante a implementação e os testes da Release 01. Cada um é registrado no
[MantisHub do projeto](https://arenalocal.mantishub.io) (projeto "Arena Local", versão `v1.1-release-1`),
corrigido com um teste que o reproduz e marcado como resolvido no Mantis.

| ID | Mantis | Resumo | RF/RFS | Categoria | Gravidade | Status | Commit da correção |
|---|---|---|---|---|---|---|---|
| BUG-R1-01 | [#1](https://arenalocal.mantishub.io/view.php?id=1) | Coluna de ações desalinha as linhas das tabelas de campeonatos e usuários | RFS06, RFS03 | RFC02 - Manter Campeonato | minor | resolvido | `2ae3c69` |

## BUG-R1-01 — Coluna de ações desalinha as linhas das tabelas

- **Encontrado em:** verificação manual da Release 01 (prints em desktop e celular).
- **Passos:** `npm run seed && npm start` → entrar como `organizador@arenalocal.com` / `Senha@123` → abrir *Meus campeonatos* (o mesmo ocorre em *Usuários*, logado como admin).
- **Esperado:** linhas alinhadas, bordas contínuas em todas as colunas.
- **Obtido:** a célula *Ações* fica deslocada em relação às demais células da linha; nas linhas sem ações (encerrado/cancelado) a célula vazia também sai do lugar.
- **Causa:** `display: flex` aplicado direto no `<td class="actions">`, que deixa de se comportar como célula de tabela.
- **Evidência:** `tests/evidence/screenshots/bug-r1-01-acoes-desalinhadas.png`
- **Teste de regressão:** `tests/selenium/layout.spec.js` (falhou antes da correção, passa depois).
- **Correção:** commit `2ae3c69` — as ações ficam em uma `<div class="actions">` dentro da célula. Mantis #1 marcado como *resolvido / corrigido* na versão `v1.1-release-1`.
