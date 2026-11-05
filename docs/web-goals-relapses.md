# Metas e recaídas no painel

A issue #63 conecta metas e recaídas às sessões v2 e à fila por conta já existente. A implementação reutiliza os contratos do mobile, sem endpoint novo, migration, alteração do aplicativo ou regravação de metas anteriores.

## Contratos e matriz web/mobile

Contratos revalidados sobre `main a36ab94`, com as entregas #61/#62 integradas:

| Regra | Referência mobile/API | Painel |
| --- | --- | --- |
| Criação | `POST /api/v2/metas`, `Idempotency-Key`; `CreateGoalInput` | Intenção `goal.create` no IndexedDB antes da rede; dias/valor positivos; data civil capturada no formulário |
| Baseline | RPC calcula `dias_abstinencia_inicio` e `valor_economizado_inicio` | DTO envia `iniciar_hoje` e `data_inicio_meta`, sem impor bases numéricas; base provisória indisponível até confirmação |
| Metas anteriores | IDs, tipos, datas e bases persistidos | Nenhuma regravação; `iniciar_hoje` booleano/string legado; progresso subtrai a base original e limita em 0–100% |
| Economia prospectiva | `current_habit_savings` e `progresso.economia_sequencia` integram segmentos históricos | Progresso usa o valor canônico; nunca multiplica todo o passado pela taxa nova; fallback legado usa valor recebido |
| Conclusão | `PATCH /api/v2/metas/:id`, somente `{ concluida: true }` | `goal.complete`; deduplicação sob Web Lock; conclusão de meta local depende da criação e recebe ID remoto na confirmação |
| Recaída | `POST /api/v2/vicios/:id/recaida`; `CreateRelapseInput` | `relapse.create`; escolha explícita sim/não; instante UTC, fuso IANA e motivo opcional; recibo local preserva o fuso após confirmação |
| Sem reset | Evento não abre novo período | Nenhuma alteração otimista do contador; sequência confirmada permanece |
| Com reset | Novo ciclo conserva recorde/conquistas permanentes | Contadores mudam após bootstrap confirmado; histórico e conquistas existentes continuam disponíveis |
| Arquivamento | Novos eventos bloqueados; metas anteriores consultáveis | Seleção mostra somente ativos; leitura e conclusão incluem metas de arquivados; arquivo durante formulário mantém conteúdo ou intenção recusada |
| Retry | Mesma chave, payload e instante | Recibos, binding de dependências e remoção da fila na mesma transação; duplo clique/conclusão em duas abas não cria outra intenção |
| Exclusão | `DELETE /api/metas/:id` e `DELETE /api/vicios/:id`, sessão v2 validada e ownership | Online, confirmação explícita e Web Lock; bloqueia referências/dependências pendentes; só remove cache após resposta de sucesso do contrato |
| A/B | Geração de sessão, conta e armazenamento isolados | Verificação após etapas assíncronas; resposta de A não publica em B; formulários remontam ao mudar conta/geração |

Referências: [rotas v2](../mobile-api.js), [rotas legadas e ownership](../index.js), [mutações mobile](../revive-mobile/src/features/mutations/use-revive-mutations.ts), [tipos mobile](../revive-mobile/src/domain/types.ts), [formulário mobile](../revive-mobile/app/%28app%29/goals/new.tsx), [baseline/economia no banco](../supabase/migrations/20261009120000_habit_edit_archive.sql) e [coordenador web](../revive-painel/src/offline/sync-coordinator.js).

A data da meta é preservada durante o retry. Como no mobile, a base numérica de uma nova meta offline é calculada na primeira confirmação do servidor, podendo diferir do momento de preenchimento. O painel informa isso ao apresentar a meta local. Metas sem baseline usam todo o valor confirmado da sequência; metas antigas não são reinterpretadas com a taxa atual. Quando os dois objetivos existem, o percentual conserva a prioridade histórica de dias. O mobile apresenta conclusão manual, sem percentual próprio; a comparação numérica usa o mesmo bootstrap/RPC consumido pelo aplicativo.

## Estados e uso

- Criar em Metas ou nos detalhes do hábito salva a intenção antes de iniciar o envio. Reabrir o navegador recupera as metas locais e conclusões dependentes.
- A interface distingue salvo neste navegador, pendente, enviando, envio não confirmado, falha/conflito e confirmado pelo servidor. Contadores consolidados continuam usando dados confirmados.
- Recaída exige escolher explicitamente manter ou reiniciar. Data, horário e fuso podem ser revisados; horários ambíguos/inexistentes por mudança de fuso são recusados. O título do formulário não declara sucesso antes de salvar.
- Falhas de armazenamento preservam o formulário e impedem o envio. Arquivamento detectado no cache mantém o formulário; recusa remota mantém a intenção para revisão.
- A tela Sincronização oferece retry com a mesma chave e consulta privada do conteúdo. Não criar outro evento para resolver timeout ou resposta perdida.
- Exclusão de meta usa diálogo com foco inicial em Cancelar, contenção de Tab e Escape. Sem conexão ou com pendência, a operação não é enviada. Exclusão falha mantém a meta, recibos e fila. Não há retry automático de DELETE.
- A exclusão de hábito também verifica intenções vinculadas, inclusive conclusão dependente de meta local. Não pode eliminar o hábito para contornar a fila.
- Carregamento, erro de atualização, cópia offline, vazio e conflitos têm mensagens acessíveis; campos possuem rótulos e os status usam `role="status"`. O modal de recaída conserva foco/teclado e conteúdo durante falha.

