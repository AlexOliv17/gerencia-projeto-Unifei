# Arena Local

Repositório destinado ao trabalho final da disciplina de **Gerência de Projetos de Software (SDES06)** da UNIFEI, desenvolvido de forma incremental em cinco releases. O projeto contempla análise de requisitos, planejamento, implementação, testes automatizados e gerência de configuração.

## Sobre o projeto

O **Arena Local** é uma plataforma web para centralizar a divulgação de campeonatos esportivos amadores por região. Organizadores e ligas cadastram campeonatos de futebol, futsal, vôlei e corrida de rua, e os usuários encontram, acompanham e se inscrevem nessas competições.

Principais funcionalidades previstas:

- Cadastro e autenticação de usuários
- Cadastro e gestão de campeonatos por organizadores e ligas
- Busca de campeonatos com filtros por cidade, modalidade, categoria e data
- Publicação e consulta da tabela de jogos e da classificação
- Inscrição de equipes e participantes nos campeonatos
- Envio de avisos sobre eventos próximos

## Equipe

- Alex
- Cauã
- Laura
- Matheus

## Releases

| Release | Escopo | Entrega | Tag |
|---|---|---|---|
| R00 | Documentação: DRE, estimativa de tamanho (PCU), cronograma, matriz de rastreabilidade e plano de projeto | 20/10/2026 | `v1.0-release-0` |
| R01 | 2 CRUDs: [RFC01] Manter Usuário e [RFC02] Manter Campeonato | 29/10/2026 | `v1.1-release-1` |
| R02 | 4 CRUDs acumulados: + [RFC07] Manter Equipe e [RFC08] Realizar Inscrição | 05/11/2026 | `v1.2-release-2` |
| R03 | 6 CRUDs acumulados: + [RFC03] Manter Tabela de Jogos e [RFC04] Registrar Resultados e Classificação; + relatório [RFC13] Emitir Relatório de Inscrições | — | `v1.3-release-3` |
| R04 | 8 CRUDs acumulados: + [RFC09] Seguir Campeonatos e Equipes e [RFC10] Emitir Avisos de Eventos Próximos; + 1 relatório | — | `v1.4-release-4` |

A partir da R01, cada release entrega também: cronograma atualizado com os dados de execução, baseline de configuração salva no Git, testes automatizados com Selenium e registro dos bugs encontrados no Mantis/Bugzilla.

## Gerência de configuração

- **`main`**: branch base do repositório. Não recebe tags.
- **`feat/release-N`**: branch de desenvolvimento de cada release (ex.: `feat/release-1`).
- **Tags `v1.N-release-N`**: marcam a baseline de configuração de cada release entregue (ex.: `v1.1-release-1`).

## Tecnologias

