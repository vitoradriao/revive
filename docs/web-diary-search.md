# Busca no diário e perguntas opcionais

Entrega da issue #68 para API e painel web, sobre os contratos atuais de diário,
Jornada e preferências. A implementação mobile fica para uma entrega posterior. A dependência de código #61
está integrada pelo merge local `9be959d` (PR #76).

## Uso

No detalhe de um hábito, o campo **Buscar no diário** consulta humor, gatilhos,
conquistas e observações. As datas delimitam o período; **Buscar em todo o
histórico** remove esse limite. A consulta inclui hábitos arquivados. Limpar o
campo restaura a listagem, com a mesma ordem por data e ID decrescentes.

A cada troca de termo, o painel descarta resultados e cursor anteriores. Respostas
antigas não substituem a consulta atual. Há estados de carregamento, vazio, erro,
conflito preservado na fila e cobertura local parcial, com rótulos e avisos
`role="status"`/`role="alert"`. Os campos e controles funcionam por teclado.

Ao expandir a reflexão opcional do check-in, aparecem as perguntas:

- O que marcou seu dia?
- Que situação você quer registrar?
- O que você considera uma conquista hoje?

Exibir ou recolher as perguntas não preenche campos, cria rascunhos ou enfileira
operações. Salvar continua sendo uma ação explícita, com as validações existentes.

## Contrato

`POST /api/v2/registros/search`, autenticado, recebe um objeto JSON:

| Campo | Regra |
| --- | --- |
| `termo` | Opcional, padrão vazio; até 100 pontos de código Unicode, sem NUL ou surrogate isolado |
| `inicio`, `fim` | Ambas omitidas para todo o histórico; ou datas civis inclusivas, intervalo máximo de 3.660 dias |
| `vicio_id` | UUID opcional; apenas registros pertencentes à conta autenticada |
| `limit` | Inteiro entre 1 e 100, padrão 50 |
| `cursor` | `next_cursor` retornado pela mesma consulta |

Resposta: `{ registros: RegistroDiario[], next_cursor: string | null }`.
Termo vazio equivale à consulta normal para os mesmos filtros. O período é
opcional na busca; o GET existente conserva seu contrato, incluindo datas
obrigatórias. GET de detalhe, criação e PATCH também permanecem compatíveis.

A normalização comum é NFD, remoção das marcas U+0300–U+036F, minúsculas Unicode
(locale raiz ICU no banco) e unificação do sigma final. Espaços são preservados.
A pesquisa procura uma substring dentro de cada campo individualmente. Aspas,
barra invertida, porcentagem, sublinhado e HTML são texto literal; não há
curingas, interpretação de HTML, ranking ou concatenação entre campos.

O cursor contém data/ID e um vínculo HMAC com conta, termo normalizado, datas,
hábito e limite, além de assinatura. Não contém o termo. Alteração de consulta,
conta, assinatura ou tamanho de página retorna `422 CURSOR_INCOMPATIVEL`, com
instrução explícita para reiniciar sem cursor. Outros filtros inválidos retornam
`422 DADOS_INVALIDOS`; falha do banco retorna `503 CONSULTA_INDISPONIVEL`.

## Offline, contas e privacidade

A busca local percorre o bootstrap e todas as páginas/detalhes disponíveis no
IndexedDB da conta, aplicando criações e correções pendentes antes da pesquisa.
Usa a mesma normalização e ordem. Sua cobertura é sempre marcada como parcial;
a ausência de resultado local não significa ausência no servidor. Ao falhar a
próxima página remota, reinicia explicitamente sobre toda a cópia local, sem
reutilizar o cursor remoto. Uma restauração da rede refaz a consulta.

O POST não entra na fila de escrita. O cache acumula registros por uma chave
neutra, sem termo, cursor ou hash da consulta. Não há mudança de versão do
IndexedDB, limpeza de histórico, fila ou rascunhos. O Web Lock existente por
conta continua coordenando consultas e gravações; há verificações de conta e
geração após cada etapa assíncrona e antes de salvar respostas.

Termos vão somente no body, nunca em URL, armazenamento de consultas ou
telemetria. O logger HTTP ignora a rota de busca, inclusive URLs recebidas com
query string. Erros de parsing nessa rota retornam mensagem fixa para impedir
que fragmentos do body apareçam em diagnósticos do Express. Erros da RPC também
não são registrados ou devolvidos com detalhes. As respostas usam `no-store`;
o service worker não armazena chamadas da API. A infraestrutura de produção
deve manter desabilitada a captura de bodies/parâmetros em tracing e logs SQL.

Falhas 4xx são exibidas como erro; falhas de rede/5xx podem retornar a cópia local
com erro visível e cobertura parcial. Não há substituição silenciosa da busca
por GET de uma página quando o backend ainda não oferece o endpoint.

## Banco, implantação e recuperação

A migration [diary_search](../supabase/migrations/20261023180000_diary_search.sql)
adiciona uma collation ICU e duas funções, sem alterar registros ou índices
existentes. Requer PostgreSQL UTF-8 com ICU, verificado aqui no PostgreSQL 17.11.
A RPC usa parâmetros, `strpos`, ownership por `vicios.usuario_id`,
`SECURITY INVOKER` e `search_path` vazio. As funções só têm execução concedida a
`service_role`; `anon` e `authenticated` não podem chamá-las. A busca reutiliza os
índices de hábito/conta e data/ID existentes. Não há índice textual nesta entrega;
a fixture anual é uma verificação pequena, sem afirmar desempenho em grande escala.

Aplicar migration, atualizar o schema cache do PostgREST e publicar o backend
antes do painel. O app não precisa de flags ou alteração de variáveis. Em caso
de falha, restaurar a versão anterior do painel/backend, mantendo a migration
aditiva. Nenhuma recuperação exige apagar fila, rascunhos ou histórico. Caso seja
necessário retirar os objetos, fazê-lo depois de remover todos os clientes que
usam a busca, em migration própria; não executar limpeza de dados.

## Verificações e limites desta execução

Node 22.23.4. Dados de teste exclusivamente sintéticos. O
[corpus comum](../tests/fixtures/diary-search.json) é usado nos unitários,
serviços, testes HTTP e PostgreSQL real. Cobre vazio, Unicode composto/decomposto,
caixa/acentos, símbolos literais, HTML, limites 100/101, ausência e campos nulos.

- `npm run test:api:unit`: aprovado, incluindo validação da rota, limites,
  vínculo/assinatura do cursor e erros sem conteúdo privado.
- `npm run test:web`: aprovado, incluindo respostas fora de ordem, cursor
  descartado, cache neutro, offline, arquivo, correções pendentes, A/B e perguntas
  sem gravação.
- `npm run lint:web`, `npm run build:web`, `npm run check:docs`: aprovados.
- `LD_LIBRARY_PATH=/caminho/libs PG_BIN=/caminho/postgresql/17/bin npm run test:db:single`:
  aprovado em instalação nova e upgrade legado. Executa migrations, corpus comum,
  permissões reais, isolamento, arquivo, GET vazio equivalente, páginas com empate
  e uma fixture de 365 dias com resultado antigo (limiar de 2 segundos).
- `npm run validate`: tentado; a etapa HTTP das suítes de integração é bloqueada
  por `listen EPERM` ao abrir portas locais. As etapas independentes acima foram
  executadas separadamente. Não se declara validação completa aprovada.
- `npm run test:db`: bloqueado por ausência de Docker. O modo PostgreSQL sem
  servidor não substitui HTTP/PostgREST nem concorrência com duas conexões.
- `/workspace/prompts/browser.sh test:browser:search`, `npm run test:browser:search`
  e regressões de diário, cliente offline e hábitos: bloqueados pela restrição de
  sockets; a regressão do cliente offline também não consegue iniciar o Chromium
  (`Operation not permitted`, SIGTRAP). Sem capturas ou aprovação dos três motores
  nesta execução.
- Mobile: não aplicável, sem alteração em `revive-mobile/`.

O [teste de navegador](../tests/browser/diary-search.cjs), registrado em
`test:browser`, prepara um ano de histórico e verifica Chromium, Firefox e WebKit
com IndexedDB/Web Locks reais, busca além da primeira página, literais, limites,
resposta tardia, arquivo, offline, teclado, A/B e perguntas sem gravação. Evidências
opcionais usam métricas de resultado e capturas com campos/conteúdo mascarados.
WebKit usa `failedReads` e fallback regex apenas para diagnósticos de GETs locais
conhecidos interrompidos durante navegação.

Antes de considerar o aceite encerrado: executar `validate`, `test:db` e os testes
de navegador em ambiente com sockets/Docker, verificar leitura por leitor de tela. Paridade e homologação mobile ficam para
depois. A [evidência sintética](evidencias-testes/web-diary-search-20261023.json)
separa verificações aprovadas e bloqueios reais.
