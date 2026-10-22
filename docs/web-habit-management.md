# Edição e arquivamento de hábitos no painel — #60

Base revalidada em 22/10/2026: `main` e a branch de trabalho apontavam para `c00d42ef62caeb22fecfaddb4ce36df8b6280764`, confirmado também no remoto. As dependências #57 e #58 já estão integradas nessa base. Esta entrega não altera API, SQL ou aplicativo mobile.

## Fluxo e contrato

O gerenciamento fica nos detalhes do hábito. O painel inicial oferece filtros Ativos e Arquivados. Hábito arquivado continua acessível para consulta e reativação, mas sai das seleções de novos eventos e metas. A exclusão definitiva continua sendo uma ação separada, com seu próprio aviso; abrir esse aviso não navega para fora dos detalhes.

[HabitManagement](../revive-painel/src/components/habits/HabitManagement.jsx) edita nome, economia diária e início quando `inicio_editavel` permite. Envia `revision` e apenas os campos alterados a `PATCH /api/v2/vicios/:id`, via [serviço existente](../revive-painel/src/services/vicios.service.js). O limite de economia segue o PATCH: R$ 99.999.999,99, com duas casas decimais. Não são enviados novos campos de contrato.

O novo valor diário vale a partir da confirmação; o painel usa os totais canônicos do bootstrap, sem multiplicar dias passados pela taxa atual. A restrição de início considera registros, metas, conquistas e alterações de economia. A consulta prévia melhora o retorno da interface; o banco continua sendo a autoridade e pode recusar uma corrida posterior com `INICIO_COM_HISTORICO`.

Arquivar e reativar enviam somente `revision` e `ativo`. Um diálogo nativo explica a preservação de histórico, metas e conquistas, abre com foco em Cancelar, contém Tab/Shift+Tab e devolve o foco à ação de origem. Arquivar não registra recaída nem reinicia a sequência. Campos de uma edição ainda não enviada permanecem no rascunho ao arquivar ou reativar.

## Coordenação e pendências

[O coordenador](../revive-painel/src/offline/sync-coordinator.js) usa o mesmo Web Lock `revive-sync-UUID` para produzir eventos, processar a fila, editar, arquivar, reativar e consultar o estado remoto. A reconciliação interna executa sob o lock já adquirido, sem tentar adquiri-lo novamente.

A [operação de gerenciamento](../revive-painel/src/offline/habit-management.js):

1. Verifica conexão e conta/geração da sessão.
2. Reconcilia a fila existente, respeitando ordem, pausas, dependências e recuperação explícita.
3. Consulta o bootstrap e lê fila/páginas sob a mesma coordenação.
4. Bloqueia alterações se restam intenções relacionadas ao hábito. Conclusão de meta e correção de registro resolvem a relação pelo snapshot, páginas ou criação dependente. Uma referência não resolvida bloqueia por precaução, pois o snapshot pode ser parcial.
5. Compara a revisão; não adota silenciosamente a revisão nova para enviar a edição antiga.
6. Persiste um marcador de resultado incerto antes do PATCH. Só apresenta confirmação após resposta válida, nova consulta e verificações de sessão.

A reativação isolada de um hábito remotamente arquivado pode passar com pendências. É a estratégia de desbloqueio do [mobile](../revive-mobile/src/features/habits/manage-habit.ts): exigir fila vazia nessa situação impediria recuperar eventos recusados. Após reativar, a pessoa usa **Sincronização → Tentar novamente**. O evento mantém seu identificador e conteúdo; não é descartado nem substituído. Acrescentar nome, início ou economia à reativação remove essa exceção.

As atualizações comuns de bootstrap também consultam e gravam sob o lock, evitando que uma resposta iniciada antes do PATCH sobrescreva o snapshot confirmado. Consultas e PATCH têm prazo de 20 segundos. Não há garantia de envio com navegador fechado.

## Rascunhos, conflito e resposta perdida

Rascunhos ficam na store `meta` do IndexedDB já existente, sob chaves `habitDraft:UUID`. Não há nova versão de esquema ou limpeza de banco. Cada rascunho conserva base, campos locais, versão remota consultada, ação tentada e estado de recuperação. `sessionStorage` contém apenas o identificador da cópia por conta/hábito.

Cada montagem cria uma cópia independente e só troca o ponteiro após commit local. Assim, duplicar uma aba que herdou `sessionStorage` não faz as duas telas sobrescreverem o mesmo rascunho. Reload recupera a cópia apontada, incluindo conflito ou envio incerto. Cópias anteriores permanecem no banco até a limpeza explícita da conta já implementada no fluxo de saída; não há expiração automática. Limpeza manual do navegador ou perda de armazenamento pode remover rascunhos.

`REVISAO_CONFLITO` mantém a edição e mostra a versão remota. **Manter rascunho e revisar com esta versão** adota explicitamente a nova base, mas não envia nada. **Salvar alterações** continua sendo uma ação posterior. **Substituir rascunho pela versão remota** permite abandonar os campos locais por escolha explícita. Quando o início passa a ser restrito, **Usar data remota** resolve a diferença sem apagar nome ou economia editados.

