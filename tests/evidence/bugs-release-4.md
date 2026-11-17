# Bugs — Release 04 (`v1.4-release-4`)

Bugs encontrados na revisão independente da Release 04, cada um corrigido com um teste que falhava antes da correção.

> **Mantis:** o [MantisHub do projeto](https://arenalocal.mantishub.io) está suspenso desde 17/11/2026 (*"MantisHub instance suspended, contact support."*). A versão `v1.4-release-4`, as categorias "RFC09 - Seguir" e "RFC10 - Avisos" e estes bugs entram lá, como resolvidos, assim que a instância for reativada.

| ID | Mantis | Resumo | RF/RFS | Categoria | Gravidade | Status | Commit da correção |
|---|---|---|---|---|---|---|---|
| BUG-R4-01 | pendente | Largada cancelada e depois remarcada não avisa ninguém | RFS18 | RFC10 - Avisos | major | resolvido | `8af60db` |
| BUG-R4-02 | pendente | Quem segue uma equipe excluída continua recebendo avisos dela e não consegue deixar de seguir | RFS17, RFS18 | RFC09 - Seguir | minor | resolvido | `de38612` |

## BUG-R4-01 — Largada remarcada sem aviso

- **Encontrado em:** revisão de código final da Release 04.
- **Passos:** organizador cancela a largada de uma categoria (participantes e seguidores recebem "Largada cancelada") → depois salva a largada de novo em *Alterar*.
- **Esperado:** aviso de que a largada voltou a valer (Tabela 09, "Alteração de data, horário ou local").
- **Obtido:** nenhum aviso; quem foi avisado do cancelamento continuava achando que a prova não aconteceria.
- **Teste de regressão:** `tests/selenium/notifications.spec.js` — "cancelar e depois remarcar a largada avisa os dois momentos (BUG-R4-01)" (falhou com o código anterior).
- **Correção:** commit `8af60db` — remarcar uma largada cancelada gera o aviso "Largada remarcada".

## BUG-R4-02 — Seguidores presos a equipe excluída

- **Passos:** João segue a equipe Leoas da Serra → a responsável exclui a conta (a equipe é excluída) → jogos da equipe continuam na tabela.
- **Esperado:** a equipe sai da lista de quem a seguia (spec, seção 3) e não gera mais avisos.
- **Obtido:** João continuava recebendo lembretes e alterações dos jogos da equipe, sem vê-la em *Acompanhando* nem conseguir deixar de segui-la (404).
- **Teste de regressão:** `tests/unit/notifications.test.js` — "equipe excluída sai da lista de quem a seguia e não gera mais avisos (BUG-R4-02)".
- **Correção:** commit `de38612` — excluir a equipe apaga quem a seguia.
