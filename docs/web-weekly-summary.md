# Resumo semanal no painel e na API — #26

Entrega web primeiro, seguindo o recorte dos PRs #83/#82. O mobile continua pendente: nenhum arquivo em `revive-mobile` foi alterado. A issue #26 não fica encerrada por esta entrega. O rótulo do painel passa a **Evolução**, preservando `/analytics` e seus deep links.

## Contrato e autorização

`GET /api/v2/weekly-summary?vicio_id=<uuid>&semana=2026-10-19&timezone=America%2FSao_Paulo`, implementado em [weekly-summary.js](../weekly-summary.js) e registrado no roteador Express v2 existente. Usa a mesma autenticação de sessão web que diário/preferências: access Bearer emitido pelo transporte web, sessão existente, não revogada e não expirada. Não usa um token legado para contornar sessão. O [OpenAPI](openapi.js) define o DTO `WeeklySummary` versão 1 e os erros.

Os três parâmetros são obrigatórios; campos extras, arrays/repetições, UUID inválido, data civil inexistente, data que não seja segunda-feira, semana futura e fuso inválido retornam 422. Datas a partir de 1900. O fuso deve ser reconhecido pelo Intl/ICU do servidor; UTC e aliases IANA nomeados são aceitos, offsets numéricos são recusados. Não há fuso implícito no servidor.

O hábito é consultado por conta autenticada, inclusive arquivado. Ausente ou de outra conta: 404 idêntico. Cada leitura filtra novamente conta/hábito/período, com join de ownership, e o hábito é revalidado antes da resposta. Cada tabela percorre páginas ordenadas pelo UUID, usando `id > último_id`, até receber página vazia. O tamanho solicitado é 500, mas uma página menor não encerra a consulta: limites menores do PostgREST não truncam o resumo. Não se usa o bootstrap, a página aberta do diário ou a fila. Qualquer falha de página interrompe tudo com 503; nenhuma parte é apresentada como cobertura completa. Respostas usam `Cache-Control: no-store`.

## Datas, fuso e semana parcial

- Intervalo civil: segunda-feira até domingo inclusive. `inicio_instant` e `fim_exclusivo` descrevem os limites UTC dessa semana no fuso solicitado.
- Check-ins usam `data_registro` sem conversão: mudar o fuso não move a data civil que a pessoa registrou.
- Vontades usam `occurred_at`; recaídas usam `data_recaida`, convertidos no fuso da consulta. Timestamps legados sem sufixo em `historico_recaidas` seguem a convenção UTC já adotada nas métricas de progresso; não são reinterpretados no fuso do processo Node.
- Limites são resolvidos pelo calendário IANA, sem somar sete períodos fixos de 24 horas. Semanas com DST podem ter 167 ou 169 horas. A busca considera o primeiro instante de cada data, inclusive mudanças de offset à meia-noite.
- `observado_ate`/`atualizado_em` usam o mesmo instante capturado no início da consulta. Eventos posteriores a ele não entram. Na semana atual, check-ins até a data civil atual entram; datas futuras não entram.
- `parcial=true` enquanto o domingo local não terminou. Denominador de dias inclui segunda até hoje, inclusive o dia atual incompleto; uma semana encerrada tem sete dias. O painel mostra intervalo, fuso e aviso de semana parcial.

## Fórmulas e denominadores

Deduplicação por ID ocorre em cada coleção, depois do escopo conta/hábito e antes das contagens. IDs de tabelas diferentes não representam o mesmo evento. Uma vontade e uma recaída são entidades distintas; não se presume que uma causou a outra.

