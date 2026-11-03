# Mudança de fonte, densidade e resolução no Android: investigação da #50

Preparação da [#50](https://github.com/vitoradriao/revive/issues/50). Este documento reúne o que o código atual permite afirmar, as hipóteses que ainda precisam de reprodução e o protocolo para executar a matriz no aparelho. **Nenhuma correção foi aplicada.** A issue exige uma correção mínima sustentada por reprodução, e o aparelho ainda não foi usado nesta etapa.

Base analisada: `main` em `5db5b40`, Expo 57.0.25 e React Native 0.86.3, com Hermes e Fabric.

## O que o código confirma

1. **A activity é recriada quando muda a fonte ou a densidade, mas não quando muda a resolução.** O `MainActivity` gerado pelo prebuild do Expo 57 declara `android:configChanges="keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|smallestScreenSize"`. Esse é o modelo de `@expo/config-plugins` (`withAndroidBaseMods`), e o plugin local [`with-local-android.cjs`](../plugins/with-local-android.cjs) não o altera. `fontScale` e `density` ficam de fora, então o Android destrói e recria a activity nessas mudanças. Já `wm size` altera `screenSize`/`smallestScreenSize`/`screenLayout`, que a própria activity trata: o React Native recebe `onConfigurationChanged` e refaz o layout **sem** recriar.
2. **Na recriação, a navegação volta para a rota inicial.** O estado do Expo Router vive na árvore React. Quando a activity é recriada com o processo vivo, a raiz React é montada de novo e não existe restauração de estado de navegação ([`app/_layout.tsx`](../app/_layout.tsx)). Isso explica a primeira observação do relato: mudar a fonte com Sincronização aberta voltou para a Jornada, e o processo continuou ativo.
3. **Rascunhos em estado React também se perdem na recriação.** O check-in rápido ([`quick-checkin.tsx`](../src/features/checkin/quick-checkin.tsx)), o editor do diário ([`record-editor.tsx`](../src/features/diary/record-editor.tsx)) e o formulário de vontade ([`urge-form.tsx`](../src/features/urges/urge-form.tsx)) guardam o texto digitado em `useState`. A fila durável fica no SQLite e não é afetada: isso bate com "a fila durável não perdeu eventos".
4. **A mudança combinada mistura os dois caminhos.** Na sequência do relato (resolução → densidade → fonte), a resolução é aplicada no lugar e a densidade e a fonte recriam a activity. Há portanto uma relayout em andamento seguida de destruição e nova montagem da superfície Fabric.

## Hipóteses (dependem de reprodução)

| Id | Hipótese | Cenários da matriz que testam |
| --- | --- | --- |
| H1 | A perda de navegação e de rascunho vem só da recriação da activity, sem crash | `fonte-*`, `densidade-*` (esperado: activity recriada em todas as repetições, sem reinício do processo) |
| H2 | O texto com "geometria antiga/cortes" acontece quando a mudança é tratada no lugar (resolução) e as medidas de texto já calculadas não são invalidadas | `resolucao-*` e inspeção visual após cada passo |
| H3 | O SIGSEGV em `MountingCoordinator::pullTransaction` ocorre quando uma transação de montagem da superfície antiga é consumida durante ou logo após a recriação | `combinado-simultaneo`, `sequencia-sem-reabrir`, comparando debug e release |
| H4 | O crash só aparece com o JS do Metro/debug (tempo de montagem diferente) e não no release | as mesmas linhas, executadas em debug e em release |

O crash foi observado uma única vez. Até a matriz mostrar frequência e stack repetidos, ele não pode ser atribuído à fonte nem a nenhuma das hipóteses.

## Opções de correção, a escolher depois da matriz

- **A. Preservar estado na recriação.** Gravar a rota atual e os rascunhos de forma durável e restaurar ao montar de novo. Não depende de detalhes internos do Fabric e também cobre morte do processo em segundo plano. Exige cuidado com a troca de conta: um rascunho nunca pode aparecer em outra conta.
- **B. Tratar `fontScale|density` sem recriar.** Os protótipos anteriores (só manifest + forçar layout da raiz) não refizeram o layout corretamente e não foram integrados. Só vale reavaliar se a matriz isolar o problema e houver um meio comprovado de invalidar as medidas de texto.
- **C. Corrigir só o crash.** Se H3 se confirmar com stack estável, investigar a ordem de desmontagem da superfície. Pode exigir correção upstream ou patch, e a issue proíbe atualizar dependências ou ativar flags sem reprodução e regressão.

As restrições da issue continuam valendo: não desabilitar a escala de fonte, não limpar dados, não atualizar dependências e não ativar flags experimentais sem reprodução.

## Matriz automatizada

O script [`scripts/android-config-matrix/run.mjs`](../scripts/android-config-matrix/run.mjs) executa os cenários por `adb` com repetições. Em cada repetição, ele:

1. restaura a configuração original, fecha o app e limpa os buffers `crash` e `events` do logcat;
2. abre o app direto na rota escolhida (`revive://sync` por padrão), para observar se a navegação se mantém;
3. aplica os passos do cenário (fonte, densidade e/ou resolução), reabrindo entre passos quando o cenário pede;
4. reabre o app no final (o crash do relato aconteceu depois de reabrir);
5. registra se a activity foi recriada (`wm_relaunch_*`), se o processo reiniciou (PID diferente ou ausente) e se houve crash, com assinatura sanitizada.

| Cenário | Grupo | Passos |
| --- | --- | --- |
| `fonte-1.3`, `fonte-1.5` | isolado | fonte 1.0 → valor |
| `densidade-<valor>` | isolado | densidade original → valor |
| `resolucao-<valor>` | isolado | resolução original → valor |
| `combinado-simultaneo` | combinado | resolução, densidade e fonte 1.5 sem pausa |
| `sequencia-sem-reabrir` | sequência | resolução → densidade → fonte 1.5, com pausa entre passos |
| `sequencia-com-reabertura` | sequência | os mesmos passos, reabrindo o app entre eles |

A configuração original do aparelho (`font_scale`, `wm density` e `wm size`, inclusive overrides já existentes) é **sempre** restaurada no fim, em falha ou com Ctrl+C.

### Execução

Na pasta `revive-mobile`, com exatamente um aparelho autorizado (`adb devices`) e uma conta sintética logada:

```bash
# release (APK de npm run android:apk)
node scripts/android-config-matrix/run.mjs --package com.reviveapp.revive --build "release <commit>" \
  --density 320 --size 720x1280 --reps 5

# debug (Revive Dev, com Metro rodando)
node scripts/android-config-matrix/run.mjs --package com.reviveapp.revive.dev --build "debug <commit>" \
  --density 320 --size 720x1280 --reps 5
```

Opções: `--route` (rota do deep link, padrão `sync`), `--settle` (segundos de espera entre passos, padrão 4) e `--out` (pasta de saída, padrão `output/config-matrix`, ignorada pelo Git). A saída inclui um JSON com cada repetição e uma tabela Markdown pronta para colar na #50 e na #7.

**Privacidade:** o script não captura tela, texto, conta nem identificador do aparelho. Do crash, guarda só o sinal ou a classe da exceção e as bibliotecas e símbolos dos primeiros frames. Endereços, caminhos, BuildId, `Abort message` e mensagens de exceção são descartados. Mesmo assim, revise a saída antes de anexar.

As funções de interpretação têm testes sem aparelho: `npm run test:android-matrix`.

## Verificações manuais que o script não cobre

Para cada build (debug e release), anote ao lado da tabela:

- **Navegação:** a tela aberta antes da mudança continua depois dela? O script só informa se a activity foi recriada.
- **Rascunhos:** com texto digitado no check-in, no diário e no formulário de vontade, mude a fonte para 1.3 e confira se o texto continua no lugar.
- **Fila pendente:** com o modo avião ligado, registre um check-in, mude a configuração, feche e reabra o app, sincronize e confirme que não houve perda nem duplicação.
- **Leitura:** fonte em 100/130/150% e tela pequena (360x640 dp) nas telas novas da versão, inclusive a exportação seletiva da #27, com TalkBack ligado.
- **Cold start:** com a configuração já aplicada, abrir o app do zero deve continuar legível. O relato indicou que sim.

iOS: sem cobertura nesta investigação. Não registrar resultado de iOS sem aparelho.

## Próximo passo

1. Rodar a matriz em release e em debug no mesmo aparelho do relato (Android 13) e anexar as tabelas à #50.
2. Com H1 confirmada, implementar a opção A em PR próprio, com testes de troca de conta.
3. Se o crash se repetir, abrir uma investigação dedicada com as assinaturas coletadas (opção C).
