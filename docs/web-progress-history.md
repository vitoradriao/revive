# Progresso histórico no painel

Refs #59. Contratos revalidados sobre a main local `45cb75a` (também base da branch atual), com sessões #57 e armazenamento offline #58 integrados. Esta entrega altera os consumidores web; não recalcula nem remove períodos, segmentos de economia, conquistas ou intenções.

## Origem e definições

Dashboard, análises, conquistas, perfil e relatórios usam exclusivamente a cópia consolidada do bootstrap v2 da conta e geração atuais. As projeções locais utilizadas pelos formulários ficam fora dos indicadores, dos marcos e das exportações consolidadas. Pendências, conflitos de revisão e consolidado desatualizado são anunciados separadamente.

| Indicador | Definição e escopo |
| --- | --- |
| Sequência atual de um hábito | `progresso.sequencia_atual_dias` com sua cobertura, sem recalcular pela data de início. |
| Sequência atual em destaque | Maior sequência atual entre os hábitos ativos disponíveis. Se algum ativo tem continuidade desconhecida, o indicador fica indisponível. |
| Recorde histórico | Maior `progresso.recorde_dias` entre os hábitos disponíveis, incluindo arquivados. Qualquer recorde desconhecido impede afirmar o maior recorde do conjunto. |
| Economia estimada da sequência | `progresso.economia_sequencia` do hábito em destaque; no resumo individual, a do próprio hábito. |
| Economia estimada acumulada | Soma de `progresso.economia_acumulada` dos hábitos disponíveis, incluindo arquivados. Se algum valor ou cobertura é desconhecido, o agregado fica indisponível. |
| Presença | Número de datas UTC distintas de `data_registro` entre registros consolidados disponíveis. Registros repetidos, inclusive de hábitos diferentes, contam uma data. Recaídas não removem presença. |
| Hábitos ativos | Quantidade disponível com `ativo !== false`. Arquivados permanecem nos resumos históricos e nas exportações. |
| Conquista permanente | Existência de um marco recebido em `conquistas`, por categoria e alvo, priorizando marco da conta. Mostra data, origem e cobertura; um contador atual alto não concede uma conquista. |
| Humor e recaídas | Contagens descritivas dos registros disponíveis no período indicado. Sem taxa de recaída, classificação de risco ou conclusão clínica. |

A cobertura do valor é independente da cobertura da coleção: `confirmed` aparece como “Dados confirmados”; `inferred`, como “Estimativa com histórico parcial”; `unknown` ou valor nulo, como “Indisponível”. Uma economia continua sendo uma estimativa, inclusive com cobertura confirmada. Zero conhecido é apresentado como zero; ausência de histórico não é convertida em zero.

O bootstrap atual não fornece prova de completude ou paginação de todas as coleções. Por isso, todas as telas declaram **cópia parcial** e restringem seus indicadores aos dados disponíveis. A primeira página, um cursor nulo ou uma lista pequena não comprova histórico completo. Os agregados por hábito são recebidos prontos do servidor; não são reconstruídos a partir dos check-ins carregados. Não são somados os `dias_checkin` individuais para obter presença da conta, pois uma mesma data pode pertencer a vários hábitos.

As funções web em [progressMetrics.js](../revive-painel/src/utils/progressMetrics.js) espelham a seleção e agregação de [metrics.ts do mobile](../revive-mobile/src/domain/metrics.ts). O cálculo temporal e financeiro continua em [progress-metrics.js da API](../progress-metrics.js), incluindo mudanças prospectivas de valor diário. Lacunas não geram períodos nem marcos no cliente.

## Telas e arquivos

- Dashboard: sequência atual, recorde, duas economias, apenas hábitos ativos nas ações e mapa com alternativa textual por data. O preenchimento indica check-in; o contorno indica recaída. Célula sem registro disponível não comprova ausência.
- Análises: contagens de check-ins e recaídas disponíveis nos últimos 30 dias, distribuição de humor e marcos permanentes recebidos. Sem inferência clínica a partir de variação de registros.
- Conquistas: marcos permanentes sobrevivem a reset e arquivamento. Barra ainda não conquistada representa apenas progresso no escopo disponível. Snapshot sem `conquistas` mantém o estado legado indisponível, inclusive na contagem geral.
- Perfil: quantidades no escopo disponível e exportação JSON parcial. As chaves antigas são preservadas; `conquistas`, `coverage`, `scope`, `consolidatedAt` e `pendingCount` são aditivas. Intenções locais não entram no arquivo consolidado.
- Relatórios: filtro de 7/30/90 datas UTC, incluindo hoje, para registros, presença, humor e recaídas. Sequências/economias são do snapshot, explicitamente fora desse recorte. CSV informa cobertura, consolidado, período e pendências excluídas; valores são delimitados e protegidos contra interpretação como fórmulas. Impressão inclui o aviso de cobertura.

