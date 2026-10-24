# Exportação CSV e JSON: regras de serialização

Primeira fatia da [#27](https://github.com/vitoradriao/revive/issues/27). Cobre apenas os serializadores e a remoção de identificadores; seleção de hábitos/período/campos, prévia, leitura paginada e a exportação completa continuam pendentes na issue.

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

## Pendências da #27 fora desta fatia

Seleção por hábito, período inclusivo e fuso; prévia com contagens; campos de texto livre desmarcados por padrão; coleta de todas as páginas; cobertura/completude; cancelamento e troca de conta; JSON no painel; verificação em aparelho e abertura real dos arquivos em planilhas.
