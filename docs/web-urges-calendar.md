# Vontades e calendário no painel — #62

Base revalidada em 23/10/2026: `9be959d`, com #57, #58, #60 e #61 integradas. Foram conferidos [POST/GET v2](../mobile-api.js), [entidade e RPC existentes](../supabase/migrations/20260928170000_urge_events.sql), [formulário mobile](../revive-mobile/src/features/urges/urge-form.tsx), [consulta mobile](../revive-mobile/src/features/urges/use-urge-events.ts), [horários](../revive-mobile/src/domain/urge-time.ts), [gatilhos](../revive-mobile/src/domain/urge-triggers.ts) e a entrega `c66e450` de hábitos. A implementação reutiliza esses contratos. API, schema SQL e mobile permanecem compatíveis, sem migration nova.

## Uso e horário

Nos detalhes de um hábito, **Registrar vontade** aceita intensidade inteira de 0 a 10, gatilhos opcionais e nota, ação realizada e resultado opcionais. Cada campo livre aceita até 1000 caracteres; até dez códigos únicos de gatilhos são permitidos. Rótulos conhecidos ficam separados dos códigos; códigos futuros são preservados e exibidos como “Outro (…)”, inclusive em rascunhos recuperados.

O instante inicial, com segundos e fuso IANA do navegador, é definido ao abrir o formulário e preservado durante o preenchimento e a reabertura do rascunho. Ao alterar data ou horário, a conversão verifica os offsets IANA: horários inexistentes ou repetidos nas transições de verão são recusados. Não há escolha silenciosa de offset. O formulário permite relatar o presente ou passado, sem agendamento; a validação de serviço preserva a tolerância contratual de cinco minutos para diferença de relógio do servidor. O horário de apresentação da consulta é o fuso do navegador; cada evento exibe também seu horário e fuso originais.

**Histórico de vontades** consulta período inclusivo, hábito, fuso e páginas separadamente do bootstrap. **Carregar mais vontades** conserva o cursor opaco e combina IDs, ordenando instante/ID em ordem decrescente. Recibos confirmados e intenções locais entram na projeção da consulta, filtrados pelo mesmo período/hábito. O bootstrap não é usado como fonte de vontades.

No calendário, selecione o hábito (inclusive arquivado) e o mês. O quadro usa as mesmas páginas da consulta; o dia contém texto e contagens acessíveis de registros, vontades, recaídas e metas concluídas. Selecionar o dia mostra os episódios com intensidade, fuso, gatilhos e campos opcionais. Cor não é o único indicador. Ausência de resultados é apresentada como ausência **nos dados disponíveis**. Cache offline, erro de rede ou páginas restantes têm aviso de cobertura parcial; não se presume histórico completo por existir um cache.

Vontade é um episódio descritivo. Não cria recaída ou diário, não reinicia sequência e não inicia outras atividades. Arquivar bloqueia novas criações e mantém o histórico e o rascunho preenchido, inclusive após recarregar a página. Reativar permite continuar o preenchimento.

## Intenções, recibos e recuperação

[O serviço](../revive-painel/src/services/vontades.service.js) encaminha operações pelo [cliente](../revive-painel/src/offline/client.js) ao [coordenador](../revive-painel/src/offline/sync-coordinator.js). As [operações de vontades](../revive-painel/src/offline/urge-operations.js) usam o mesmo Web Lock por conta da fila existente.

1. O rascunho guarda o UUID do evento antes de criar a intenção. A intenção `urge.create` é confirmada em IndexedDB antes de qualquer POST. Duplo envio e reabertura conservam o identificador.
2. Retry preserva payload, instante, fuso e `Idempotency-Key`. Perda da resposta após commit remoto não autoriza outro evento: a intenção permanece até obter recibo confirmado.
3. Recibo canônico, mapping, reconciliação dos caches e remoção da fila compartilham uma transação nativa. Aborto mantém a intenção anterior e não publica confirmação.
4. Somente recibo `confirmed` permite informar confirmação no servidor. Erros permanentes permanecem na Sincronização, com conteúdo privado consultável e ações explícitas.

Há uma particularidade do contrato existente: POST em hábito arquivado retorna `404 VICIO_NAO_ENCONTRADO`, e a RPC conserva essa recusa idempotente. Reativar não altera o resultado dos retries daquela chave. GET continua consultando o histórico arquivado.

Para uma recusa definitiva 404/422, **Recuperar vontade como rascunho**, na Sincronização, verifica online que o hábito está ativo. Uma transação conserva a intenção anterior em recibo `replaced`, remove apenas a pendência recusada e grava o conteúdo em um novo rascunho. É necessário revisar e salvar explicitamente; a recuperação não envia POST. Resposta incerta, conflito de chave e operações em envio nunca usam essa ação. Outro rascunho ainda não confirmado do mesmo hábito não é sobrescrito. A criação seguinte tem uma nova chave porque é um novo envio deliberado; retries de qualquer intenção mantêm sua chave original.

O IndexedDB permanece no schema 2. Páginas `urges` e recibos confirmados/recuperados declaram `payloadVersion: 1`; recibos anteriores sem esse atributo mantêm leitura como versão 1. Rascunhos usam novas chaves `urgeDraft:<hábito>` no store `meta`. Não há limpeza de histórico, fila ou stores para atualização. Conta e geração são verificadas antes e após etapas assíncronas; respostas tardias não gravam páginas ou recibos na conta seguinte.

