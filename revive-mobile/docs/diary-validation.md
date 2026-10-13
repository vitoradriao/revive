# Consulta e correcao do diario — issue #22

Implementacao em 13/10/2026. Entradas: detalhe do habito (recentes e diario completo), calendario (dia e periodo) e `/records`. Nenhuma alteracao da issue #27 foi incluida.

## Contrato e dados

`GET /api/v2/registros` aceita inicio/fim inclusivos como datas civis, habito opcional, limite 1–100 e cursor data+UUID. A ordenacao usa data desc/ID desc, sem offset; editar um registro nao move a linha entre paginas. Cada consulta e limitada a 3660 dias. O detalhe retorna todos os campos, inclusive texto legado maior que os limites atuais. Os filtros incluem habitos arquivados e o cache SQLite usa conta, filtro e cursor.

`PATCH /api/v2/registros/{id}` exige Idempotency-Key e expected_version. Humor (100), gatilhos/conquistas (500) e observacoes (1000) aceitam texto ou null; so campos alterados sao enviados. Data e habito sao imutaveis inclusive por trigger. Campos ausentes sao preservados. Criacao mobile valida estes limites sem truncar; clientes antigos podem continuar omitindo humor. A migration amplia varchar(50) para varchar(100), sem reduzir texto legado.

A RPC bloqueia o registro para validar sua revisao e grava a resposta idempotente na mesma transacao da correcao. Corrigir habito arquivado e permitido; contador, recaidas e marcos nao sao alterados. Todas as consultas verificam ownership. RPCs ficam restritas a service_role; RLS/restricoes existentes sao preservadas. Sem SQL remoto aplicado.

## Fila, reinicio e conflito

A correcao e persistida antes de envio. Para uma criacao pendente, a edicao tem dependsOn; nunca ultrapassa a criacao. A resposta de criacao reatribui ID/revisao aos edits em transacao SQLite antes de replay. Se o app encerrar ou a consulta canonica falhar, as chaves originais continuam na fila e o recibo remoto permite retomar sem duplicar.

So uma correcao pode ficar pendente para cada registro. Novas correcoes exigem sincronizar ou resolver a anterior. Em 409 o payload local permanece na fila, inclusive depois de reiniciar. A interface consulta a versao remota ao lado do texto local; o usuario compara e aciona reaplicacao manual. A substituicao da correcao falha por uma nova chave e atomica. O formulario mantem a revisao em que o rascunho comecou para impedir sobrescrita silenciosa ao receber props novas.

SQLite v3 adiciona cache de paginas e mapa duravel de ID local/servidor, preservando fila e bootstrap. Versoes futuras/incompativeis continuam bloqueadas com bytes preservados. Logout/exclusao removem paginas da conta. Offline mostra cobertura local explicitamente e usa paginas salvas ou bootstrap, sem sugerir que a consulta esta completa.

## Evidencias automatizadas

- PostgreSQL 17.6 + PostgREST reais: instalacao nova/upgrade legado, autoria, datas empatadas entre paginas, replay, duas edicoes concorrentes (200/409), null, limites, habito arquivado, imutabilidade, grants e texto legado de 2000 caracteres preservado.
- SQLite real em arquivo: criar/editar offline, fechar/reabrir, reatribuir ID temporario, falha de snapshot depois do commit, replay dos mesmos recibos, um unico registro com versao final correta, conflito/reinicio/reaplicacao e isolamento A/B/cache.
- Jest: formulario, validacao de limites, texto legado completo, rascunho preservado em erro e conflito, expected_version original, consulta paginada sem duplicacao, troca de conta durante resposta e fallback offline.
- Tipos/lint mobile, 33 suites / 148 testes, 72 testes API, 15 painel/build, bundle Android e links da documentacao.
- Export web complementar encontrou a configuracao Metro existente sem suporte ao asset WASM do expo-sqlite; o alvo Android compilou. A configuracao web nao foi alterada nesta issue.

Execute `npm run validate` na raiz, `npm run validate --prefix revive-mobile` e `npm run test:db` (Docker). A suite SQLite substitui apenas transporte e adaptador nativo; banco/filas/replay sao reais. A suite PostgreSQL valida separadamente HTTP e persistencia do servidor. Esses testes nao comprovam dispositivo fisico.

## Roteiro Android complementar

Nao havia aparelho conectado nesta sessao. A homologacao integrada segue na [issue #7](https://github.com/vitoradriao/revive/issues/7).

1. Atualizar um app com fila pendente para v3 sem limpar armazenamento; confirmar registros e fila preservados.
2. Criar e corrigir offline; encerrar/reabrir, conectar e confirmar um registro com texto final.
3. Corrigir o mesmo registro em dois aparelhos; confirmar conflito, texto local persistido e comparacao/reaplicacao manual.
4. Consultar dias brasileiros e varias paginas com datas iguais; trocar conta durante carregamento e verificar ausencia de dados da anterior.
5. Conferir fonte ampliada, viewport pequeno, TalkBack, rotulos dos campos/botoes, anuncios de erro/pedencia, scroll de texto longo e telas vazias/loading/erro.

## Rollout e recuperacao

Aplicar a migration versionada antes de publicar o cliente que usa consulta/correcao. A API retorna indisponibilidade quando a RPC nao existe; nao usa fallback sem controle de versao. Nenhuma migration de teste deve ser aplicada em producao. Fazer backup pelo procedimento do ambiente antes do rollout. Manter o SQL aditivo em caso de rollback do cliente/API, pois remover revisoes/tabela local tornaria novos payloads incompatíveis. Nunca apagar filas pendentes como recuperacao. Retomar com binario compativel e as mesmas chaves.