| Campo | Fórmula / significado |
| --- | --- |
| `dias_checkin.valor` | Quantidade de datas civis distintas com pelo menos um check-in no intervalo observado |
| `dias_checkin.denominador` | Dias civis observados, de 0 a 7; não é quantidade de check-ins |
| `cobertura.registros` | Check-ins distintos por ID; vários check-ins num dia contam vários registros, mas só um dia |
| `episodios.quantidade` | Vontades distintas por ID, registradas no intervalo; não soma recaídas |
| `recaidas.quantidade` | Recaídas distintas por ID no intervalo |
| `intensidade.media` | Soma das intensidades inteiras entre 0 e 10 dividida pela quantidade de intensidades válidas, arredondada a duas casas; `null` quando denominador zero |
| `intensidade.denominador` / `total` | Episódios com intensidade válida / todos os episódios de vontade; zero é válido, campo ausente/string/fora da escala não é |
| `gatilhos[].quantidade` / `denominador` | Episódios contendo o código estruturado / todos os episódios de vontade. Cada código conta no máximo uma vez por episódio. Somar códigos pode exceder o total de episódios |
| `humores[].quantidade` / `denominador` | Check-ins do catálogo / todos os check-ins; não usa dias distintos nem episódios como denominador |
| `gatilhos_estruturados` | Episódios com array de códigos, inclusive array vazio; legado sem array não conta. Vazio significa nenhum código registrado, não ausência de situações |
| `humor_categorizado` | Check-ins com valor que corresponde exatamente a um alias explícito do catálogo abaixo |
| `dias_sem_checkin` | Dias observados menos dias com check-in; lacuna não prova abstinência |

Gatilhos conhecidos: `estresse`, `tedio`, `situacao_social`, `rotina`, `outro`. Códigos futuros estruturados válidos ficam separados como “Gatilho não catalogado (código)”. Códigos são sensíveis à caixa. Campos livres de gatilhos do diário não são interpretados.

Catálogo de humor (apenas trim e correspondência exata, sem IA, análise de texto ou equivalência clínica):

| Categoria | Valores aceitos |
| --- | --- |
| Excelente | `excelente`, `Excelente` (web/legado) |
| Bom | `bom`, `Bom` (web/legado) |
| Neutro | `neutro`, `Neutro` (web/legado) |
| Ruim | `ruim`, `Ruim` (web/legado) |
| Péssimo | `péssimo`, `Péssimo`, `pessimo` (alias legado explícito) |
| Bem | `Bem` (mobile) |
| Confiante | `Confiante` (mobile) |
| Ansioso | `Ansioso` (mobile) |
| Desanimado | `Desanimado` (mobile) |
| Não categorizado | Qualquer outro texto não vazio, inclusive frases e diferenças de caixa não listadas |
| Não informado | Vazio, somente espaços ou null |

## Observações, comparação e origens

`frases` possui código de fórmula, texto determinístico, numerador, denominador e IDs da origem. A fixture compartilhada [weekly-summary.json](../tests/fixtures/weekly-summary.json) tem quatro check-ins em três dias, seis episódios, média 5 com denominador 6, e uma recaída. Estresse aparece em quatro episódios mesmo com código repetido: **“Estresse apareceu em 4 de 6 episódios registrados.”** Há um humor livre e um ausente, preservados como não categorizado/não informado.

Comparação é descritiva e restrita à semana imediatamente anterior: exige duas semanas encerradas de sete dias civis, ambas totalmente carregadas, com ao menos um check-in, vontade ou recaída em cada uma. Não se compara semana parcial a semana inteira. Mesmo com esses critérios, não se infere tendência; apenas se enunciam quantidades de episódios e dias com check-in nas duas semanas. Média só usa seu próprio denominador; o texto comparativo não a interpreta. Quando os critérios falham, `status=dados_insuficientes` e o painel explica a ausência de comparação. O DTO ainda inclui contagens, cobertura e origens da semana anterior para auditoria. Uma semana com zero registros não sustenta afirmação de ausência de eventos.

Cada indicador, categoria e frase tem IDs para drill-through; `origens.filtros` informa conta implícita da sessão, hábito, datas observadas e fuso. No painel os links abrem a lista exata de IDs do indicador e os registros originais. Check-ins usam o editor/leitura autenticados existentes `GET /api/v2/registros/{id}`. Vontades e recaídas usam `GET /api/v2/weekly-summary/sources/{type}/{id}`, que revalida ownership. Só a leitura explícita de uma origem retorna seus campos privados; o resumo contém apenas números, IDs e datas. Detalhes de episódios/recaídas precisam de conexão; offline os IDs e datas permanecem consultáveis e o detalhe informa indisponibilidade. Texto livre é renderizado como texto pelo React.

