# Persistência offline web — #58

**Estado em 16/10/2026: implementação no [PR #73](https://github.com/vitoradriao/revive/pull/73), aguardando integração e publicação autorizada.** A [#58](https://github.com/vitoradriao/revive/issues/58) inclui armazenamento, fila, shell público, acesso à cópia local, Sincronização e escolhas de saída. Os formulários já existentes de registro, meta/conclusão e recaída usam a fila. A paridade completa do diário [#61](https://github.com/vitoradriao/revive/issues/61), o formulário de vontades [#62](https://github.com/vitoradriao/revive/issues/62) e as demais regras de metas/recaídas [#63](https://github.com/vitoradriao/revive/issues/63) continuam nas issues próprias; seus contratos de persistência já estão disponíveis.

Base: main 5ca7db4, com sessões [#57](https://github.com/vitoradriao/revive/issues/57) integradas e [rollout autorizado](web-sessions-rollout.md). Preservar Express, autenticação própria, PostgreSQL, React/Vite e APIs mobile.

## Armazenamento e transações

[account-database.js](../revive-painel/src/offline/account-database.js) abre um IndexedDB por UUID de usuário, prefixo revive-account-, esquema 2. A versão 1 é a fixture predecessora usada para provar atualização aditiva; não representa uma implantação web anterior.

| Store | Chave e conteúdo |
| --- | --- |
| meta | key; identidade sem credenciais e sequência monotônica |
| snapshots | key=bootstrap; payloadVersion, dados da conta, data de consulta e indicação de cache após mutação |
| outbox | id; usuário, tipo, payload, dependência, ordem, estado, tentativas e próximo retry |
| pages | key por tipo/filtros/cursor; página consultada, data e cobertura disponível |
| receipts | key da intenção; confirmação, descarte explícito ou intenção histórica |
| mappings | key da intenção; ID remoto e revisão confirmada |

A gravação só retorna sucesso no oncomplete da transação nativa. Um request individual bem sucedido não comprova commit. Escritas pedem durability=strict quando a implementação aceita a opção. Quota, abertura negada, aborto e versão incompatível são falhas; nenhum fluxo limpa o banco para reparar automaticamente.

A atualização adiciona stores sem apagar os anteriores. O evento versionchange fecha a conexão antiga. O cliente informa mudança de versão e oferece reabertura da página, preservando as pendências. Se uma aba antiga perdeu a conexão durante HTTP, sua intenção permanece para reconciliação pela nova versão.

Snapshot exige usuario.id da conta aberta. Campos de sessão não pertencem aos payloads de fila; refresh/access/senhas nunca são persistidos. Snapshot e páginas privadas ficam no IndexedDB, fora de CacheStorage. Partição por usuário e guarda de geração evitam misturar dados; isto não é uma credencial online nem uma promessa de criptografia do navegador.

## Intenções, recibos e dependências

[O coordenador](../revive-painel/src/offline/sync-coordinator.js) suporta record.create/update, urge.create, relapse.create e goal.create/complete. Reutiliza Idempotency-Key e os endpoints v2; não inventa outra API ou regra de progresso.

O produtor deve gerar um UUID estável por intenção e reutilizá-lo ao repetir o mesmo envio local. Não gerar outro UUID em retry de rede. Duplo clique precisa ser coordenado pela tela; duas chamadas com UUIDs diferentes representam duas intenções.

Exemplo de correção antes de confirmar uma criação:

```js
const created = await coordinator.enqueue('record.create', payload, { id: creationId });
await coordinator.enqueue('record.update', {
  recordId: created.localId,
  expected_version: null,
  observacoes: 'Texto final'
}, { id: correctionId, dependsOn: creationId });
```

dependsOn pertence às opções, não ao JSON enviado. Correções sucessivas devem depender da última correção pendente; uma correção de registro já confirmado usa ID/revisão atuais e nenhuma dependência antiga.

Após resposta válida, uma única transação registra recibo e mapeamento, vincula filhos ainda não enviados, atualiza itens já presentes nas páginas/snapshot e remove a intenção. Aborto desse conjunto deixa a fila intacta. clearAccount recusa limpar uma fila não vazia por padrão. discardPending=true só é permitido após decisão explícita ou exclusão da conta confirmada; o fluxo comum sincroniza/descarta primeiro.

Nunca mudar payload ou revisão de uma intenção que já foi enviada. Uma reaplicação após revisão de conflito precisa de nova intenção aprovada pela pessoa, preservando o texto anterior.

Recibos confirmados não são removidos por refresh do bootstrap. O cache fica marcado staleAfterMutation até nova consulta canônica; a interface separa recibos confirmados das pendências e informa a data/cobertura da cópia local. Snapshot/bootstrap não comprova histórico completo ou todas as páginas.

O processamento conserva a ordem e pausa no primeiro conflito, impedimento permanente ou dependência não resolvida. Estados: pending, sending, retry e recovery. Falha conhecida conserva status/código, sem conteúdo privado em logs. Falha após commit remoto e antes de recibo local usa o mesmo UUID para obter a resposta anterior. Envio interrompido é recuperado apenas pelo dono do lock.

Web Locks usa revive-sync-UUID e serializa processamento, enqueue e ações locais entre abas. Sem coordenação segura, a operação falha. Fechar uma aba libera o lock. HTTP tem limite de 20 segundos; timeouts não comprovam que o servidor deixou de gravar. Retry de falhas transitórias mantém a chave; conflitos exigem recuperação explícita.

O coordenador exige access token da mesma conta/geração antes e depois do HTTP; trocar para B deixa a intenção de A preservada, sem notificar a interface de B. Retorno com paused/pending ou erro não pode ser apresentado como sincronização completa. run pode rejeitar se sessão/storage falhar; a integração deve tratar também essa rejeição.

Retenção local não tem expiração automática nesta versão. Os recibos do servidor usam a retenção existente. Limpeza manual do navegador, descarte explícito, restauração do banco ou perda de armazenamento limitam a garantia; não prometer “exatamente uma vez” ilimitado. Descartar uma resposta incerta remove a intenção local, sem desfazer um possível evento remoto.

## Shell público e atualização

[sw.js](../revive-painel/public/sw.js) faz precache do HTML público, ícones, manifesto e todos os chunks públicos emitidos. [O build Vite](../revive-painel/vite.config.js) gera asset-manifest.json e deriva a versão do worker do conteúdo real do shell/manifestos. Alterar o conteúdo do shell produz nova versão e instalação, sem depender de lembrar um número manual.

Somente arquivos públicos conhecidos entram no cache; /api e métodos diferentes de GET seguem a rede. Navegação indisponível/5xx volta ao index público. Respostas privadas nunca são colocadas em CacheStorage pelo worker. Conserva um shell anterior para assets de abas abertas e não força recarga da página; IndexedDB não é modificado pela ativação.

main registra updateViaCache=none; [Vercel](../vercel.json) evita cache HTTP permanente do script/manifesto. Desenvolvimento Vite continua sem service worker. A ativação/instalação pode falhar por falta de armazenamento: a interface não promete reabertura offline quando o shell não foi instalado; uma cópia IndexedDB, isoladamente, não garante a disponibilidade dos arquivos públicos.

## Evidências reais desta preparação

- [offline-storage.cjs](../tests/browser/offline-storage.cjs): IndexedDB real nas três engines, fechamento/reabertura de perfil, upgrade abortado preservando esquema 1, recibo abortado sem alterações parciais, dependência create/update, páginas/cursor e isolamento. Quota realmente recusada no Chromium; fábrica negada testada separadamente por injeção. Não extrapolar quota para Firefox/WebKit.
- [offline-sync.cjs](../tests/browser/offline-sync.cjs): HTTP real/handlers compartilhados e IndexedDB nas três engines; seis tipos de mutação, duas abas, commit com resposta perdida, reinício, replay único, conflito durável, liberação de lock e A/B com retomada. A [fixture](../tests/browser/session-fixture.cjs) usa RPC sintética, explicitamente; não substitui PostgreSQL real.
- [offline-shell.cjs](../tests/browser/offline-shell.cjs): build público, troca efetiva de worker com intenção local pendente, reabertura com servidor próprio desligado e ausência de /api nos caches. Chromium gerenciado 151.0.7922.34, Firefox 153 e WebKit 26.5 automatizados; Edge 155.0.4283.45 também foi exercitado nas rodadas anteriores. Não comprova Safari/iOS físico.
- No WebKit Windows, a emulação setOffline causou erro interno antes do fallback. A prova usa servidor realmente desligado sem esse protocolo. Edge/Firefox usam ambas as condições. Os testes encerram apenas helpers/perfis que eles próprios criaram.
- A sessão também impede logout antigo de A, aguardando o lock atrás de login B, de revogar B. Após notificação dos metadados, uma aba sem sessão atual solicita novamente a sessão em memória ao proprietário: isso recupera anúncio perdido ou recebido antes da visibilidade dos metadados, sem persistir tokens ou disparar refresh por conta própria. [Regressão](../revive-painel/src/services/session-manager.test.js).

Playwright 1.62.1 está fixado como dependência de desenvolvimento. Execute npm ci e npx playwright install chromium firefox webkit na raiz (inclua --with-deps em Linux que precise das bibliotecas). PLAYWRIGHT_MODULE é somente uma alternativa para runtime externo. Na raiz:

```powershell
npm run build --prefix revive-painel
# Terminal da API sintética:
node tests/browser/session-fixture.cjs
# Terminal Vite:
$env:REVIVE_API_PROXY_TARGET='http://127.0.0.1:3177'
npm run dev --prefix revive-painel -- --host 127.0.0.1 --port 4177 --strictPort
# Terminal dos testes, um por vez:
node tests/browser/offline-storage.cjs
node tests/browser/offline-sync.cjs
node tests/browser/offline-shell.cjs
```

REVIVE_BROWSER_EVIDENCE salva apenas resumos. A prova do shell inicia/encerra sua própria fixture em porta livre; não derruba o servidor em 3177. Os comandos usam browsers gerenciados pelo Playwright. Para reproduzir também no Edge instalado, defina PLAYWRIGHT_CHANNEL=msedge. A suíte está disponível em npm run test:browser, com os servidores indicados em execução, e no job dedicado do CI. Estes testes são automatizados, não homologação de navegadores/aparelhos reais do [gate #7](https://github.com/vitoradriao/revive/issues/7).

Registro histórico da preparação (839f240): validação local npm run validate passou com 80 testes API, 89 painel e build; lint do painel e links passaram. npm run test:browser passou com o Playwright fixado do projeto nas três engines gerenciadas; a proteção adicional de limpeza/upgrade bloqueado foi retestada nas três. CI do PR registra a validação Linux e suas limitações.

## Integração de produto e recuperação

[client.js](../revive-painel/src/offline/client.js) mantém a conexão por usuário/geração, cacheia o bootstrap sob o lock da conta e invalida respostas atrasadas. O ponteiro local contém apenas UUID e geração; a identidade e os dados ficam no IndexedDB. Uma falha de rede ao restaurar permite consultar essa última cópia. Uma resposta 401 confirmada bloqueia o acesso local e exige novo login; não apaga a fila. Não há autenticação remota por esse ponteiro.

[OfflineContext](../revive-painel/src/contexts/OfflineContext.jsx), AuthContext e DataContext integram essa cópia às telas. Uma mutação primeiro confirma o commit local; o aviso diz “salvo neste navegador”, sem alegar confirmação remota. O detalhe mostra registros pendentes. Falha de armazenamento conserva o formulário e não cria uma intenção aparente. Cliques simultâneos com o mesmo conteúdo compartilham a gravação em curso; novos registros deliberados continuam possíveis.

A [tela Sincronização](../revive-painel/src/pages/SyncPage.jsx), em /sincronizacao e na navegação, mostra pendências, estados, tentativas, recibos, data da cópia e cobertura parcial. O conteúdo privado só aparece ao expandir o item. É possível tentar novamente com a mesma chave ou confirmar descarte; o aviso explica que descartar não desfaz um commit remoto incerto. Dependências impedem descarte incompatível. Conflitos e falhas permanentes pausam a ordem, com rascunho preservado; edição comparada do diário pertence à #61.

A saída verifica a fila sob o mesmo lock de escrita. Com pendências, um dialog nativo oferece sincronizar e sair, descartar e sair, ou cancelar. Foco inicial em Cancelar e contenção de Tab são exercitados por automação. A limpeza ocorre somente após confirmação da revogação, mantendo o handle aberto até o commit local. Falha remota mantém a fila; cancelamento não modifica dados. Troca de conta invalida também o dialog anterior. A exclusão confirmada da conta continua na #64.

Com o aplicativo aberto, online/focus e uma verificação a cada 15 segundos retomam a sincronização respeitando backoff e pausas. Sem Web Locks a gravação falha explicitamente; nenhum fallback permite dois processadores concorrentes. Não há envio garantido com navegador fechado.

Consultas paginadas futuras devem capturar accountKey antes do HTTP e fornecê-lo a client.savePage(kind, filters, data, accountKey). Uma resposta de geração antiga é rejeitada antes da gravação; getPage também revalida a geração após a leitura. Atualizar o bootstrap não declara histórico completo nem dispensa paginação nas issues seguintes.

## Evidências complementares e limites

- [offline-ui.cjs](../tests/browser/offline-ui.cjs): produto compilado e Service Worker real, com servidor próprio desligado; criação pela tela, falha de armazenamento injetada sem limpar o formulário, fechamento/reabertura do perfil, UUID preservado, um evento remoto, 401 bloqueando a cópia local, três escolhas de saída, falha de saída preservando pendência e isolamento A/B. Executado em Chromium, Firefox e WebKit. O teste não depende somente de emular offline no protocolo do browser.
- [offline-client.cjs](../tests/browser/offline-client.cjs): IndexedDB real nas três engines, bootstrap A atrasado depois de B, rejeição de página com geração antiga e limpeza após logout. Sessão/transporte sintéticos nesse teste; os handlers HTTP e sessões reais são verificados nas suítes complementares.
- A fixture HTTP usa RPC sintética. A suíte PostgreSQL real no CI permanece obrigatória e separada. Nenhum dado/credencial de produção é usado nas evidências.
- WebKit Linux pode emitir diagnósticos de falha de acesso à rede pelo evento pageerror quando o servidor é desligado. A UI registra separadamente somente a mensagem exata desse diagnóstico, para os endpoints sintéticos conhecidos e requisições observadas durante a indisponibilidade proposital. WebKit pode entregar o diagnóstico depois da reconexão; a classificação mantém a associação com essas requisições, sem ignorar erros arbitrários. Qualquer outra exceção continua falhando a suíte; a rodada também aguarda a tela e a identidade B antes de afirmar isolamento.
- Leitor de tela humano e navegadores/aparelhos físicos não foram homologados nesta rodada. Dialog nativo, foco, teclado, roles, textos e estados têm verificação automatizada; o aceite físico mais amplo permanece no [gate #7](https://github.com/vitoradriao/revive/issues/7).

Para executar a rodada completa, mantenha a fixture HTTP e o Vite indicados acima, compile o painel e rode npm run test:browser. As provas de shell/UI iniciam e encerram suas próprias fixtures em portas livres. REVIVE_BROWSER_ARTIFACTS grava capturas e um resumo da UI apenas com conteúdo sintético; REVIVE_BROWSER_EVIDENCE continua disponível para os resumos das suítes anteriores. CI executa todas as suítes.

Validação da integração no código b64cf31: npm run validate (80 API / 89 painel / build), integração do painel após os ajustes, lint e documentação aprovados. Uma regressão adicional cobre anúncio de login perdido entre abas; a suíte de painel passa a 90 testes. As esperas de conta nos testes de navegador usam predicados síncronos após carregar o módulo, para não tratar uma Promise como confirmação de troca. As seis suítes de navegador passaram: sessões, storage, replay, shell, cliente por geração e UI. [Captura da reabertura local com dados sintéticos](evidencias-testes/web-offline-ui-20261016.png). A [síntese da UI por engine](evidencias-testes/web-offline-ui-20261016.json) não contém credenciais nem dados de usuários.

## Implantação, compatibilidade e recuperação

Sem nova migration SQL, flag de produção ou mudança de contrato mobile nesta entrega. Requer a sessão web v2 já habilitada na #57. A publicação troca os arquivos públicos e instala o worker versionado sem recarregar forçadamente as abas. IndexedDB é aditivo e por conta; não limpar caches privados para reparar uma versão.

Em bloqueio de upgrade, feche a aba antiga e reabra. Em mudança de versão, use Reabrir página. Em quota/armazenamento indisponível, o formulário não é salvo: preserve seu texto e disponibilize armazenamento antes de repetir. Em erro de rede/recibo incerto, use a intenção existente na Sincronização. Em conflito permanente, revise a origem antes de tentar novamente ou descarte explicitamente. Rollback de arquivos públicos não deve remover bancos ou filas; uma versão anterior incapaz de abrir o esquema precisa informar a incompatibilidade e aguardar versão compatível.

Integração em main dispara Vercel Production e exige autorização específica do usuário, conforme o plano. Encerrar esta issue não autoriza publicação em lojas nem contato com participantes.

Referências: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB), [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) e [plugins Vite](https://vite.dev/guide/api-plugin.html).
