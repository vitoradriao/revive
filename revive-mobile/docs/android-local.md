# Android local no Windows

O Android Studio e o Gradle geram o aplicativo localmente no Windows. Não há fila, crédito ou cooldown do EAS. A primeira execução baixa ferramentas e dependências; as próximas reutilizam o cache. É necessário acesso à internet para dependências ainda não baixadas e para a API do app.

## Atalhos na pasta do aplicativo

- **Gerar APK.cmd**: produz `output/revive-local.apk`, assinado e com o JavaScript incluído. Funciona sem Metro ou computador conectado após instalar.
- **Testar no Android.cmd**: compila/instala **Revive Dev** no emulador ou celular e inicia o servidor de desenvolvimento. Alterações em telas/textos atualizam sem reconstruir o APK. Deixe o terminal aberto.
- **Abrir Android Studio.cmd**: prepara e abre a pasta `android` no Android Studio.

Revive Dev usa `com.reviveapp.revive.dev` e pode coexistir com o aplicativo normal. Seu login e dados locais são separados. Ele usa a mesma API de desenvolvimento; ações autenticadas alteram os dados da conta usada.

## Pelo Android Studio

1. Execute `npm run android:setup` na pasta do aplicativo e abra a pasta `revive-mobile/android` dentro do seu clone.
2. Aguarde a sincronização do Gradle. O SDK está em `%LOCALAPPDATA%\Android\Sdk`.
3. Em **Settings > Build, Execution, Deployment > Build Tools > Gradle**, use **GRADLE_LOCAL_JAVA_HOME**. O preparo grava esse caminho em `android/.gradle/config.properties`. O script seleciona um JDK instalado; use `REVIVE_JAVA_HOME` para informar o caminho de uma instalação compatível quando necessário.
4. Para desenvolver, selecione a variante **debug** e um emulador/celular. Deixe `npm start` rodando na pasta `revive-mobile`; por USB, `adb reverse tcp:8081 tcp:8081` permite acessar o servidor. O atalho de teste automatiza a compilação e o Metro.
5. Para APK independente, use o atalho **Gerar APK.cmd**. No Studio também é possível executar a tarefa Gradle `:app:assembleRelease`; a saída original fica em `android/app/build/outputs/apk/release/app-release.apk`.

No aparelho físico, habilite Opções do desenvolvedor e Depuração USB, conecte o cabo e aceite a autorização de depuração no celular. Não é necessário Expo Go.

## Comandos equivalentes

Execute na pasta `revive-mobile`:

| Comando | Resultado |
| --- | --- |
| `npm run android:setup` | Gera/atualiza o projeto Android, SDK e Java locais |
| `npm run android` | Instala Revive Dev e abre o Metro |
| `npm run android:apk` | Gera APK assinado em `output/revive-local.apk` |
| `npm run android:bundle` | Gera AAB assinado em `output/revive-local.aab` para distribuição pela loja |
| `npm run android:studio` | Prepara e abre o projeto no Studio |

Os scripts usam PowerShell e procuram SDK/JDK instalados. `REVIVE_JAVA_HOME` permite escolher outro JDK. A URL pública da API vem de `.env.local`; nunca adicione a service role key ao app.

## Assinatura e manutenção

- A assinatura existente foi baixada do EAS para `credentials.json` e `credentials/android/keystore.jks`. O APK normal mantém `com.reviveapp.revive` e a mesma chave para atualizar a instalação anterior sem desinstalar.
- Esses arquivos contêm segredos: ficam ignorados pelo Git e excluídos do pacote EAS. Mantenha backup privado. Não são incorporados ao APK. A compilação local não precisa fazer login no Expo depois desse download.
- Em outro computador, restaure seu backup privado ou execute `eas credentials -p android`, escolha o perfil preview e `credentials.json > Download credentials from EAS to credentials.json`. Não gere uma chave diferente para atualizar o app existente.
- O projeto `android/` é gerado e ignorado pelo Git. As configurações persistentes estão em `app.config.ts`, `plugins/with-local-android.cjs` e `scripts/android-local.gradle`. O preparo usa `--no-clean`, preservando o cache da compilação. Evite alterações manuais em arquivos gerados.
- Ao adicionar módulos nativos ou alterar configurações do app, execute o preparo e gere outra versão nativa. Mudanças apenas nas telas podem usar Fast Refresh durante o desenvolvimento.
- Antes de distribuir uma nova versão, atualize `version` e aumente `android.versionCode` em `app.config.ts`. O build local atual tem versão 0.1.1, código 2.

Referências: [build local do Expo](https://docs.expo.dev/guides/local-app-overview/), [assinatura e release local](https://docs.expo.dev/guides/local-app-production/).

## Validação em 09/09/2026

- `npm run android:apk`: BUILD SUCCESSFUL, primeira compilação completa em 20min16s; 606 tarefas. Saída: `output/revive-local.apk`, 114.266.580 bytes.
- `apksigner verify`: assinatura válida, certificado SHA-256 `af071c29e7553497209cfc34717c08b6e25f4a6c02cf5238de61bd062fc45e42`, igual ao certificado anterior do EAS.
- Metadados: `com.reviveapp.revive`, versão 0.1.1 (2), nome Revive, Android mínimo 24, destino 36; quatro arquiteturas incluídas. APK release, sem marca de depuração.
- Bundle JavaScript incluído, apontando para `https://revive-beryl.vercel.app/api`. Nenhum arquivo de keystore ou credentials.json no APK.
- Tipos, lint e 21 testes passaram. Registro da compilação em `output/android-build.log` (ignorado pelo Git).
- Abertura/instalação ainda não testadas: `adb devices` estava vazio e não havia AVD listado. O fluxo de desenvolvimento e a geração de AAB estão configurados, mas não foram executados nesta validação. Para testar no emulador, crie um aparelho pelo Device Manager do Android Studio; alternativamente conecte seu celular por USB.
