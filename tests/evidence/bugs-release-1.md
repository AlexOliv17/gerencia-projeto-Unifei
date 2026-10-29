# Bugs — Release 01 (`v1.1-release-1`)

Bugs encontrados durante a implementação e os testes da Release 01. Cada um é registrado no
[MantisHub do projeto](https://arenalocal.mantishub.io) (projeto "Arena Local", versão `v1.1-release-1`),
corrigido com um teste que o reproduz e marcado como resolvido no Mantis.

| ID | Mantis | Resumo | RF/RFS | Categoria | Gravidade | Status | Commit da correção |
|---|---|---|---|---|---|---|---|
| BUG-R1-01 | [#1](https://arenalocal.mantishub.io/view.php?id=1) | Coluna de ações desalinha as linhas das tabelas de campeonatos e usuários | RFS06, RFS03 | RFC02 - Manter Campeonato | minor | resolvido | `2ae3c69` |
| BUG-R1-02 | [#2](https://arenalocal.mantishub.io/view.php?id=2) | Último administrador ativo consegue excluir a própria conta pelo Meu perfil | RFS04 | RFC01 - Manter Usuário | major | resolvido | `9f84b0e` |
| BUG-R1-03 | [#3](https://arenalocal.mantishub.io/view.php?id=3) | Organizador que volta a pendente ainda altera, encerra e cancela seus campeonatos | RFS05–RFS08 | RFC02 - Manter Campeonato | minor | resolvido | `2fc9e42` |
| BUG-R1-04 | [#4](https://arenalocal.mantishub.io/view.php?id=4) | Dados pessoais da conta excluída continuam na caixa de saída | RFS04 | RFC01 - Manter Usuário | minor | resolvido | `2c8b35e` |

## BUG-R1-01 — Coluna de ações desalinha as linhas das tabelas

- **Encontrado em:** verificação manual da Release 01 (prints em desktop e celular).
- **Passos:** `npm run seed && npm start` → entrar como `organizador@arenalocal.com` / `Senha@123` → abrir *Meus campeonatos* (o mesmo ocorre em *Usuários*, logado como admin).
- **Esperado:** linhas alinhadas, bordas contínuas em todas as colunas.
- **Obtido:** a célula *Ações* fica deslocada em relação às demais células da linha; nas linhas sem ações (encerrado/cancelado) a célula vazia também sai do lugar.
- **Causa:** `display: flex` aplicado direto no `<td class="actions">`, que deixa de se comportar como célula de tabela.
- **Evidência:** `tests/evidence/screenshots/bug-r1-01-acoes-desalinhadas.png`
- **Teste de regressão:** `tests/selenium/layout.spec.js` (falhou antes da correção, passa depois).
- **Correção:** commit `2ae3c69` — as ações ficam em uma `<div class="actions">` dentro da célula. Mantis #1 marcado como *resolvido / corrigido* na versão `v1.1-release-1`.

## BUG-R1-02 — Último administrador ativo consegue excluir a própria conta

- **Encontrado em:** revisão de código final da Release 01.
- **Passos:** entrar como `admin@arenalocal.com` / `Admin@123` → *Meu perfil* → *Excluir minha conta* com a senha correta.
- **Esperado (RFS04):** não é possível excluir o último administrador ativo.
- **Obtido:** a conta era excluída e o sistema ficava sem nenhum administrador (só se recuperava com `npm run seed`, que apaga os dados).
- **Evidência:** `tests/evidence/screenshots/bug-r1-02-ultimo-admin-exclui-conta.png`
- **Teste de regressão:** `tests/selenium/profile.spec.js` — "último administrador ativo não exclui a própria conta".
- **Correção:** commit `9f84b0e` — a autoexclusão aplica a mesma regra da exclusão feita pelo admin.

## BUG-R1-03 — Organizador que volta a pendente ainda gerencia seus campeonatos

- **Encontrado em:** revisão de código final da Release 01.
- **Passos:** admin muda `organizador@arenalocal.com` para *Pendente* → o organizador entra em *Meus campeonatos* → *Alterar*, *Encerrar* e *Cancelar* continuavam funcionando.
- **Esperado:** só organizador validado (*Ativo*) cadastra, altera, encerra ou cancela campeonatos.
- **Obtido:** apenas o cadastro de novos campeonatos era bloqueado.
- **Evidência:** `tests/evidence/screenshots/bug-r1-03-organizador-pendente-gerencia.png`
- **Teste de regressão:** `tests/selenium/championships-manage.spec.js` — "organizador que volta a pendente não gerencia mais seus campeonatos".
- **Correção:** commit `2fc9e42` — essas ações mostram a tela de cadastro em validação e os botões somem da lista.

## BUG-R1-04 — Dados pessoais da conta excluída continuam na caixa de saída

- **Encontrado em:** revisão de código final da Release 01.
- **Passos:** visitante pede redefinição de senha para um usuário → o usuário exclui a própria conta → admin abre a *Caixa de saída*.
- **Esperado (RFS04/LGPD):** dados pessoais removidos ou anonimizados.
- **Obtido:** a mensagem de redefinição continuava com o e-mail e o nome originais.
- **Evidência:** `tests/evidence/screenshots/bug-r1-04-dados-na-caixa-de-saida.png`
- **Teste de regressão:** `tests/selenium/profile.spec.js` — "exclusão remove os dados da pessoa da caixa de saída".
- **Correção:** commit `2c8b35e` — a exclusão apaga essas mensagens e os tokens de redefinição junto com a anonimização.
