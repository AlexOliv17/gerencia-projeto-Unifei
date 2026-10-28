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
| R01 | 2 CRUDs: [RFC01] Manter Usuário e [RFC02] Manter Campeonato | 19/11/2026 | `v1.1-release-1` |
| R02 | 4 CRUDs acumulados | 19/11/2026 | `v1.2-release-2` |
| R03 | 6 CRUDs acumulados + 1 relatório | 19/11/2026 | `v1.3-release-3` |
| R04 | 8 CRUDs acumulados + 1 relatório | 19/11/2026 | `v1.4-release-4` |

A partir da R01, cada release entrega também: cronograma atualizado com os dados de execução, baseline de configuração salva no Git, testes automatizados com Selenium e registro dos bugs encontrados no Mantis/Bugzilla.

## Gerência de configuração

- **`main`**: branch base do repositório. Não recebe tags.
- **`feat/release-N`**: branch de desenvolvimento de cada release (ex.: `feat/release-1`).
- **Tags `v1.N-release-N`**: marcam a baseline de configuração de cada release entregue (ex.: `v1.1-release-1`).

## Estrutura do repositório

```
.
├── documents/   # Artefatos de gerência e requisitos (plano de projeto, DRE, estimativa e cronograma)
└── README.md
```

## Documentos

- [Plano de Projeto](documents/AL%20-%20Plano%20de%20Projeto_00.docx)
- [Documento de Requisitos (DRE)](documents/Arena_Local_-_Documento_de_Requisitos_DRE_no_template.pdf)
- [Estimativa e Cronograma](documents/Arena_Local_Estimativa_e_Cronograma%20(2).xlsx)