Timeout, falha de rede, resposta inválida ou interrupção da aba não representam confirmação. O marcador durável bloqueia outro PATCH até **Consultar estado remoto** e revisar a comparação. A consulta não afirma a autoria de valores coincidentes nem reaplica automaticamente a alteração. Falha de armazenamento impede envio sem um rascunho durável e conserva os campos em memória.

Conta e geração são verificadas antes/depois de operações assíncronas. Trocar de A para B desmonta a edição anterior; uma resposta tardia não publica valores, erros ou confirmação de A em B. O rascunho incerto de A permanece para recuperação na conta correta. Tokens e credenciais não são persistidos nos rascunhos nem registrados nas evidências.

## Comparação com mobile e verificações

| Regra | Painel e mobile |
| --- | --- |
| Conexão obrigatória | Edição não entra na fila genérica |
| Coordenação | Reconciliação, leitura de revisão e PATCH serializados com produção local de eventos |
| Arquivo | Preserva início, metas, histórico e conquistas |
| Reativação isolada | Libera recuperação mesmo com fila recusada por arquivo |
| Início e economia | Reutilizam `inicio_editavel`, revisão e economia prospectiva do servidor |
| Conflito no painel | Acrescenta persistência por aba, comparação remota e reaplicação explícita após reload |

Os contratos foram comparados com [habit-edit.js](../habit-edit.js), [mobile-api.js](../mobile-api.js), [OpenAPI](openapi.js), [gerenciamento mobile](../revive-mobile/src/features/habits/habit-management.tsx) e [lock mobile](../revive-mobile/src/core/sync/habit-operation-lock.ts). A [migration da #21](../supabase/migrations/20261009120000_habit_edit_archive.sql) é reutilizada, sem duplicação.

[Testes Vitest da operação](../revive-painel/src/services/habit-management.test.js) cobrem duas abas e outra sessão concorrente durante PATCH, preservação do draft, campos alterados, taxa antes/depois, início com/sem histórico, dependências, arquivo com pendências, reativação e retry, offline, timeout, falha de persistência, produção de evento durante arquivo e troca A/B. A comparação de economia usa as mesmas fixtures e métricas canônicas já comparadas ao mobile na #59; não simula um novo cálculo de preços no cliente.

[Testes de interface](../revive-painel/src/components/habits/HabitManagement.test.jsx) cobrem reload, comparação/reaplicação explícita, confirmação acessível, offline, erro de armazenamento, bloqueio de início, recuperação e resposta tardia de A em B.

[A suíte de navegador](../tests/browser/habit-management.cjs) usa o painel compilado, HTTP da fixture e IndexedDB/Web Locks reais. Exercita duas abas, conflito após reload, foco/teclado do diálogo, filtro de arquivados, arquivo, reativação com evento recusado pelo servidor e retry com recibo. A RPC da fixture é sintética e não substitui PostgreSQL. Não são ignorados erros de página arbitrários.

```sh
npm run validate
npm run lint:web
# A suíte inicia e encerra somente seu próprio servidor em porta livre.
REVIVE_BROWSER_ARTIFACTS=/tmp/revive-habitos node tests/browser/habit-management.cjs
```

Resultados em 22/10/2026: `npm run validate` e `npm run lint:web` aprovados, com 80 testes de API, 162 testes do painel e build público. As suítes `test:browser:habits`, `test:browser:sync`, `test:browser:client` e `test:browser:storage` passaram em Chromium 151.0.7922.34, Firefox 153 e WebKit 26.5. As bibliotecas locais ausentes do WebKit foram instaladas com `npx playwright install-deps webkit` antes da rodada completa. Nenhum erro de página foi tolerado na nova suíte.

Capturas com dados sintéticos: [conflito após reload](evidencias-testes/web-habit-conflict-20261022.png), [hábito arquivado](evidencias-testes/web-habit-archived-20261022.png) e [hábito reativado](evidencias-testes/web-habit-reactivated-20261022.png). O [resumo por navegador](evidencias-testes/web-habit-management-20261022.json) registra apenas os resultados, sem conteúdo privado. O build emite aviso de tamanho do chunk principal acima de 500 kB, sem impedir a compilação.

PostgreSQL real: `npm run test:db` foi tentado, mas este ambiente não tem Docker (`docker: not found`). Não houve alteração de banco; a suíte existente continua necessária no ambiente suportado. Mobile: validação não aplicável, pois nenhum arquivo do aplicativo mudou. Navegadores físicos e leitor de tela humano não são homologados pelos testes automatizados.

## Implantação e recuperação

A publicação requer a API versionada e a migration da #21 já disponíveis, além das sessões/offline das #57/#58. Esta entrega não aplica SQL nem publica serviços. O build público mantém o mecanismo existente de atualização do worker. Não limpar IndexedDB, fila ou rascunhos para instalar ou reverter a versão.

Se houver conflito, comparar e reaplicar explicitamente. Em resposta perdida, consultar antes de novo envio. Em pendência incompatível, abrir Sincronização; quando a recusa for por arquivo, reativar primeiro e tentar novamente a mesma intenção. Em indisponibilidade de coordenação ou armazenamento, preservar a página e corrigir o ambiente antes de continuar.