## Verificação e evidências

- [Fixtures e limites](../revive-painel/src/utils/urges.test.js): São Paulo, UTC, viradas em fusos extremos, lacunas/ambiguidades de verão, fuso/data inválidos, extremos 0/10, frações/faixa, até dez gatilhos, futuros desconhecidos e opcionais/1000 caracteres.
- [Serviços](../revive-painel/src/services/vontades.test.js): intenção antes de envio, histórico parcial, recibos/páginas por ID, cursor, arquivo, erro de armazenamento, recuperação explícita e respostas tardias A/B.
- [Componentes](../revive-painel/src/components/urges/Urges.test.jsx): instante inicial fixo, rascunho, bloqueio por arquivo, validação, acessibilidade textual, status e Sincronização.
- [Navegador real](../tests/browser/urges.cjs): Chromium/Firefox/WebKit; IndexedDB/Web Locks reais; reabertura offline; timeout real de 20 segundos após commit; mesma chave; recibo e recuperação abortados/reabertos; páginas empatadas; calendário parcial; códigos futuros; archive durante preenchimento; recuperação da recusa definitiva; contador e recaídas inalterados; teclado e isolamento A/B durante GET/POST.
- [API e PostgreSQL reais](../tests/db/real-postgres.mjs): concorrência idempotente, empates de instante, ownership, histórico arquivado, recusa estável após reativação, novos envios explícitos 0/10 e sequência inalterada. A fixture de navegador passa pelas rotas Express reais com RPC sintética; o teste PostgreSQL é a prova adicional do contrato persistido.

A suíte de navegador interrompe o servidor sintético para testar indisponibilidade real da origem e reabertura pelo Service Worker. No WebKit Linux, diagnósticos de controle de acesso são tolerados apenas quando correspondem a leituras GET que efetivamente falharam; demais erros de execução reprovam o teste.

Resultados e comandos executados com Node 22.23.4:

| Comando/área | Resultado |
| --- | --- |
| `npm run validate` | 330 links, 80 testes API, 223 testes web e build aprovados |
| `npm run lint:web` | Aprovado |
| `/workspace/prompts/browser.sh test:browser:vontades` | Três navegadores aprovados |
| `/workspace/prompts/browser.sh test:browser` | Dez suítes, incluindo vontades, aprovadas nos três navegadores |
| `npm run test:db` | Runner Docker indisponível: executável ausente |
| Equivalente local do runner SQL + `node tests/db/pre-recovery.mjs` + `node tests/db/real-postgres.mjs` | PostgreSQL 17.11, PostgREST 12.2.12 e Mailpit 1.31.4: instalação nova, upgrade legado, SQL negativo e API aprovados |
| Mobile | Não aplicável: nenhum arquivo alterado |

A execução local de banco inicializou cluster isolado, aplicou `ci_roles.sql`, migrations em ordem e verificações `assert_base_schema.sql`, `assert_full_schema.sql` e `assert_synthetic_upgrade.sql` nas bases nova/legada. A suíte pré-recuperação rodou antes da migration correspondente; depois foram executadas as negativas de FK/permissão e a suíte completa da API. Serviços locais foram encerrados ao final. Isso não declara execução das imagens Docker fixadas no CI (PostgreSQL 17.6).

[Registro sintético](evidencias-testes/web-urges-20261023.json), [formulário](evidencias-testes/web-urge-form-20261023.png) e [calendário](evidencias-testes/web-urge-calendar-20261023.png). As capturas e os resultados usam somente contas e eventos de teste. A verificação de acessibilidade cobre rótulos, nomes acessíveis, regiões de status e navegação por teclado; não houve sessão manual com leitor de tela falante.

## Critérios de aceite

| Critério | Evidência |
| --- | --- |
| 0/10 aceitos; frações/fora da faixa recusados | Fixtures, componentes e API/PostgreSQL |
| Vontade não cria recaída ou muda sequência | Comparação antes/depois no navegador e na API real |
| Offline e reabertura preservam um evento sem duplicação | IndexedDB, timeout após commit e replay nos três navegadores |
| São Paulo, UTC e verão sem ajuste silencioso | Fixtures de instante, fuso e conversão civil |
| Empates entre páginas sem perdas/duplicações | Navegador com 24 empates e keyset na API/PostgreSQL |
| Códigos futuros e rascunho preservados no arquivo | Histórico, formulário reaberto e recuperação transacional |
| Calendário diferencia tipos além da cor | Texto, nome acessível com contagens e seleção por teclado |

## Implantação e reversão

Publicar o build normal do painel após revisão. Nenhuma mudança de configuração de API ou de banco é exigida. A reversão do bundle mantém stores e intenções existentes, já compreendidas pelo coordenador anterior. Em falha de quota/storage, liberar espaço e reabrir preservando os dados do site; não limpar IndexedDB para “corrigir” upgrade. Em resposta perdida, usar Sincronização com a mesma intenção. Para recusa definitiva, consultar o hábito e usar a recuperação explícita descrita acima. O Vite mantém aviso de bundle principal acima de 500 kB. Não foi realizado deploy.

Ficam fora do escopo atividades de apoio imediato, planos, contatos, notificações/agendamentos nativos, alterações no aplicativo e mudanças de entidade/schema.

