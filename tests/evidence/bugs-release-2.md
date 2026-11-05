# Bugs — Release 02 (`v1.2-release-2`)

Bugs encontrados durante a implementação e a revisão da Release 02. Cada um está registrado no
[MantisHub do projeto](https://arenalocal.mantishub.io) (projeto "Arena Local", versão `v1.2-release-2`),
foi corrigido com um teste que o reproduz e está marcado como resolvido no Mantis.

| ID | Mantis | Resumo | RF/RFS | Categoria | Gravidade | Status | Commit da correção |
|---|---|---|---|---|---|---|---|
| BUG-R2-01 | [#5](https://arenalocal.mantishub.io/view.php?id=5) | Banco local da R01 continua com o esquema antigo após `npm run seed` e gera erro 500 | RFS05, RFS07, RFS16 | General | major | resolvido | `0e73616` |
| BUG-R2-02 | [#7](https://arenalocal.mantishub.io/view.php?id=7) | Organizador consegue mudar a modalidade de um campeonato que já tem inscrições | RFS07, RFS15 | RFC08 - Realizar Inscrição | minor | resolvido | `03f664a` |
| BUG-R2-03 | [#6](https://arenalocal.mantishub.io/view.php?id=6) | Organizador que volta a pendente ainda vê a lista de atletas das equipes inscritas | RFS14, RFS16 | RFC07 - Manter Equipe | minor | resolvido | `6ec0c55` |

## BUG-R2-01 — Banco local da R01 continua com o esquema antigo após `npm run seed`

- **Encontrado em:** revisão de código final da Release 02.
- **Passos:** ter o `data/arena-local.db` da R01 → atualizar o código para a R02 → `npm run seed` (como o README indica) → entrar como organizador e cadastrar um campeonato, ou aprovar uma inscrição.
- **Esperado:** banco recriado com as tabelas e colunas novas.
- **Obtido:** erro 500 (`no such column: allow_waitlist` / `CHECK constraint failed` na caixa de saída). Na aprovação, o status já tinha sido gravado e o aviso ao responsável se perdia.
- **Causa:** o seed só apagava os dados; `CREATE TABLE IF NOT EXISTS` não altera tabelas que já existem. Os testes não pegavam porque cada arquivo de teste cria um banco novo.
- **Teste de regressão:** `tests/unit/database-reset.test.js` (falhou antes da correção, passa depois).
- **Correção:** commit `0e73616` — `npm run seed` apaga e recria o arquivo do banco (`resetDatabase`); aprovar/recusar e gravar o aviso acontecem na mesma transação.

## BUG-R2-02 — Modalidade do campeonato muda depois de haver inscrições

- **Encontrado em:** revisão de código final da Release 02.
- **Passos:** entrar como `organizador@arenalocal.com` / `Senha@123` → *Meus campeonatos* → *Alterar* a Copa Itajubá de Futsal (que tem inscrições) → modalidade *Vôlei* → *Salvar*.
- **Esperado (RFS15, regra 2):** a modalidade das equipes inscritas continua igual à do campeonato; a alteração é recusada.
- **Obtido:** "Campeonato atualizado com sucesso." e equipes de futsal aprovadas/pendentes num campeonato de vôlei.
- **Evidência:** `tests/evidence/screenshots/bug-r2-02-modalidade-alterada-com-inscricoes.png`
- **Teste de regressão:** `tests/selenium/championships-categories.spec.js` — "não muda a modalidade depois de haver inscrições".
- **Correção:** commit `03f664a` — com inscrições, a modalidade fica travada e o formulário mostra o erro no campo.

## BUG-R2-03 — Organizador pendente ainda vê a lista de atletas

- **Encontrado em:** revisão de código final da Release 02 (reclassificado de "menor" para corrigir nesta release por expor dado pessoal).
- **Passos:** uma equipe pede inscrição no campeonato de um organizador → o admin muda o organizador para *Pendente* → o organizador abre a página da equipe (`/teams/<id>`).
- **Esperado:** acesso negado — organizador pendente não tem direitos de organizador (mesma regra do Mantis #3).
- **Obtido:** dados da equipe e lista de atletas exibidos.
- **Evidência:** `tests/evidence/screenshots/bug-r2-03-organizador-pendente-ve-atletas.png`
- **Teste de regressão:** `tests/selenium/teams.spec.js` — "organizador que volta a pendente não vê mais a lista de atletas".
- **Correção:** commit `6ec0c55` — a página da equipe só abre para o responsável e para organizadores **validados** dos campeonatos em que ela pediu inscrição.