- **Aplicação:** Node.js 22, Express, páginas EJS renderizadas no servidor, SQLite (better-sqlite3)
- **Testes:** Selenium WebDriver + Mocha (Chrome), testes unitários com `node:test`
- **Bugs:** MantisBT hospedado no [MantisHub](https://arenalocal.mantishub.io)

## Como rodar

Pré-requisitos: [Node.js 22+](https://nodejs.org) e Google Chrome.

```bash
npm install
npm run seed     # cria data/arena-local.db com os dados de exemplo
npm start        # http://localhost:3000
```

Ao atualizar o código para uma nova release, rode `npm run seed` de novo: o banco local é recriado com as tabelas novas (e os dados de exemplo).

### Usuários de teste (criados pelo `npm run seed`)

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@arenalocal.com | Admin@123 |
| Organizador (validado) | organizador@arenalocal.com | Senha@123 |
| Organizador (pendente) | pendente@arenalocal.com | Senha@123 |
| Usuário (equipe Unidos de Itajubá; segue a Liga de Vôlei e a equipe Leoas da Serra) | usuario@arenalocal.com | Senha@123 |
| Usuário (equipes Leoas da Serra, Vôlei Sapucaí, Estrelas do Vale, Ases de Santa Rita e Garças do Sapucaí) | capita@arenalocal.com | Senha@123 |

O seed também traz inscrições de exemplo (pendente, aprovada e recusada), a **Liga de Vôlei Santa Rita** com dois jogos já disputados, um agendado e a classificação pronta, e as largadas da **Corrida Rústica**. A Copa Itajubá de Futsal fica sem tabela, para demonstrar a geração automática.

### Tabela de jogos, resultados e relatório (R03)

Como organizador, em **Meus campeonatos**:

- **Tabela** (ou **Largadas**, na corrida de rua): cadastrar, gerar automaticamente, reagendar e cancelar jogos; registrar e corrigir resultados (com histórico); gerar o mata-mata depois da fase de grupos.
- **Relatório**: inscrições por categoria e status, com exportação em CSV e PDF.

A página de cada campeonato tem o botão **Tabela e classificação**, aberto também para visitantes.

### Seguir e avisos (R04)

- **Seguir** no detalhe do campeonato e ao lado de cada equipe inscrita; **Acompanhando** reúne os seguidos com próximos jogos e resultados.
- **Avisos (N)** no menu: alterações e cancelamentos de campeonato, jogo ou largada, resultado da inscrição, lembretes 24 h e 2 h antes de jogos e largadas, e 48 h antes do fim das inscrições dos campeonatos seguidos. Em **Preferências** cada tipo pode ser desligado.
- Os lembretes são verificados a cada minuto enquanto o servidor (`npm start`) está no ar.

Os e-mails (recuperação de senha e todos os avisos) são simulados: ficam na **Caixa de saída**, acessível ao administrador, com o e-mail de cada destinatário. Os avisos também aparecem em **Avisos** para cada usuário.

## Testes

```bash
npm run test:unit        # regras de validação e cálculo (datas, usuário, campeonato, equipe, inscrição, tabela, classificação, relatório)
npm test                 # testes Selenium no Chrome (headless)
HEADLESS=false npm test  # mesmos testes com o navegador visível
npm run test:report      # gera o relatório HTML em tests/evidence/report/
```

No PowerShell (Windows), para ver o navegador e rodar só um grupo de testes pelo nome:

```powershell
$env:HEADLESS = 'false'          # navegador visível neste terminal
$env:SLOW_MO = '800'             # opcional: pausa de 800 ms após cada passo, para acompanhar na apresentação
npx mocha --grep "RFS05"         # só os testes cujo nome contém "RFS05" (ou "Mantis", "RFS14", "RFS09"...)
Remove-Item Env:HEADLESS, Env:SLOW_MO   # volta ao normal
```

Use `npx mocha --grep` em vez de `npm test -- --grep`: no PowerShell o `--` é consumido pelo próprio shell e o filtro não chega ao Mocha.

Filtros prontos por release (o `|` separa grupos):

| Release | Comando |
|---|---|
| R01 | `npx mocha --grep "RFS0[1-8]\|RFS12\|Mantis\|Permissões por perfil\|Smoke"` |
| R02 | `npx mocha --grep "RFS14\|RFS15\|RFS16\|lista de espera\|equipes e inscri\|BUG-R2"` |
| R03 | `npx mocha --grep "RFS09\|RFS10\|RFS13\|RFS22\|tabela de jogos, resultados"` |
| R04 | `npx mocha --grep "RFS17\|RFS18"` |

Cada arquivo de teste sobe a aplicação com um banco temporário e os dados de exemplo, então os testes não dependem do banco local. Falhas geram screenshot em `tests/evidence/screenshots/`.

## Bugs

Os bugs encontrados são registrados no [MantisHub do projeto](https://arenalocal.mantishub.io) (projeto *Arena Local*, uma versão por release) e resumidos em `tests/evidence/bugs-release-N.md`, com o teste de regressão e o commit da correção.

## Estrutura do repositório

```
.
├── documents/          # Artefatos de gerência e requisitos (plano de projeto, DRE, estimativa e cronograma)
├── public/             # CSS
├── src/
│   ├── db/             # schema, conexão e dados de exemplo (seed)
│   ├── middleware/     # sessão, mensagens e controle de acesso
│   ├── models/         # acesso aos dados
│   ├── routes/         # rotas por área (auth, perfil, admin, campeonatos, equipes, inscrições, jogos, relatório)
│   ├── rules/          # cálculos puros: geração da tabela, chaveamento, classificação, CSV
│   ├── validation/     # regras de negócio e validação
│   └── views/          # páginas EJS
├── tests/
│   ├── unit/           # testes unitários (node:test)
│   ├── selenium/       # testes Selenium (Mocha) e utilitários
│   └── evidence/       # relatório de testes, screenshots e registro de bugs
└── package.json
```

## Documentos

- [Plano de Projeto](documents/AL%20-%20Plano%20de%20Projeto_00.docx)
- [Documento de Requisitos (DRE)](documents/Arena_Local_-_Documento_de_Requisitos_DRE_no_template.pdf)
- [Estimativa e Cronograma](documents/Arena_Local_Estimativa_e_Cronograma%20(2).xlsx)
