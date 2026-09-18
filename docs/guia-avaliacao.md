# Roteiro de avaliação

Este roteiro reúne os caminhos para conhecer o produto, localizar sua implementação e conferir as evidências do processo de desenvolvimento.

## 1. Conhecer o produto

Abra a [demonstração web](https://revive-beryl.vercel.app). O ambiente utiliza um banco de desenvolvimento e não inclui uma conta pública compartilhada. Para explorar as áreas autenticadas, crie uma conta de teste usando informações fictícias e um endereço que você controla.

Sugestão de percurso:

1. Realize o cadastro e o login.
2. Cadastre um hábito com data de início e valor diário de economia.
3. Faça um registro diário e confira sua exibição no histórico.
4. Crie uma meta e acompanhe seu progresso.
5. Navegue por dashboard, indicadores, calendário e conquistas.
6. Confira o comportamento do painel em uma janela menor.

As ações autenticadas gravam dados na conta utilizada. O ambiente de demonstração é compartilhado entre o painel e o aplicativo mobile.

## 2. Localizar a implementação

| Área avaliada | Referência no código |
| --- | --- |
| Rotas web e navegação | [`App.jsx`](../revive-painel/src/App.jsx) |
| Estado e carregamento dos dados | [`DataContext.jsx`](../revive-painel/src/contexts/DataContext.jsx) |
| API, autenticação e regras | [`index.js`](../index.js) |
| Sessões e contratos mobile | [`mobile-api.js`](../mobile-api.js) e [contratos](../revive-mobile/docs/api-contracts.md) |
| Sincronização local | [`sync-engine.ts`](../revive-mobile/src/core/sync/sync-engine.ts) |
| Modelagem e decisões | [Arquitetura](arquitetura-fluxograma.md) e [ADR mobile](../revive-mobile/docs/adr-0001-mobile-architecture.md) |

## 3. Conferir a qualidade

- Consulte as execuções no [GitHub Actions](https://github.com/VitorYunguiar/revive/actions/workflows/tests.yml), incluindo o commit e os logs de cada job.
- Execute as suítes conforme o [guia de testes](testes.md). Elas não exigem um banco real.
- Confira os critérios e os resultados descritos nos PRs; um status verde indica as verificações executadas, não cobertura completa do produto.
- Para Android, consulte o [guia mobile](../revive-mobile/README.md). Build e testes automatizados não substituem a homologação em aparelho físico, acompanhada na [Issue #7](https://github.com/VitorYunguiar/revive/issues/7).

## 4. Conferir o processo

| Evidência | Onde consultar |
| --- | --- |
| Tarefas e critérios de conclusão | [Issues](https://github.com/VitorYunguiar/revive/issues) |
| Alterações e validações por entrega | [Pull Requests](https://github.com/VitorYunguiar/revive/pulls?q=is%3Apr) |
| Evolução do código | [Histórico de commits](https://github.com/VitorYunguiar/revive/commits/main/) |
| Distribuição do instalador | [Release Node.js](https://github.com/VitorYunguiar/revive/releases/tag/tools-node-v22.20.0) |
| Fluxo de trabalho documentado | [CONTRIBUTING](../CONTRIBUTING.md) |
| Documentos do semestre | [Fase 02](academico/fase-02/README.md) |

## Limitações e próximos passos

O [roadmap](roadmap.md) concentra os itens ainda abertos: reprodução do banco vazio, validação Android em aparelho e garantias de sincronização sob falhas. As entregas acadêmicas preservadas refletem o estado do projeto nas respectivas versões; os guias atuais e o código devem orientar a execução.