## Verificação e evidências

[Testes de serviço](../revive-painel/src/services/goals-relapses.test.js) verificam normalização dos DTOs, deduplicação sob lock, mapeamento de conclusão, arquivo, storage indisponível, retry imutável, expiração, A/B nos quatro fluxos e exclusões protegidas. [Progresso](../revive-painel/src/utils/goalProgress.test.js) cobre dias/economia legados, alteração prospectiva, reset, valores desconhecidos e conclusão sem hábito disponível. Os testes de [metas](../revive-painel/src/components/modals/MetasCard.test.jsx) e [recaída](../revive-painel/src/components/modals/RecaidaModal.test.jsx) verificam formulário preservado, ação dupla, rótulos, escolhas e estados.

O [teste de navegador](../tests/browser/goals-relapses.cjs), registrado em `test:browser:goals` e `test:browser`, usa build público, HTTP, IndexedDB, Service Worker e Web Locks reais em Chromium, Firefox e WebKit. Inclui fechamento/reabertura do contexto persistente com a origem offline, conclusão dependente, resposta perdida após commit, timeout real de 20 s, retry/recibo, arquivo durante formulário, exclusão falha/confirmada, sessão revogada e resposta de A retida até login real de B. A fixture usa dados sintéticos e RPCs em memória; não substitui PostgreSQL.

O [teste PostgreSQL específico](../tests/db/goals-relapses.mjs) foi integrado ao [runner real](../tests/db/real-postgres.mjs): concorrência de criação/conclusão com a mesma chave, base do bootstrap, taxa prospectiva sem alterar meta antiga, recaída com/sem reset e replay, recorde/conquistas, arquivo, sessão expirada e leitura/exclusão legadas com ownership v2.

```sh
npm run validate
npm run lint:web
/workspace/prompts/browser.sh test:browser:goals
# Regressões da fila, armazenamento, sessões e fluxos vizinhos:
/workspace/prompts/browser.sh test:browser
npm run test:db
```

Resultados locais em 23/10/2026: `npm run validate` aprovado (80 testes da API, 255 do painel e build), `npm run lint:web` aprovado. O build mantém o aviso de chunk principal acima de 500 kB.

`npm run test:db` não executou por ausência de Docker. A execução equivalente com PostgreSQL 17.11, PostgREST e Mailpit locais (`bash /tmp/revive-run-local-db.sh`) passou: instalação nova, upgrade legado, negativas de SQL e todos os testes HTTP/SQL do runner, incluindo o novo cenário. O [resumo de banco](evidencias-testes/web-goals-postgres-20261023.json) registra essa distinção. O comando suportado por CI continua sendo `npm run test:db`.

A rodada completa `test:browser` passou, incluindo sessões, armazenamento, sincronização, shell, cliente, UI offline, progresso, hábitos, diário, vontades e metas/recaídas. As suítes com múltiplos motores passaram em Chromium 151.0.7922.34, Firefox 153 e WebKit 26.5. Após o ajuste de apresentação do horário no fuso registrado, `validate`, `lint:web` e a suíte específica foram repetidos.

O [resumo por navegador](evidencias-testes/web-goals-relapses-20261023.json) confirma a rodada final nos três motores.

Capturas sintéticas: [meta offline e conclusão pendente](evidencias-testes/web-goals-offline-20261023.png), [meta confirmada](evidencias-testes/web-goals-confirmed-20261023.png), [exclusão falha](evidencias-testes/web-goals-delete-failed-20261023.png), [recaídas confirmadas e conflito](evidencias-testes/web-goals-conflict-20261023.png) e [conta B isolada](evidencias-testes/web-goals-account-b-20261023.png). Nenhuma evidência inclui credenciais ou conteúdo de motivos. O ambiente local usa Node 22, conforme `.nvmrc`. Não houve alteração no mobile; sua validação não se aplica a esta entrega. Não houve alteração de schema/API/OpenAPI.

## Implantação e recuperação

Publicar somente após sessões web v2 (#57), fila offline (#58) e edição/arquivo (#60) disponíveis. A base atual já contém essas dependências e #61/#62. A migration existente de edição/arquivo fornece o baseline por segmentos; não há SQL adicional nesta entrega.

O IndexedDB permanece na versão 2, com os mesmos stores, IDs e intenções; os novos métodos usam transações sobre stores existentes. Instalar/atualizar/reverter o painel não requer apagar histórico, fila ou rascunhos. O Service Worker mantém o mecanismo de atualização existente.

Se o envio não tiver confirmação, reabrir Sincronização e tentar a mesma intenção. A confirmação liga o ID local ao remoto e libera a conclusão dependente. Se houver recusa por arquivamento, reativar o hábito, revisar e tentar novamente; nenhuma pendência é descartada para permitir exclusão. Após resposta perdida de DELETE, consultar os dados antes de repetir a ação: somente uma resposta válida confirma a exclusão. Ao retornar à conta anterior, seu sender interrompido é reconciliado com a chave original. Dados da conta anterior não são mostrados na conta atual.

Não há deploy nesta entrega. Permanecem fora do escopo metas recorrentes/automáticas, redesign mobile, novos recursos terapêuticos, integrações nativas e publicação em produção/lojas. Testes de navegador não homologam aparelho físico ou leitor de tela humano.
