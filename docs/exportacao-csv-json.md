# Exportação CSV e JSON: regras de serialização

Regras da exportação da [#27](https://github.com/vitoradriao/revive/issues/27). A primeira fatia cobriu os serializadores CSV e a remoção de identificadores; a segunda adicionou a exportação seletiva (seleção, coleta paginada, prévia, JSON v2 e relatório imprimível) no painel e no mobile, descrita em [Exportação seletiva](#exportação-seletiva-segunda-fatia).

## CSV (mobile e painel)

Implementações equivalentes: [mobile](../revive-mobile/src/core/export/csv.ts) e [painel](../revive-painel/src/utils/csv.js), com os mesmos casos de teste.

- UTF-8 com BOM e quebra de linha CRLF entre linhas; todas as células entre aspas, com aspas internas duplicadas e quebras de linha preservadas dentro da célula.
- Fórmulas: se a célula, depois de espaços Unicode, controles e caracteres invisíveis iniciais, começar com `=`, `+`, `-` ou `@`, ou começar com tab ou CR, recebe o prefixo `'`. O conteúdo original é preservado após o prefixo.
- Valores nulos viram célula vazia.

## JSON (mobile)

Implementação em [json.ts](../revive-mobile/src/core/export/json.ts).

- Envelope: `schemaVersion` (atualmente `1`), `generated_at` (ISO 8601 UTC) e `escopo: "snapshot_local"`, seguidos das mesmas coleções do bootstrap (`vicios`, `registros`, `recaidas`, `metas`, `conquistas`, `vontades`, `mensagem`).
- Removidas em qualquer profundidade: `usuario`, `usuario_id`, `email`, `access_token`, `refresh_token`, `idempotency_key` e `client_operation_id`.
- `escopo: "snapshot_local"` indica o último carregamento do aparelho; não afirma histórico completo nem consistência transacional.
- Mudança de formato: o JSON anterior era o bootstrap bruto, sem `schemaVersion`, e incluía `usuario` e `usuario_id`.

## Exportação seletiva (segunda fatia)

Implementações equivalentes, sem biblioteca compartilhada: [painel](../revive-painel/src/utils/exportData.js) e [mobile](../revive-mobile/src/core/export/selection.ts). As duas são testadas contra a mesma [fixture sintética](../tests/fixtures/export-selection.json) e precisam produzir byte a byte o [CSV](../tests/fixtures/export-selection.expected.csv), o [JSON](../tests/fixtures/export-selection.expected.json) e o [HTML](../tests/fixtures/export-selection.expected.html) esperados. Ao mudar regras, altere as duas implementações e regenere as saídas esperadas.

Telas: painel em **Relatórios → Exportar dados selecionados** ([ExportPanel](../revive-painel/src/components/reports/ExportPanel.jsx)); mobile em **Insights → Exportar dados selecionados** ([tela](../revive-mobile/src/features/export/selective-export.tsx)).

### Seleção

- Hábitos ativos e arquivados (padrão: ativos), intervalo de datas locais inclusivo (padrão: últimos 30 dias), fuso IANA, tipos (`registros`, `vontades`, `recaidas`, `metas`) e campos por tipo.
- Allowlist por tipo. Campos de texto livre (gatilhos/conquistas/observações do diário, nota/ação/resultado da vontade, motivo da recaída, descrição da meta) começam desmarcados.
- Nomes dos hábitos só por opção explícita; sem ela, saem como `Hábito 1`, `Hábito 2`… na ordem da lista de hábitos.
- Metas filtradas pela data de início no fuso escolhido; metas sem data só com a opção explícita, desmarcada por padrão.
- Validação: ao menos um hábito da conta, datas válidas, fim ≥ início, até 3660 dias, fuso válido e ao menos um campo por tipo.

### Coleta

- Check-ins: `GET /api/v2/registros` por hábito; vontades: `GET /api/v2/vontades` por hábito e fuso. Todas as páginas são lidas (limite 100) até `next_cursor` nulo; itens repetidos entre páginas são descartados e contados.
- Recaídas e metas vêm do bootstrap, que já as entrega completas para a conta, e são recortadas localmente.
- A seleção é congelada no início da coleta. Prévia e arquivos usam o mesmo dataset; mudar qualquer opção descarta a prévia e exige nova captura.
- Falha em qualquer página (inclusive offline) marca a fonte como incompleta: a prévia avisa, o nome do arquivo recebe `-parcial`, cada linha do CSV traz `exportacao=parcial`, o JSON traz `cobertura.completa=false` e o HTML mostra o alerta.
- Cancelar, sair ou trocar de conta aborta a coleta e descarta o dataset (`EXPORTACAO_CANCELADA`); nenhum arquivo é gerado.
- Não há snapshot transacional: o arquivo registra início e fim da coleta e `consistencia: "sem_snapshot_transacional"`. Pendências locais ainda não sincronizadas não entram e são contadas.
- Nenhum novo endpoint ou migration: os contratos v2 paginados já existentes bastaram.

### Formatos

- CSV: um arquivo, colunas `tipo`, `habito`, união dos campos selecionados na ordem da allowlist e `exportacao`. Mesmas regras de BOM, CRLF, aspas e fórmulas descritas acima. Listas viram `a; b`, booleanos `sim`/`não`.
- JSON (`schemaVersion: 2`, `escopo: "selecao"`): `selecao` efetiva, `coleta`, `cobertura` (fontes, páginas, itens, duplicados, pendências), `habitos` com referência neutra e indicadores na geração, e `dados` por tipo. Sem ids de registros, hábitos ou conta, e-mail, tokens ou chaves de idempotência.
- HTML: relatório imprimível com todo conteúdo escapado, período, coleta, alerta de parcial e indicadores rotulados como valores **na geração** com cobertura (não resultado do intervalo; economia é estimativa).
- Nome de arquivo neutro: `revive-AAAA-MM-DD-a-AAAA-MM-DD[-parcial].ext`.

### Entrega ao usuário

- Painel: download por ação explícita (object URL revogado logo após o clique e no desmonte) e impressão/PDF por iframe `srcdoc` com sandbox, removido após a impressão.
- Mobile: seletor de compartilhamento do sistema por ação explícita; o arquivo temporário no cache é apagado quando o seletor fecha, inclusive em cancelamento ou falha. Impressão por `expo-print`.
- O botão antigo de CSV do painel e os de CSV/JSON do bootstrap no mobile foram substituídos por este fluxo. O resumo imprimível da jornada no mobile continua disponível.

### Verificação

- `exportData.test.js` (painel) e `selection.test.ts` (mobile): saídas idênticas, sentinelas ausentes, paginação/duplicados, parcial, opt-in, cancelamento e troca de conta, validação e datas por fuso.
- `ExportPanel.test.jsx` e `selective-export.test.tsx`: padrões desmarcados, prévia e arquivo do mesmo dataset, descarte ao mudar a seleção, cancelamento sem arquivo e aviso de parcial.
- `npm run test:browser:export` ([selective-export.cjs](../tests/browser/selective-export.cjs)): no navegador, com a API sintética, confere padrões desmarcados, consulta da segunda página, **download real** de CSV e JSON sem sentinelas, descarte da prévia ao mudar a seleção e arquivo `-parcial` quando uma página falha.
- O CSV esperado foi aberto no LibreOffice (importação UTF-8): acentos e quebras de linha preservados e nenhuma célula de fórmula. O HTML esperado foi renderizado no Chromium sem executar scripts.

### Pendências

- Compartilhamento e impressão em aparelho real (Android/iOS) e download/impressão em navegadores reais pelo usuário.
- Abrir os arquivos no Excel e no Google Sheets (apenas LibreOffice foi testado).
- Teste ponta a ponta com API e PostgreSQL reais (o teste de navegador usa a API sintética) e impressão real pelo navegador.
