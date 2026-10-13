# Vontades — validação física Android em 13/10/2026

Evidência complementar da [#25](https://github.com/vitoradriao/revive/issues/25), integrada no commit `4ef55a7564c096712ba81745529183b6da0d01ff`, e do gate [#7](https://github.com/vitoradriao/revive/issues/7). A #27 não foi trabalhada. Esta execução não encerra o gate de liberação.

## Matriz do ambiente

Moto G52, Android 13; Expo 57.0.25 / React Native 0.86.3, Hermes/Fabric. Instalação limpa de um APK debug separado, versão 0.1.1-dev / code 2, com bundle incorporado e suporte de desenvolvimento desligado. O modo avião e a reabertura não dependiam de Metro. As instalações anteriores do Revive e seus dados foram preservados.

API Node local com o código da main, PostgreSQL 17.6 e PostgREST reais em projeto Docker descartável, todas as migrations versionadas aplicadas a banco novo. Duas contas e hábitos fictícios, sem acesso a dados ou SQL de produção. O transporte do aparelho usou ADB reverse. Quedas do cabo também interromperam esse transporte, e foram tratadas como indisponibilidade de conexão.

As provas incluem interação com as telas, árvores nativas de acessibilidade, inspeção visual, cópia consistente do SQLite exclusivo do app de teste após force-stop e consultas ao PostgreSQL. Os textos livres, credenciais, tokens, identificador do aparelho e dumps brutos não são publicados.

## Resultado observado

| Cenário | Esperado | Observado / evidência | Estado |
| --- | --- | --- | --- |
| Intensidade 0, opcionais vazios, online | Aceitar sem reiniciar contador | Recibo sincronizado; um evento, gatilhos vazios e três campos SQL nulos; início do hábito e sequência de 285 dias preservados | Aprovado |
| Intensidade 10, dois gatilhos, campos máximos | Manter valores finais | Nota, ação e resultado com 1000 caracteres no formulário, SQLite e PostgreSQL; os dois códigos de gatilho preservados | Aprovado |
| Mudar fuso durante rascunho | Manter fuso e instante do episódio | Aparelho passou de America/Sao_Paulo a UTC; formulário continuou no fuso brasileiro; 12/10 às 23:50 foi salvo como 13/10 às 02:50 UTC | Aprovado |
| Modo avião → salvar → force-stop → reabrir | Intenção durável, consulta local | SQLite v3 com uma `urge.create` pendente e recibo do evento anterior; servidor ainda com somente um evento. Reabertura offline manteve sessão e mostrou os dois eventos com cobertura local parcial | Aprovado |
| Reconectar e encerrar durante reconciliação | Retomar a mesma intenção sem duplicar | Servidor aceitou o evento; force-stop capturou a fila ainda `syncing` e o recibo canônico já gravado. Reabertura repetiu a chave original; PostgreSQL continuou com dois eventos, e a fila terminou vazia | Aprovado |
| Falha de conexão após intenção gravada | Preservar e recuperar envio | Um terceiro envio mostrou recibo de falha e `Sem conexão com o servidor.` na fila. Restabelecer transporte e reabrir sincronizou exatamente um evento; fila vazia | Aprovado |
| Arquivar em outro cliente com rascunho aberto | Bloquear criação, manter campos e histórico | Volta ao formulário deixou campos/Salvar desabilitados, sem apagar intensidade 5 e nota fictícia. Histórico indicou arquivado. Reativar e voltar tornou os mesmos campos editáveis | Aprovado |
| Consulta Brasil / UTC perto da meia-noite | Usar dia no fuso da consulta | Dia 12 no Brasil retornou o episódio de intensidade 10 às 23:50; dia 12 em UTC ficou vazio; consulta UTC apresentou o mesmo episódio no dia 13 às 02:50 | Aprovado |
| Calendário e tipos textuais | Não confundir vontade, check-in e recaída | Dia 12 mostrou Check-in e Vontade registrada; dia 13 mostrou Recaída registrada e vontades. Filtro Vontades ocultou os outros tipos | Aprovado |
| Hoje em fuso com dia diferente do aparelho | Selecionar dia do fuso escolhido | Pacific/Kiritimati selecionou 14/10 enquanto o aparelho brasileiro estava em 13/10 | Aprovado |
| Troca A → B após sincronização | Isolar hábitos, páginas, recibos e gravações | B mostrou somente seu hábito e histórico vazio, depois criou um evento próprio de intensidade 4. PostgreSQL manteve três eventos de A e um de B; SQLite de B terminou com fila vazia e um recibo próprio | Aprovado |
| Retorno B → A e inspeção final de cache | Limpar B e carregar somente A | Logout B e novo login A realizados; a inspeção da tela/cache após retorno foi interrompida pela perda da conexão USB | Pendente de reconexão |
| Tela pequena / fonte ampliada estável | Permitir leitura, seleção, preenchimento e envio | 720x1280 / densidade 320 = 360x640 dp, fonte 150%, após cold start: seleção 0–10 quebrou em linhas, gatilho ficou checked, alternativa numérica selecionou 10; valor 11 mostrou erro legível e preservou campos; controles inferiores acessíveis por rolagem | Aprovado |
| TalkBack ativo: rótulos e seleção | Expor controle e estado nativos | Serviço ativo com touch exploration; intensidade exposta como RadioButton, gatilho como CheckBox, entrada numérica como EditText. Toque duplo com TalkBack selecionou intensidade 0, com checked=true | Aprovado para semântica/interação |
| Anúncios falados de erro/recibo e leitura completa com TalkBack | Compreensão auditiva e ordem de leitura | Não houve avaliação humana do áudio; árvore de acessibilidade não substitui esse aceite | Não executado |
| Fonte/densidade alteradas com processo em execução | Preservar tela, rascunho e layout sem crash | Fonte 1.0 → 1.3 recriou Sincronização na Jornada. Mudança combinada de resolução/densidade/fonte mostrou medidas antigas e houve um SIGSEGV nativo observado uma vez na reabertura. [Falha #50](https://github.com/vitoradriao/revive/issues/50); causa e frequência ainda precisam ser isoladas | Falhou |
| Troca de conta com resposta em trânsito, paginação >50 e concorrência | Ignorar resposta antiga / deduplicar | Cobertos pelas suítes automatizadas anteriores; não executados como corrida física nesta sessão | Não executado em aparelho |
| Atualização de APK legado com fila pendente / cliente antigo com API nova | Preservar dados e compatibilidade de rollout | Instalação sobre os APKs pessoais/legados não foi feita; reinstalações do app isolado não representam esse aceite | Não executado |
| iOS e distribuição em loja | Matriz própria de plataforma | Sem aparelho/build iOS nem publicação em loja nesta execução | Não executado |

Ao final, os hábitos fictícios mantinham o mesmo `data_inicio` anterior aos testes, três eventos da conta A e um da conta B. Não houve reinício de contador por vontade. As filas inspecionadas terminaram vazias.

## Falha e liberação

A [#50](https://github.com/vitoradriao/revive/issues/50) acompanha a alteração de configuração durante execução. O crash teve `SIGSEGV/SEGV_MAPERR` em `MountingCoordinator::pullTransaction`, seguido de `FabricUIManagerBinding::schedulerDidFinishTransaction`; a relação causal precisa de reprodução isolada e teste em release. Tentativas temporárias de manifest/relayout não comprovaram correção e não foram integradas.

O fluxo de vontades foi exercitado no aparelho, mas não declarar o conjunto pronto para loja: permanecem a falha acima, áudio do TalkBack, atualização legada, corridas físicas e os demais cenários/dependências da #7. Consulte o [contrato e roteiro de vontades](urge-events-validation.md) e o [checklist de release](release-checklist.md).

## Encerramento do ambiente

Resolução/densidade, fonte, modo avião, fuso automático/manual e serviços de acessibilidade foram restaurados durante a sessão. A perda final da conexão USB interrompeu a conferência completa e a remoção do APK separado/arquivo de UI/reverse. Completar esses passos ao reconectar, sem alterar as instalações ou dados preexistentes. Encerrar somente o projeto Docker descartável e seus volumes.
