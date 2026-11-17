# Bugs — Release 03 (`v1.3-release-3`)

Bugs encontrados na revisão independente da Release 03. Cada um foi corrigido com um teste que o reproduz (ou, no PDF, conferido na tela antes e depois).

> **Mantis:** em 17/11/2026 o [MantisHub do projeto](https://arenalocal.mantishub.io) passou a responder *"MantisHub instance suspended, contact support."* (API REST e SOAP), então a versão `v1.3-release-3`, as categorias e estes bugs ainda não foram lançados lá. Assim que a instância for reativada, eles entram com os dados abaixo, como resolvidos.

| ID | Mantis | Resumo | RF/RFS | Categoria | Gravidade | Status | Commit da correção |
|---|---|---|---|---|---|---|---|
| BUG-R3-01 | pendente | A final do chaveamento ainda "A definir" não pode ser reagendada, e equipes escolhidas à mão são sobrescritas pelo vencedor | RFS09, RFS11 | RFC03 - Manter Tabela de Jogos | major | resolvido | `7150093` |
| BUG-R3-02 | pendente | O formato do campeonato pode mudar depois que a tabela tem jogos | RFS07, RFS09 | RFC03 - Manter Tabela de Jogos | minor | resolvido | `41a1838` |
| BUG-R3-03 | pendente | Com 3 grupos, o mata-mata põe 1º e 2º do mesmo grupo para se enfrentar | RFS09, RFS11 | RFC04 - Registrar Resultados | minor | resolvido | `7178b71` |
| BUG-R3-04 | pendente | No PDF do relatório, nomes longos quebram linha e ficam por cima da linha seguinte | RFS22 | RFC13 - Relatório de Inscrições | minor | resolvido | `29ef975` |

## BUG-R3-01 — Final "A definir" não pode ser reagendada

- **Encontrado em:** revisão de código final da Release 03.
- **Passos:** campeonato Mata-mata com a tabela gerada → *Tabela* → *Alterar* a Final (equipes "A definir") → mudar a data → *Salvar*.
- **Esperado:** a data muda; as equipes continuam vindo dos jogos anteriores (RFS11, regra 2).
- **Obtido:** "Campo obrigatório." em Equipe A e Equipe B. Escolhendo equipes à mão, o vencedor da semifinal depois sobrescrevia a vaga (podia ficar a mesma equipe dos dois lados).
- **Teste de regressão:** `tests/selenium/games.spec.js` — "reagenda a final do chaveamento ainda "A definir"…" e "POST forjado não troca as equipes de um jogo do chaveamento".
- **Correção:** commit `7150093` — em jogo alimentado pelo chaveamento, categoria e equipes ficam travadas (vêm dos jogos anteriores); data, horário, duração e local continuam editáveis.

## BUG-R3-02 — Formato muda com a tabela montada

- **Passos:** campeonato Pontos corridos com jogos → *Alterar* → formato *Mata-mata* → *Salvar*.
- **Esperado:** alteração recusada; a tabela foi gerada para o formato atual.
- **Obtido:** "Campeonato atualizado com sucesso." e classificação inconsistente (todos zerados, ou mensagem de tabela não montada com resultados lançados).
- **Teste de regressão:** `tests/selenium/games.spec.js` — "não muda o formato do campeonato depois de haver jogos (BUG-R3-02)".
- **Correção:** commit `41a1838` — com jogos ativos, o formato fica travado e o formulário mostra o erro no campo.

## BUG-R3-03 — Cruzamento errado com 3 grupos

- **Passos:** Grupos + mata-mata com 9 a 12 equipes aprovadas (3 grupos) → fase de grupos encerrada → *Gerar mata-mata*.
- **Esperado:** 1º de um grupo contra 2º de outro.
- **Obtido:** o 1º e o 2º do grupo C se enfrentavam na primeira fase.
- **Teste de regressão:** `tests/unit/schedule.test.js` — "cruzamento com N grupos: nenhum jogo da primeira fase entre equipes do mesmo grupo" (2 a 5 grupos).
- **Correção:** commit `7178b71` — os segundos colocados são rotacionados até nenhum confronto da primeira fase repetir um grupo.

## BUG-R3-04 — PDF com nomes sobrepostos

- **Passos:** equipe ou responsável com nome longo → *Relatório* → *Exportar PDF*.
- **Esperado:** cada linha da tabela legível.
- **Obtido:** o nome quebrava em várias linhas por cima da linha de baixo.
- **Evidência:** `tests/evidence/screenshots/bug-r3-04-pdf-nomes-sobrepostos.png`
- **Verificação:** PDF gerado com nomes longos e conferido na tela antes e depois (o conteúdo do PDF não é verificável pelo Selenium); `tests/selenium/report.spec.js` continua conferindo a exportação.
- **Correção:** commit `29ef975` — cada linha cresce até a célula mais alta e passa inteira para a página seguinte quando não cabe.
