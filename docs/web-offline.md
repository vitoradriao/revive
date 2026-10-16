# Persistência offline web — preparação da #58

**Estado em 16/10/2026: fundação implementada e testada; issue [#58](https://github.com/vitoradriao/revive/issues/58) ainda aberta.** Falta integrar acesso aos dados locais, tela de Sincronização e decisões de logout. Os formulários de diário/vontades/metas/recaídas serão ligados nas issues próprias [#61](https://github.com/vitoradriao/revive/issues/61), [#62](https://github.com/vitoradriao/revive/issues/62) e [#63](https://github.com/vitoradriao/revive/issues/63). Este documento não declara a experiência offline de produto concluída.

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

A atualização adiciona stores sem apagar os anteriores. O evento versionchange fecha a conexão antiga. O futuro cliente de interface precisa pausar o executor e oferecer reabertura; não deve apagar pendências. Se uma aba antiga perdeu a conexão durante HTTP, sua intenção permanece para reconciliação pela nova versão.

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

Recibos confirmados não são removidos por refresh do bootstrap. O cache fica marcado staleAfterMutation até nova consulta canônica; a futura interface deve separar evento confirmado de indicadores ainda não atualizados. Snapshot/bootstrap não comprova histórico completo ou todas as páginas.

O processamento conserva a ordem e pausa no primeiro conflito, impedimento permanente ou dependência não resolvida. Estados: pending, sending, retry e recovery. Falha conhecida conserva status/código, sem conteúdo privado em logs. Falha após commit remoto e antes de recibo local usa o mesmo UUID para obter a resposta anterior. Envio interrompido é recuperado apenas pelo dono do lock.

Web Locks usa revive-sync-UUID e serializa processamento, enqueue e ações locais entre abas. Sem coordenação segura, a operação falha. Fechar uma aba libera o lock. HTTP tem limite de 20 segundos; timeouts não comprovam que o servidor deixou de gravar. Retry de falhas transitórias mantém a chave; conflitos exigem recuperação explícita.

O coordenador exige access token da mesma conta/geração antes e depois do HTTP; trocar para B deixa a intenção de A preservada, sem notificar a interface de B. Retorno com paused/pending ou erro não pode ser apresentado como sincronização completa. run pode rejeitar se sessão/storage falhar; a integração deve tratar também essa rejeição.

Retenção local não tem expiração automática nesta versão. Os recibos do servidor usam a retenção existente. Limpeza manual do navegador, descarte explícito, restauração do banco ou perda de armazenamento limitam a garantia; não prometer “exatamente uma vez” ilimitado. Descartar uma resposta incerta remove a intenção local, sem desfazer um possível evento remoto.

## Shell público e atualização

[sw.js](../revive-painel/public/sw.js) faz precache do HTML público, ícones, manifesto e todos os chunks públicos emitidos. [O build Vite](../revive-painel/vite.config.js) gera asset-manifest.json e deriva a versão do worker do conteúdo real do shell/manifestos. Alterar o conteúdo do shell produz nova versão e instalação, sem depender de lembrar um número manual.

Somente arquivos públicos conhecidos entram no cache; /api e métodos diferentes de GET seguem a rede. Navegação indisponível/5xx volta ao index público. Respostas privadas nunca são colocadas em CacheStorage pelo worker. Conserva um shell anterior para assets de abas abertas e não força recarga da página; IndexedDB não é modificado pela ativação.

main registra updateViaCache=none; [Vercel](../vercel.json) evita cache HTTP permanente do script/manifesto. Desenvolvimento Vite continua sem service worker. A ativação/instalação pode falhar por falta de armazenamento: a futura interface não deve anunciar reabertura offline sem verificar disponibilidade.

## Evidências reais desta preparação

- [offline-storage.cjs](../tests/browser/offline-storage.cjs): IndexedDB real nas três engines, fechamento/reabertura de perfil, upgrade abortado preservando esquema 1, recibo abortado sem alterações parciais, dependência create/update, páginas/cursor e isolamento. Quota realmente recusada no Chromium; fábrica negada testada separadamente por injeção. Não extrapolar quota para Firefox/WebKit.
- [offline-sync.cjs](../tests/browser/offline-sync.cjs): HTTP real/handlers compartilhados e IndexedDB nas três engines; seis tipos de mutação, duas abas, commit com resposta perdida, reinício, replay único, conflito durável, liberação de lock e A/B com retomada. A [fixture](../tests/browser/session-fixture.cjs) usa RPC sintética, explicitamente; não substitui PostgreSQL real.
- [offline-shell.cjs](../tests/browser/offline-shell.cjs): build público, troca efetiva de worker com intenção local pendente, reabertura com servidor próprio desligado e ausência de /api nos caches. Chromium gerenciado 151.0.7922.34, Firefox 153 e WebKit 26.5 automatizados; Edge 155.0.4283.45 também foi exercitado nas rodadas anteriores. Não comprova Safari/iOS físico.
- No WebKit Windows, a emulação setOffline causou erro interno antes do fallback. A prova usa servidor realmente desligado sem esse protocolo. Edge/Firefox usam ambas as condições. Os testes encerram apenas helpers/perfis que eles próprios criaram.
- A sessão também impede logout antigo de A, aguardando o lock atrás de login B, de revogar B. [Regressão](../revive-painel/src/services/session-manager.test.js).

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

Validação local desta preparação: npm run validate passou com 80 testes API, 89 painel e build; lint do painel e 258 links passaram. npm run test:browser passou com o Playwright fixado do projeto nas três engines gerenciadas; a proteção adicional de limpeza/upgrade bloqueado foi retestada nas três. CI do PR registra a validação Linux e suas limitações.

## Pendências obrigatórias para fechar #58

1. Integrar cliente/contexto por conta: abrir/cachear bootstrap após autenticação, guardar somente ponteiro de usuário/geração para reabertura local e separar claramente acesso offline de sessão autorizada no servidor. Troca de geração fecha handles antigos e invalida resultados atrasados. Novas escritas de cache também precisam do lock de conta e guarda de geração; uma resposta atrasada não pode recriar páginas depois da limpeza de logout/exclusão.
2. Exibir tela Sincronização com pendências, falhas, datas/cobertura, consulta da intenção e ações explícitas de recuperação/descarte. Não mostrar controles de fluxos ainda não integrados como se funcionassem.
3. Implementar sincronizar/cancelar/descartar no logout. Manter o mesmo lock de conta durante a verificação final, logout remoto e limpeza. enqueue já compartilha esse lock. Preservar o handle necessário até terminar a limpeza; a troca de sessão não pode fechá-lo antes. Falha remota mantém sessão/fila e não anuncia saída.
4. Integrar retomada com aplicação aberta/retorno de rede, respeitando pausa/backoff e storage indisponível. Não prometer sincronização com navegador fechado.
5. Provar UI com offline real/reabertura, atualização pendente, conflito e A/B, além de teclado/leitor de tela e três escolhas de logout. Revisar casos de cache/limpeza após exclusão em #64.
6. Validar API/painel/build/lint/docs e CI PostgreSQL/mobile no head final. A preparação usa Refs; somente o aceite completo pode usar Closes.

Referências: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB), [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) e [plugins Vite](https://vite.dev/guide/api-plugin.html).
