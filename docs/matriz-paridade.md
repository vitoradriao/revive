# Matriz de implementação, ambiente e homologação

Consulta em **16/10/2026**, base `main 5ca7db48fe691d6cf78e1b50df99fd3251c7dbc8`; [#57 integrada e rollout autorizado verificado](web-sessions-rollout.md). O [roadmap #10](https://github.com/vitoradriao/revive/issues/10) concentra prioridade, dependências e critérios; esta matriz registra evidências. Atualizar os três quadros juntos a cada entrega.

## Como interpretar os estados

- **I**: implementação presente no código da referência citada.
- **G**: integrada na main. Um PR aberto pode ter I, mas ainda não G.
- **A**: habilitada no ambiente identificado, incluindo esquema, credenciais, permissões e build necessários. Código integrado não prova A.
- **H**: homologação do cenário/plataforma/versão citados. Teste automatizado, inspeção visual e validação física são evidências diferentes; nenhum deles amplia sua cobertura automaticamente.
- **P**: pendência com issue ou procedimento. **?** significa não verificado nesta consulta; **N/A**, capacidade que não se aplica.

Não houve consulta de dados de usuários, SQL remoto, instalação em aparelho ou promoção de ambiente nesta revisão documental. Os registros datados abaixo comprovam somente seu cenário original.

## Código e integração por funcionalidade

Cada célula informa I/G. Ambiente (A) e homologação (H/P) ficam nos quadros seguintes; não inferir esses estados a partir de I/G. No iOS, I/G compartilhado descreve código React Native integrado, não build ou funcionamento físico confirmado.

| Funcionalidade | API | Web React/Vite | Android | iOS |
| --- | --- | --- | --- | --- |
| Conta e sessões | I/G v2, legado e adaptador web | I/G v2 [#57](https://github.com/vitoradriao/revive/issues/57); [contrato e evidências](web-sessions.md) | I/G v2 | I/G compartilhado |
| Cadastro de hábito | I/G | I/G; [correção #56](web-habit-creation-validation.md) integrada pelo [PR #70](https://github.com/vitoradriao/revive/pull/70) | I/G | I/G compartilhado |
| Edição/archive/reativação | I/G [#21](https://github.com/vitoradriao/revive/issues/21) | P [#60](https://github.com/vitoradriao/revive/issues/60) | I/G [#21](https://github.com/vitoradriao/revive/issues/21) | I/G compartilhado |
| Progresso histórico e awards permanentes | I/G [#16](https://github.com/vitoradriao/revive/issues/16) | I/G indicadores legados; alinhamento P [#59](https://github.com/vitoradriao/revive/issues/59) | I/G [#17](https://github.com/vitoradriao/revive/issues/17) | I/G compartilhado |
| Check-in rápido | I/G | I/G formulário anterior; paridade P [#61](https://github.com/vitoradriao/revive/issues/61) | I/G [#18](https://github.com/vitoradriao/revive/issues/18) | I/G compartilhado |
| Diário completo/correção/conflitos | I/G [#22](https://github.com/vitoradriao/revive/issues/22) | P [#61](https://github.com/vitoradriao/revive/issues/61) | I/G [#22](https://github.com/vitoradriao/revive/issues/22) | I/G compartilhado |
| Vontades descritivas | I/G [#24](https://github.com/vitoradriao/revive/issues/24) | P [#62](https://github.com/vitoradriao/revive/issues/62) | I/G [#25](https://github.com/vitoradriao/revive/issues/25) | I/G compartilhado |
| Metas e recaídas | I/G contratos legados/v2 | I/G legado; fila/v2 P [#63](https://github.com/vitoradriao/revive/issues/63) | I/G durável | I/G compartilhado |
| Fila, recibos e isolamento | I/G atomicidade [#8](https://github.com/vitoradriao/revive/issues/8) e sessão [#14](https://github.com/vitoradriao/revive/issues/14) | I de storage/fila/shell, acesso local, Sincronização e logout no [PR #73](https://github.com/vitoradriao/revive/pull/73); [evidências e limites](web-offline.md), G pendente [#58](https://github.com/vitoradriao/revive/issues/58) | I/G SQLite versionado [#13](https://github.com/vitoradriao/revive/issues/13) | I/G compartilhado |
| Recuperação de senha | I/G [#20](https://github.com/vitoradriao/revive/issues/20) | P [#64](https://github.com/vitoradriao/revive/issues/64) | I/G [#20](https://github.com/vitoradriao/revive/issues/20) | I/G compartilhado |
| Exclusão de conta | I/G | P integração/limpeza [#64](https://github.com/vitoradriao/revive/issues/64) | I/G | I/G compartilhado |
| Lembrete local com horário | N/A ao agendamento local | N/A no escopo aprovado | I/G [#19](https://github.com/vitoradriao/revive/issues/19) | I/G compartilhado, H pendente |
| Biometria e proteção de prévia/captura | N/A ao bloqueio local | N/A no escopo aprovado | I/G [#23](https://github.com/vitoradriao/revive/issues/23) | I/G compartilhado, H pendente |
| Resumo semanal canônico | I local, G pendente; [API e fórmulas #26](web-weekly-summary.md) | I local, G pendente; Evolução em `/analytics`, resumo e origens; [limites](web-weekly-summary.md) | P [#26](https://github.com/vitoradriao/revive/issues/26) | P [#26](https://github.com/vitoradriao/revive/issues/26) |
| Exportação seletiva | P completar leituras [#27](https://github.com/vitoradriao/revive/issues/27) | I/G exportação fixa; seleção P [#27](https://github.com/vitoradriao/revive/issues/27) | I/G exportação fixa; seleção P [#27](https://github.com/vitoradriao/revive/issues/27) | I/G compartilhado; seleção P [#27](https://github.com/vitoradriao/revive/issues/27) |
| Motivo pessoal | P [#65](https://github.com/vitoradriao/revive/issues/65) | P [#65](https://github.com/vitoradriao/revive/issues/65) | P [#65](https://github.com/vitoradriao/revive/issues/65) | P [#65](https://github.com/vitoradriao/revive/issues/65) |
| Preferências sincronizadas | P [#66](https://github.com/vitoradriao/revive/issues/66) | P [#66](https://github.com/vitoradriao/revive/issues/66) | P [#66](https://github.com/vitoradriao/revive/issues/66) | P [#66](https://github.com/vitoradriao/revive/issues/66) |
| Introdução ao primeiro uso | Contratos P [#65](https://github.com/vitoradriao/revive/issues/65)/[#66](https://github.com/vitoradriao/revive/issues/66) | P [#67](https://github.com/vitoradriao/revive/issues/67) | P [#67](https://github.com/vitoradriao/revive/issues/67) | P [#67](https://github.com/vitoradriao/revive/issues/67) |
| Busca textual/perguntas opcionais | P [#68](https://github.com/vitoradriao/revive/issues/68) | P [#68](https://github.com/vitoradriao/revive/issues/68) | P [#68](https://github.com/vitoradriao/revive/issues/68) | P [#68](https://github.com/vitoradriao/revive/issues/68) |
| Nova identidade visual mobile | N/A | N/A à entrega visual mobile | I em [PR #54](https://github.com/vitoradriao/revive/pull/54); G pendente [#53](https://github.com/vitoradriao/revive/issues/53) | Código compartilhado em PR; build/H pendentes |

**Fontes de código:** [handlers v2](../mobile-api.js), [API legada](../index.js), [contratos OpenAPI](openapi.js), [serviços web](../revive-painel/src/services/api.js), [AuthContext web](../revive-painel/src/contexts/AuthContext.jsx), [tipos mobile](../revive-mobile/src/domain/types.ts), [repositórios mobile](../revive-mobile/src/core/api/repositories.ts), [SQLite](../revive-mobile/src/core/storage/database.ts) e [sync engine](../revive-mobile/src/core/sync/sync-engine.ts). Os estados “P” apontam para o contrato de aceite a implementar, sem reabrir fundações encerradas.

## Habilitação por ambiente (A)

| Ambiente/recurso | Evidência disponível | A atual / pendência |
| --- | --- | --- |
| Resumo semanal #26 | [Entrega local web/API](web-weekly-summary.md), sem migration nova | A remoto **?**; sem deploy nesta entrega; mobile pendente |
| API/painel de demonstração | [Registro de publicação de setembro](../revive-mobile/docs/deployment-validation.md); deployment Production de e454726 aprovado na consulta GitHub de 16/10 | Código publicado não comprova esquema/configuração de cada recurso: A funcional **?**, conferir ambiente antes de afirmar suporte |
| Banco novo e upgrade legado | [Baseline e procedimento](../supabase/README.md), [#6](https://github.com/vitoradriao/revive/issues/6) encerrada / [PR #30](https://github.com/vitoradriao/revive/pull/30) | I/G confirmados; replay de setembro foi isolado. Instalação nova possui caminho versionado; cada ambiente exige inventário/rollout |
| Sessões, atomicidade, progresso, edição e diário | Migrations e testes PostgreSQL em CI; [sync](mobile-sync.md), [edição](habit-edit-archive.md), [diário](../revive-mobile/docs/diary-validation.md) | A remoto **?** para cada migration; não executar SQL automaticamente. API pode declarar indisponibilidade quando contrato obrigatório ainda não foi habilitado |
| Sessões web v2 | [Rollout autorizado de 16/10](web-sessions-rollout.md), esquema até 20261016170000, WEB_AUTH_ENABLED=true e Production success | A do transporte básico confirmada por smoke público; autenticação/duas abas têm evidência local, sem alegar aceite autenticado Production |
| Recuperação de senha | [Implementação e aceite Westmail/Android de 09/10](password-recovery.md), [PR #45](https://github.com/vitoradriao/revive/pull/45) | I/G e H do ambiente de teste confirmados. SQL remoto/habilitação Production **não comprovados**; conferir credential_version, configuração SMTP e flag de rollout pelo procedimento |
| Android de teste | APK isolado/debug e backend descartável na [matriz de 13/10](../revive-mobile/docs/urge-events-android-validation.md) | A somente no cenário datado; recursos temporários removidos. Não equivale a aplicativo distribuído/loja |
| Android release | Build/matriz Expo e configuração variam por entrega | A/H atuais pendentes [#7](https://github.com/vitoradriao/revive/issues/7), inclusive regressão [#50](https://github.com/vitoradriao/revive/issues/50) |
| iOS | Código compartilhado e identificador configurado | Build, permissões, A e H pendentes [#7](https://github.com/vitoradriao/revive/issues/7); não usar evidência Android |
| Push remoto | Cadastro de dispositivo existe | Worker/FCM/APNs/receipts não habilitados como produto; lembrete local não comprova push remoto |
| Branches/PRs web | [#56](https://github.com/vitoradriao/revive/issues/56) encerrada no PR #70; futuras integrações seguem issues | Preview não é Production nem prova configuração de dados. Integração na main dispara Production na Vercel; exige decisão de publicação separada |

## Homologação e pendências (H/P)

| Funcionalidade/plataforma | H comprovada e limite | P atual |
| --- | --- | --- |
| API/SQL | [CI PostgreSQL](testes.md) e PRs encerrados validam esquema novo/legado, transações, ownership e HTTP sintéticos | Conferir CI do commit a liberar; não extrapolar para banco remoto |
| Android: check-in | [Aceite #18](../revive-mobile/docs/quick-checkin-validation.md), Moto G52/Android 13, offline/reinício/data civil/TalkBack/A-B | Gate integrado [#7](https://github.com/vitoradriao/revive/issues/7) permanece |
| Android: lembretes | [Aceite #19](../revive-mobile/docs/local-reminders-validation.md), entrega real/fuso/permissões/cold start/biometria/conta | SO pode atrasar; não prometer horário exato; iOS separado |
| Android: biometria/prévia | [Implementação #23](https://github.com/vitoradriao/revive/pull/40), validação física de retorno ao foreground e janela segura | Demais versões/dispositivos/iOS e gate [#7](https://github.com/vitoradriao/revive/issues/7) |
| Android: recuperação | [Aceite #20](password-recovery.md), SMTP externo, senha nova e revogação no Moto G52 | Áudio TalkBack das telas de recovery/iOS e rollout Production pendentes |
| Android: edição/archive | [Automatizados e PostgreSQL #21](habit-edit-archive.md) | Upgrade físico/TalkBack/fluxo integrado pendentes [#7](https://github.com/vitoradriao/revive/issues/7) |
| Android: diário corrigível | [PostgreSQL/SQLite reais e Jest #22](../revive-mobile/docs/diary-validation.md) | Matriz física complementar não executada naquela entrega; [#7](https://github.com/vitoradriao/revive/issues/7) |
| Android: vontades | [Matriz física #25](../revive-mobile/docs/urge-events-android-validation.md): offline/processo morto/fuso/archive/A-B no cenário descrito | Fonte/densidade/resolução falharam [#50](https://github.com/vitoradriao/revive/issues/50); itens não executados continuam no gate |
| Web legado | Build/testes de componentes integram o CI; o código existe na main | Não há homologação geral entre navegadores. [#56](https://github.com/vitoradriao/revive/issues/56) integrada e [validada em Edge com HTTP sintético](web-habit-creation-validation.md); não equivale à homologação geral |
| Web v2/offline e fluxos novos | Sessões #57: Edge 155 com HTTP real sintético, duas abas e PostgreSQL 17.6 separados; [limites e rollout](web-sessions.md). Offline #58 implementado em PR, com testes de Chromium/Firefox/WebKit; integração e demais fluxos ainda P | Storage/navegadores reais, múltiplas abas e teste cruzado web/mobile exigidos [#7](https://github.com/vitoradriao/revive/issues/7) |
| iOS | Nenhuma homologação física encontrada para esta versão | Marcar não executado; build e cenários próprios [#7](https://github.com/vitoradriao/revive/issues/7) |
| Resumo semanal web/API #26 | Cálculo/handlers e componentes possuem testes locais; [contrato e limites](web-weekly-summary.md) | HTTP/browser não homologados neste sandbox (`listen EPERM`); PostgreSQL real depende de Docker; mobile permanece pendente |
| Exportação seletiva | Preparação de exportação no [PR #36](https://github.com/vitoradriao/revive/pull/36) | Implementação/aceite [#27](https://github.com/vitoradriao/revive/issues/27), sem declarar concluído por preparação |
| Público/distribuição | [Checklist](../revive-mobile/docs/release-checklist.md) | Privacidade/suporte/exclusão, acessibilidade e loja [#7](https://github.com/vitoradriao/revive/issues/7). Pesquisa [#69](https://github.com/vitoradriao/revive/issues/69) é independente |

## Manutenção e próxima tarefa

1. Consultar o [roadmap #10](https://github.com/vitoradriao/revive/issues/10) e o estado do PR; não confundir checklist histórico com fila atual.
2. Identificar commit, schema, ambiente, navegador/aparelho e cenário realmente testados.
3. Atualizar I quando o código estiver implementado, G após merge, A após configuração verificada e H após execução do cenário. Manter P com link quando faltar qualquer etapa.
4. Manter a matriz após cada entrega. Um PR preparatório usa Refs e não fecha implementação/homologação incompleta.

A preparação [#55](https://github.com/vitoradriao/revive/issues/55) e a investigação [#50](https://github.com/vitoradriao/revive/issues/50) não dependem da nova sessão web. O cadastro [#56](https://github.com/vitoradriao/revive/issues/56) foi integrado. A base de novos fluxos web é [#57](https://github.com/vitoradriao/revive/issues/57) → [#58](https://github.com/vitoradriao/revive/issues/58); a sequência completa e o gate estão na #10. Nenhum teste nativo, mock, CI ou preview substitui as demais evidências.
