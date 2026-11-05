# Cadastro de hábitos no web — issue #56

Validação em 16/10/2026, sobre a main 0b3fd2b, com as alterações deste PR. Esta evidência se refere ao painel, não homologa Android, iOS ou os futuros fluxos offline.

## Comportamento

O cadastro apresenta nome (sugestões apenas preenchem esse campo), data civil e economia diária opcional. Vazio equivale a zero; moeda brasileira e ponto decimal são aceitos, sem expoentes, negativos ou truncamento. Datas anteriores a 1900, inexistentes ou futuras são recusadas. Metas ficam na área própria.

A criação usa o POST existente com apenas nome_vicio, data_inicio e valor_economizado_por_dia. O formulário só fecha após receber vicio.id. Falhas HTTP preservam campos; timeout de 20 segundos, interrupção de resposta ou erro de servidor deixam resultado incerto. Não há retry automático.

No resultado incerto, os campos ficam preservados e o reenvio exige consulta bem-sucedida da lista e decisão explícita. A lista não prova que um POST interrompido terminou; essa limitação é mostrada. O usuário pode fechar se identificar o hábito salvo. Uma consulta lenta/falha posterior à confirmação do POST não transforma o cadastro em erro.

## Evidências automatizadas

- [Validação de campos](../revive-painel/src/utils/habitForm.test.js): moeda, limites, data civil, ano bissexto e nome.
- [Contrato HTTP](../revive-painel/src/services/vicios.service.test.js): payload, confirmação canônica, corpo incompleto, timeout sem retry, rejeição e 204 em outros endpoints.
- [Modal](../revive-painel/src/components/modals/NovoVicioWizard.test.jsx): campos efetivos, formulário preservado, duplo envio, Escape durante envio, consulta antes de retry, foco e erros associados aos campos.
- [Contexto](../revive-painel/src/contexts/DataContext.test.jsx): falha propagada, POST confirmado com GET falho/lento, recarga e retorno de conta anterior.

Comandos: `npm run validate`, `npm run lint --prefix revive-painel` e `git diff --check`. O PR registra os resultados finais. Não houve alteração no schema/API do servidor; teste PostgreSQL permanece no CI geral.

## Navegador

Edge 155.0.4283.45 headless, locale pt-BR e timezone America/Sao_Paulo, com painel Vite real e respostas HTTP sintéticas. Não houve acesso a conta ou banco de produção.

Cenários aprovados: envio de somente três campos, valor 1.234,56 convertido em 1234.56, dois submits nativos gerando um POST, hábito reaparecendo após reload, rejeição 422 preservando formulário, commit simulado seguido de resposta perdida sem retry, consulta exibindo hábito salvo sem reenviar, viewport 360x640 sem overflow horizontal e economia vazia salva como zero. Sem erro JavaScript de página.

A rolagem do fundo é bloqueada enquanto o modal está aberto, o conteúdo do modal é rolável, o restante da aplicação fica inert e o foco permanece no diálogo. O botão de abertura tem nome acessível também na tela pequena. Não houve certificação por leitor de tela real nem homologação Firefox/WebKit nesta entrega; a matriz ampliada pertence à [issue #7](https://github.com/vitoradriao/revive/issues/7).

## Implantação e recuperação

Sem migration, dependência nova ou alteração de endpoint. Build normal do painel após revisão/CI. Reverter o PR não apaga hábitos já confirmados, mas restaura o comportamento anterior do formulário; não repetir um POST incerto como estratégia de recuperação. Esta entrega não autoriza publicação automática em produção.