Uma troca de conta ou geração invalida imediatamente a origem dos indicadores e arquivos, mesmo que uma resposta anterior ainda esteja disponível. Renovar o acesso sem trocar a geração mantém a cópia da conta. Carregamento, erro, vazio, offline, conflitos e falta de histórico têm estados próprios.

## Fixtures e regressões

A [fixture compartilhada](../tests/fixtures/progress.cjs) constrói o snapshot usando as funções canônicas da API. Os [testes de paridade](../revive-painel/src/utils/progressMetrics.test.js) executam as funções reais do mobile e web sobre o mesmo objeto, sem copiar resultados esperados entre plataformas.

| Cenário sintético | Resultado esperado |
| --- | --- |
| Reset após período de 30 dias | Atual 2; recorde 30; economia da sequência 20; acumulada 320; marco de 30 permanece. |
| Recaída sem reset | Atual e recorde 32; acumulada 320. |
| Alteração prospectiva de 10 para 20 | Economia da sequência 30 e acumulada 330; o novo valor não é aplicado retroativamente. |
| Legado sem progresso v2 | Atual, recorde, economias e catálogo de conquistas indisponíveis; nenhum marco fabricado. |
| Continuidade desconhecida no período anterior | Recorde e economia acumulada indisponíveis, sem substituir o desconhecido por zero. |
| Arquivamento | Hábito fora da quantidade de ativos; recorde, economia e conquistas preservados. |
| Dois check-ins na mesma data e um na seguinte | Duas presenças, inclusive com recaída na primeira data. |
| Bootstrap/primeira página | Cópia parcial declarada, com e sem cursor; não extrapola as contagens. |
| Offline com intenção de reset/check-in | Consolidado preservado; pendências e conflitos separados. |
| A/B e nova geração da mesma conta | Dados anteriores indisponíveis para leitura e exportação. |

Os [testes das páginas](../revive-painel/src/pages/ProgressPages.test.jsx) cobrem as cinco telas, filtros, arquivos, estados e mapa acessível. Os [testes do contexto](../revive-painel/src/contexts/ProgressContext.test.jsx) verificam a separação entre snapshot e projeção local e o isolamento por conta/geração.

## Verificação e capturas

Com Node.js conforme `.nvmrc`, dependências instaladas e ambiente que permita servidores locais:

```sh
npm run validate
npm run lint:web
npx playwright install --with-deps chromium firefox webkit
REVIVE_BROWSER_ARTIFACTS=/tmp/revive-progress-evidence npm run test:browser:progress
```

A [suíte de navegador](../tests/browser/progress-ui.cjs) usa build de produção, autenticação HTTP da fixture existente e snapshots exclusivamente sintéticos gerados pelas métricas canônicas. Verifica cinco telas, arquivo JSON, arquivamento, legado, A/B e intenção offline no IndexedDB real. Produz seis capturas por navegador: cinco páginas e dashboard offline. O service worker é desabilitado nessa suíte para interceptar os snapshots sintéticos; a reabertura com shell offline continua nas suítes já existentes da #58. A RPC e os snapshots são sintéticos: essa execução não é prova de banco real nem de homologação em produção.

`npm run test:browser` inclui essa regressão nas três engines. Para guardar as imagens, defina `REVIVE_BROWSER_ARTIFACTS`. Não há captura ou execução de CI confirmada desta branch neste registro.

Verificações locais de 22/10/2026: `npm run validate` aprovado (API: 23 unitários e 57 de integração; painel: 80 unitários e 55 de integração; documentação e build) e `npm run lint:web` aprovado. A paridade importa somente domínio puro do mobile, com configuração de transformação exclusiva do Vitest, sem instalar ou modificar o aplicativo.

A suíte de navegador desta entrega não foi executada localmente e não há capturas locais; ela roda no job de navegadores do CI. Testes unitários e jsdom não substituem IndexedDB real, navegador ou avaliação com leitor de tela humano.

Banco e mobile: sem alterações de SQL, API de produção ou código mobile; validação própria do mobile e PostgreSQL real não se aplica à área alterada. As respectivas regressões permanecem nos jobs existentes do CI. Leitor de tela humano e homologação física não foram executados.

## Implantação e recuperação

Publicar o bundle web somente após as verificações pendentes em ambiente suportado. Não há nova migration de banco nem versão de IndexedDB: o leitor preserva os snapshots existentes e a ausência legada de `conquistas`; a próxima atualização substitui a cópia consolidada pelo contrato recebido. As intenções, recibos, páginas e mapeamentos permanecem intactos.

A reversão consiste em restaurar o bundle anterior. Não limpar IndexedDB, fila ou histórico para voltar de versão ou atualizar cache. O mecanismo existente de versão por conteúdo do shell atualiza os arquivos públicos sem apagar intenções privadas. Nenhum deploy, commit, publicação ou encerramento de issue foi realizado nesta entrega. O aceite final depende das verificações reais e capturas pendentes descritas acima.
