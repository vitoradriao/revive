# REVIVE Mobile

Aplicativo Expo/React Native integrado à API do REVIVE, com acompanhamento de hábitos, metas, registros, indicadores e sincronização local.

[Projeto principal](../README.md) · [Arquitetura](docs/adr-0001-mobile-architecture.md) · [Contratos da API](docs/api-contracts.md) · [Pendências](docs/implementation-status.md)

## Desenvolvimento

Use Node.js 22 e npm. Nesta pasta:

```bash
npm ci
```

Copie `.env.example` para `.env.local` e preencha `EXPO_PUBLIC_API_URL` com a URL da API, incluindo `/api`. O ambiente de desenvolvimento publicado usa `https://revive-beryl.vercel.app/api`.

Em um aparelho físico, `localhost` aponta para o próprio aparelho. Para uma API local, use o IP da máquina na rede. As variáveis `EXPO_PUBLIC_*` entram no aplicativo: nunca adicione chaves privilegiadas do Supabase.

## Android local no Windows

Os comandos abaixo usam PowerShell, Android SDK e um JDK compatível. Consulte a [preparação do ambiente Android](docs/android-local.md), incluindo os requisitos de assinatura, antes de gerar o aplicativo.

| Comando | Resultado |
| --- | --- |
| `npm run android:setup` | Prepara o projeto Android local |
| `npm run android` | Instala o Revive Dev e inicia o Metro |
| `npm run android:studio` | Abre o projeto preparado no Android Studio |
| `npm run android:apk` | Gera `output/revive-local.apk` |

Os atalhos **Testar no Android.cmd**, **Abrir Android Studio.cmd** e **Gerar APK.cmd** executam os fluxos correspondentes. Após instalar uma versão de desenvolvimento, `npm start` inicia o servidor para atualizações de JavaScript.

## APK de teste interno

[Baixar o APK Android do EAS](https://expo.dev/artifacts/eas/mZSPfKgPRqC0dgrm5hFNJUZwZwVJEFyWKg6H-dHcHDQ.apk) · [Detalhes do build](https://expo.dev/accounts/reviveapp/projects/revive-mobile/builds/2a7c9894-bfa6-4f2a-8a0b-a631a33c403c)

Esse build foi concluído em **07/09/2026** e pode não conter alterações posteriores da `main`. Usa a API de desenvolvimento e funciona sem Metro. A instalação e os testes de modo avião em aparelho físico são acompanhados na [Issue #7](https://github.com/VitorYunguiar/revive/issues/7).

O projeto EAS é `@reviveapp/revive-mobile`. Para gerar um novo APK pelo perfil `preview`, execute nesta pasta, em PowerShell, com acesso autorizado ao projeto:

```powershell
$env:EAS_NO_VCS = '1'
$env:EAS_PROJECT_ROOT = (Get-Location).Path
npx eas-cli build --platform android --profile preview
```

A assinatura desse fluxo é gerenciada pelo EAS. Consulte o [checklist de release](docs/release-checklist.md) antes de distribuir novas versões.

## Validação

```bash
npm run validate
```

O comando verifica tipos TypeScript, lint e testes Jest. Também é possível executar `npm run typecheck`, `npm run lint` e `npm test` separadamente. O mesmo fluxo é executado no job mobile do [GitHub Actions](https://github.com/VitorYunguiar/revive/actions/workflows/tests.yml).

## Dados locais e limitações

- Access token em memória e refresh token no SecureStore.
- Cache SQLite e fila offline separados por usuário.
- Migração e recuperação do banco local: [guia SQLite](docs/sqlite-migrations.md).
- A atomicidade das mutações e respostas idempotentes ainda precisa ser concluída ([Issue #8](https://github.com/VitorYunguiar/revive/issues/8)).
- Testes automatizados não substituem a validação em aparelho ou banco real.

Veja o [estado da implementação](docs/implementation-status.md) e siga o [fluxo de contribuição](../CONTRIBUTING.md).