O gráfico de gatilhos é acompanhado de tabela com os mesmos numeradores/denominadores e links. Os indicadores e humores também têm tabelas, cabeçalhos e captions. Os controles têm rótulos, e os estados usam status/alert. Não há escore, previsão de risco, tendência, causa/efeito, IA, apoio imediato ou plano pessoal.

## Cache, fila e respostas tardias

O cache usa o store `pages` do IndexedDB já existente (sem migração), com chave `weekly-summary` + hábito/segunda-feira/fuso, dentro do banco exclusivo da conta. O DTO não contém token, motivo pessoal ou texto do diário. A API HTTP e o service worker continuam sem cache de respostas privadas.

As consultas e gravações passam pelo Web Lock da conta e verificam a geração/epoch. A interface monta uma consulta nova por conta/hábito/semana/fuso e aborta a anterior; a checagem de contexto recusa a resposta antes de gravar no cache. Trocar contexto remove imediatamente resumo e detalhes visíveis. Uma resposta do hábito A não pode ocupar o contexto B mesmo se o servidor já a tiver produzido.

Confirmação de mutação no IndexedDB marca os resumos como desatualizados **na mesma transação** de recibo/mapeamento/fila. Não apaga o último resumo, permitindo sua leitura offline com data e aviso. Os recibos disparam nova consulta na interface. Uma resposta nova substitui somente sua chave. Não há mesclagem da fila nas contagens: pendências do hábito aparecem separadamente, podendo pertencer a outros períodos. Falha de atualização preserva a última consulta/data e sinaliza erro. Sem cache para a chave atual, offline mostra indisponibilidade. 401/403/404 recusam fallback de dados sem autorização. Falha de persistência local permite ver o DTO confirmado, mas avisa que não atualizou a cópia offline.

Consulta, invalidação e troca de contexto nunca apagam intenções pendentes. A saída/exclusão continua seguindo o fluxo existente de confirmação e limpeza da conta.

## Implantação, limites e verificação

Não há migration de banco ou alteração de esquema necessária: são leituras das tabelas e relacionamentos existentes. Publicar API antes do painel; rollback do painel preserva contratos anteriores, cache e fila. Clientes anteriores seguem funcionando. Bases sem contratos de sessões, diário ou vontades necessários retornam erro, sem fallback para totais parciais. Não executar SQL remoto nesta entrega.

A consulta cobre duas semanas, sem limitar quantidade de páginas/registros. O custo e o DTO crescem com os registros, pois IDs de auditoria fazem parte do contrato. O histórico anual não é transferido para calcular o resumo; filtros são aplicados no banco. As páginas são leituras sucessivas, não um snapshot transacional entre tabelas: edições retroativas concorrentes podem aparecer em momentos diferentes; atualizar novamente reconcilia a consulta. `completo` significa que todas as páginas responderam, não que a pessoa registrou todos os acontecimentos. Não se promete histórico clínico completo. O fuso depende do tzdata/ICU instalado; mudanças de regras IANA exigem a atualização do runtime.

Testes adicionados: cálculo/handler sem listener, integração Express com sessão, unidade/integração web, [browser](../tests/browser/weekly-summary.cjs) e [PostgreSQL/PostgREST](../tests/db/weekly-summary.mjs) integrados aos runners existentes. Cobrem virada de mês/ano, São Paulo/UTC, início/fim de DST (inclusive meia-noite em São Paulo), duplicatas, legado, campos desconhecidos, zero/parcial, múltiplas páginas e arquivados/ownership. O browser exercita IndexedDB real, tabela/teclado/origens, cache por fuso, resposta tardia, fila, confirmação e conta trocada; permite evidências sintéticas em `REVIVE_BROWSER_ARTIFACTS`.

Resultados locais em 27/10/2026: 89 testes unitários da API e 355 testes web aprovados; build, lint web, parsing OpenAPI e checagem de links aprovados. `npm run validate` foi executado e interrompeu na integração HTTP por `listen EPERM` (incluindo testes anteriores). O browser foi tentado e encontrou o mesmo bloqueio de sockets; PostgreSQL real foi tentado com `npm run test:db` e não iniciou por falta de Docker. Esses cenários ficam **não homologados nesta execução**, mesmo com testes implementados. Consulte os comandos e resultados de validação em [testes](testes.md). Nenhuma publicação, aceite mobile ou encerramento da #26 é declarado.
