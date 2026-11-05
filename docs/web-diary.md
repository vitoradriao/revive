# Check-in e diário no painel — #61

Base local revalidada em 22/10/2026: `879c78b` (merge do #75), na branch `feature/61-checkin-diario`. As issues #57, #58 e #60 foram consultadas e estão encerradas. Os contratos foram conferidos no código dessa base, incluindo [API](../mobile-api.js), [validação dos campos](../diary-records.js), [editor mobile](../revive-mobile/src/features/diary/record-editor.tsx), [operação durável mobile](../revive-mobile/src/features/diary/edit-record.ts) e [migration existente](../supabase/migrations/20261013120215_diary_record_edit.sql). Não há mudança de API, SQL ou aplicativo mobile.

## Uso

Na Jornada, **Check-in rápido** permite selecionar hábito ativo, informar humor e expandir a reflexão opcional (gatilhos, conquistas e observações). O dia civil é calculado na criação da intenção, inclusive quando o formulário atravessa meia-noite. A data persistida não muda em retries. Há consulta dos registros de hoje; outro registro exige **Adicionar outro registro hoje**, com autorização restrita ao hábito/dia atual. O botão de envio bloqueia duplo toque, e chamadas simultâneas iguais compartilham a mesma operação no cliente.

Nos detalhes do hábito, o formulário completo usa a mesma operação. **Diário por período** consulta início/fim inclusivos e oferece paginação e detalhe. Para consultar arquivados, selecione **Arquivados** na Jornada e abra o hábito. O arquivo bloqueia novas criações, preservando consulta e correção do histórico.

**Abrir registro** permite corrigir humor, gatilhos, conquistas e observações. Data e hábito não são editáveis. Somente os campos alterados entram no PATCH. Texto legado acima dos limites é exibido integralmente e não entra no PATCH ao alterar outro campo. Campo limpo é enviado como `null`, permitido pelo DTO. Limites ao alterar: humor 100; gatilhos/conquistas 500 cada; observações 1000. Corrigir diário não registra recaída nem reinicia contadores.

Cada campo tem rótulo e descrição de limite. Status usam `role="status"`, erros usam `role="alert"`; o detalhe recebe foco e devolve-o à ação de abertura. Campos de uma correção pendente ficam somente para leitura, permitindo consultar o texto pelo teclado. Sem registros, a interface informa ausência **nos dados disponíveis**. Consultas offline, fallback por erro e páginas ainda não carregadas exibem cobertura parcial.

## Persistência e create → update

[Os serviços](../revive-painel/src/services/registros.service.js) encaminham consultas e intenções ao [cliente offline](../revive-painel/src/offline/client.js). As [operações do diário](../revive-painel/src/offline/diary-operations.js) executam sob o Web Lock por conta já usado na sincronização. Consultas prévias podem ocorrer antes da intenção; nenhum POST/PATCH é enviado antes do commit local.

1. O envio valida os campos, determina o dia local e consulta registros disponíveis daquele hábito/dia. A verificação sob lock também considera cache e fila, evitando duas criações implícitas entre abas. Registros remotos desconhecidos durante o offline não podem ser excluídos; a interface informa essa cobertura parcial.
2. `record.create` recebe UUID, payload e data imutáveis em IndexedDB. A interface recebe o recibo local somente após o commit. Erro de publicação do cache não transforma uma intenção gravada em uma segunda tentativa de criação.
3. Corrigir essa criação produz `record.update` com `recordId=local:UUID` e `dependsOn` apontando à criação. Não altera o payload/chave da criação e não cria outro registro.
4. O recibo canônico grava, na mesma transação, confirmação, mapping de ID/revisão, atualização dos caches, vinculação dos dependentes e remoção da criação. Se a criação for confirmada enquanto o editor está aberto, o mapping resolve o ID/revisão ao salvar.
5. Só então o PATCH dependente sai com ID canônico e `expected_version`. Cada retry conserva a chave original. Após resposta perdida, o replay confirma o resultado previamente aplicado.

Uma falha de correção permanece correção na fila; nunca vira POST. A ordem e o bloqueio por dependência seguem a fila existente. Só um recibo `confirmed` autoriza a mensagem de confirmação no servidor; ausência na fila, isoladamente, não significa sucesso.

O schema de IndexedDB permanece na versão 2. Rascunhos de edição usam novas chaves no store `meta`; não há limpeza de stores ou migração destrutiva. A sessão da aba contém apenas o identificador do rascunho. Cada montagem ganha uma cópia própria para evitar sobrescrita por abas duplicadas. Erros ao persistir rascunhos aparecem na interface.

## Conflitos, páginas e isolamento

`REVISAO_CONFLITO` mantém payload local e intenção na fila, inclusive após reload. **Consultar versão remota sem apagar meu texto** mostra os campos remotos ao lado do formulário local. **Reaplicar minha correção nesta versão** é uma ação explícita: usa a revisão consultada, gera outra chave e substitui atomicamente a intenção recusada, conservando um recibo `replaced` com a intenção anterior. Campos remotos que não faziam parte da correção permanecem fora do PATCH. Se houver nova disputa, o servidor pode devolver outro conflito; não há reaplicação automática.

A listagem usa `GET /api/v2/registros` com `inicio`, `fim`, `vicio_id`, `limit` (1–100) e cursor opaco de data/ID. O intervalo máximo continua sendo 3.660 dias entre início e fim. O detalhe usa `GET /api/v2/registros/:id`. As páginas são combinadas por ID e revisão, ordenadas por data/ID; correções pendentes também são projetadas nas páginas seguintes. Mudança de período invalida a resposta anterior. Offline combina páginas e snapshot disponíveis e informa incompletude.

Conta/geração são verificadas antes e depois das etapas assíncronas. Consultas e componentes ficam vinculados à conta; respostas tardias de A não são publicadas em B. O coordenador existente preserva envio interrompido de A para replay na conta correta.

## Testes e evidências

- [Unitários de contrato](../revive-painel/src/utils/diary.test.js): virada civil, limites/nulabilidade, legado, empate de data e projeção create→update.
- [Operações e serviços](../revive-painel/src/services/diary.test.js): dependência, ID confirmado durante edição, outro registro explícito, arquivados, conflito/reaplicação, cursor, falha de storage e troca A/B durante GET/PATCH.
- [Componentes](../revive-painel/src/components/diary/Diary.test.jsx): duplo toque, reflexão, rótulos, vazio/offline, paginação, rascunho, legado e comparação sem substituir o texto local.
- [Navegador](../tests/browser/diary.cjs): Chromium/Firefox/WebKit, IndexedDB/Web Locks reais, criação+correção offline com reload, resposta perdida, ID canônico, conflito com outra sessão pelo contrato nativo, texto após reload, reaplicação, legado, paginação e arquivados. A fixture passa pelas rotas reais do Express, mas a RPC é sintética; não equivale a PostgreSQL nem a um aparelho mobile.
- [Storage real](../tests/browser/offline-storage.cjs): acrescenta aborto da substituição de conflito e reabertura do rascunho, além da cobertura existente de upgrade, recibo e dependência atômicos. As suítes de progresso e offline foram ajustadas aos rótulos/ação explícita do novo formulário.

Comandos para executar em ambiente com Node 22+, dependências e navegadores instalados:

```sh
npm ci
npm ci --prefix revive-painel
npm run validate
npm run lint:web
npm run test:browser:diary
REVIVE_BROWSER_ARTIFACTS=/tmp/revive-diario npm run test:browser:diary
# Storage/sync usam os servidores descritos no guia offline.
npm run test:browser:storage
npm run test:browser:sync
npm run test:browser:client
npm run test:browser:offline-ui
npm run test:browser:progress
npm run test:browser:habits
```

Resultados em 23/10/2026:

| Comando | Resultado |
| --- | --- |
| `npm run validate` | Aprovado: documentação, 80 testes de API, 119 unitários do painel, 72 de integração do painel e build público |
| `npm run lint:web` | Aprovado: zero erros e zero avisos |
| `npm run test:browser` | Aprovado: nove suítes em Chromium, Firefox e WebKit, incluindo diário e progresso |
| `git diff --check` | Aprovado |

A suíte completa foi executada com os servidores de fixture/Vite nas portas 3177/4177, como no CI (`.github/workflows/tests.yml`). Versões: Chromium 151.0.7922.34, Firefox 153.0, WebKit 26.5. O build mantém o aviso existente de chunk principal acima de 500 kB; ele não impede a compilação e não corresponde a aviso de lint.

A verificação de arquivados usa o componente real de check-in e comprova que apenas hábitos ativos aparecem na seleção. A fixture de progresso já contém um registro no dia: o teste confirma que o humor fica bloqueado e exige **Adicionar outro registro hoje** antes de salvar uma nova intenção offline, sem incorporar essa pendência aos indicadores consolidados.

Na suíte do diário, a indisponibilidade de rede encerra conexões HTTP da origem e conserva o estado remoto. O reload precisa abrir um novo documento pelo shell em cache; o teste verifica o novo documento, o texto final, a mesma intenção e a ausência de gravações remotas durante a indisponibilidade. Após restaurar a sessão, a fixture mantém indisponíveis as respostas de criação já gravadas até a recuperação explícita. Assim, o teste comprova commit remoto, ausência de recibo local, dependência ainda bloqueada e replay com a mesma chave, mesmo em motores que repetem conexões transparentemente. O arquivo do hábito é realizado pela interface, com confirmação, antes de consultar novamente as 24 entradas paginadas.

As capturas funcionais usam fontes do sistema, sem depender do CDN de fontes. Transições finitas são concluídas antes das capturas. Os diagnósticos de leitura interrompida do WebKit (navegação, troca de conta ou rede desligada) só são aceitos quando correspondem a uma requisição GET real marcada como falha na página; erros arbitrários continuam reprovando a suíte.

Capturas exclusivamente sintéticas obtidas em Chromium: [comparação do conflito após reload](evidencias-testes/web-diary-conflict-20261023.png) e [histórico preservado após arquivo](evidencias-testes/web-diary-archived-20261023.png). O [registro de execução](evidencias-testes/web-diary-20261022.json) contém os resultados e versões dos três motores, sem conteúdo privado.

Mobile e banco: validações de área não aplicáveis a esta alteração, pois nenhum arquivo dessas aplicações/contratos mudou. O teste de banco real existente continua necessário no ambiente suportado para comprovar a integração completa; as fixtures não o substituem. Leitor de tela humano e aparelho físico não foram homologados nesta sessão.

## Implantação e recuperação

A entrega reutiliza as sessões/offline das #57/#58 e os contratos da #22/#60. Os gates web e as capturas desta entrega foram concluídos; nenhum deploy foi executado. Para instalação nova, seguir as migrations existentes do projeto. Para upgrade ou rollback do painel, preservar IndexedDB, fila, mappings, recibos e rascunhos; não limpar dados para fazer a atualização passar.

Em falha de envio, usar Sincronização para tentar novamente a mesma intenção. Em conflito, abrir o registro e comparar/reaplicar explicitamente. Em criação recusada por arquivo, reativar o hábito antes de retomar. Falha de storage mantém o formulário em memória, sem afirmar salvamento; corrigir a indisponibilidade antes de sair da página. Funcionalidades fora da #61, redesenho mobile e publicação em produção/lojas não integram esta entrega.
