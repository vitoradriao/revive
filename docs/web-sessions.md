# Sessões web v2

Issue [#57](https://github.com/vitoradriao/revive/issues/57). O painel usa os mesmos handlers de credenciais e as mesmas RPCs de criação/rotação do mobile. O adaptador web altera o transporte do refresh, sem migrar identidades nem substituir bcrypt/JWT.

## Contrato do navegador

| Rota POST | JSON enviado | Resposta |
| --- | --- | --- |
| /api/v2/web-auth/cadastro | nome, email, senha | 201 com access_token, expires_in e usuario |
| /api/v2/web-auth/login | email, senha | 200 com os mesmos campos |
| /api/v2/web-auth/refresh | objeto vazio; refresh vem somente do cookie | 200 com access_token renovado |
| /api/v2/web-auth/logout | objeto vazio; cookie identifica a família | 204 após revogação confirmada |

O JSON web nunca inclui refresh_token. O mobile mantém /api/v2/auth, refresh em JSON/SecureStore e seus contratos existentes. Rotas legadas necessárias aos clientes antigos continuam aceitando tokens compatíveis.

Cookie host-only `revive_refresh`: HttpOnly, SameSite=Lax, Path=/api/v2/web-auth, Max-Age de 30 dias e Secure quando NODE_ENV=production. O servidor limpa com os mesmos atributos. O access token fica em memória e é enviado como Bearer às rotas protegidas.

Todas as operações web exigem Origin igual ao esquema/Host da requisição e JSON objeto; Origin ausente/null/externo e Sec-Fetch-Site cross-site são recusados. Não autorizar origens arbitrárias nem aceitar refresh do body. API_BASE é /api em ambos os ambientes. O proxy Vite preserva Host/Origin e encaminha para REVIVE_API_PROXY_TARGET (padrão http://127.0.0.1:3000).

## Abas, falhas e troca de conta

Web Locks serializa login, logout e refresh por origem; fechar a aba libera o lock pelo navegador. BroadcastChannel compartilha access/usuário apenas em memória. No localStorage existe somente metadata de geração/revisão sem credenciais; o JWT legado revive_token é removido e as sessões antigas exigem novo login.

Antes/depois de respostas, o cliente compara a geração da sessão. Troca de conta/logout invalida retornos anteriores; uma resposta atrasada de A não atualiza B. Tokens renovados são publicados às abas; requests concorrentes aproveitam o token atual. Um 401 de acesso pode renovar/repetir uma vez; falha de rede/503/429 não vira “senha inválida”.

O navegador precisa de HTTPS (ou localhost) e suporte a Web Locks/BroadcastChannel. Sem coordenação segura, o cliente mostra indisponibilidade e não tenta uma rotação concorrente insegura. A API não expõe token em URLs ou logs. HTTP 204 não exige JSON; status, codigo, campos, request_id e Retry-After são preservados quando fornecidos.

Logout só é anunciado após confirmação remota. Sem rede, a conta permanece localmente e a interface informa que não confirmou a saída. A fila/decisões de pendências serão integradas pela [#58](https://github.com/vitoradriao/revive/issues/58); esta entrega não afirma persistência offline do painel.

## Migration e implantação

A [migration aditiva de logout](../supabase/migrations/20261016170000_web_session_logout.sql) cria revoke_mobile_session_family(text), security definer com search_path vazio e EXECUTE apenas para service_role. Ela adquire primeiro o lock da conta, como rotate_mobile_session: logout que concorre com refresh revoga também a sessão recém-criada. Não apagar dados nem recriar app_sessions.

1. Conferir main, backup e histórico do ambiente; aplicar migrations em ordem, incluindo recuperação de senha e a função de logout. Validar instalação nova/upgrade em banco descartável antes de promover. Nenhum SQL remoto é aplicado pelos testes.
2. Publicar backend compatível; habilitar explicitamente WEB_AUTH_ENABLED=true somente após conferir esquema, RPC e HTTPS. Sem flag, os adaptadores retornam 503 WEB_AUTH_DESABILITADO; mobile e autenticação legada continuam disponíveis.
3. Publicar o painel que usa /api mesma origem e conferir os cenários da issue. No monorepositório/Vercel, preparar SQL e flag antes de autorizar a integração que promove o frontend.
4. Não fazer rollback para código que ignore credential_version após redefinição de senhas. Preservar a migration aditiva e as revogações; corrigir adiante. Se o problema for no transporte web, suspender a promoção ou desabilitar a flag enquanto disponibiliza cliente compatível, sem apagar histórico/fila.

A configuração de SMTP/recovery é independente. Habilitar sessões web não habilita recuperação de senha automaticamente.

## Verificações

- [Transporte HTTP/API](../tests/integration/web-session.test.js): atributos de cookie, origem, refresh somente via cookie, erro/revogação e compatibilidade mobile.
- [Coordenador](../revive-painel/src/services/session-manager.test.js): duas abas, refresh único, geração de conta, startup offline, revogação e armazenamento sem tokens.
- [Contexto React](../revive-painel/src/contexts/AuthContext.test.jsx): restauração, retirada do JWT legado, memória, erro de rede e saída não confirmada.
- [PostgreSQL real](../tests/db/web-sessions.mjs): hash do refresh, API/ownership, grants, duas ordens de corrida logout/refresh com duas conexões; [recovery](../tests/db/password-recovery.mjs) confirma revogação de cookie/access após redefinição real.
- [Navegador real](../tests/browser/web-sessions.cjs) com [fixture HTTP local](../tests/browser/session-fixture.cjs): cookie real, duas abas, reload, lock liberado ao fechar a aba, A/B com resposta atrasada, rede e logout. A fixture usa armazenamento sintético; não substitui a suíte PostgreSQL.

Comandos usuais: `npm run validate`, `npm run lint --prefix revive-painel` e `npm run test:db`. No Windows sem sh no PATH, executar `& 'C:\Program Files\Git\bin\bash.exe' supabase/verification/run_ci.sh`; usar COMPOSE_PROJECT_NAME exclusivo para o teste. Os containers/bancos desse projeto são descartados ao final, sem tocar outros projetos Docker.

Para reproduzir o browser, disponibilizar Playwright 1.62.1 fora das dependências de produção e definir PLAYWRIGHT_MODULE com seu caminho de módulo (ou disponibilizar pelo require padrão). Em terminais separados, na raiz:

```powershell
node tests/browser/session-fixture.cjs
# Outro terminal:
$env:REVIVE_API_PROXY_TARGET='http://127.0.0.1:3177'
npm run dev --prefix revive-painel -- --host 127.0.0.1 --port 4177 --strictPort
# Terceiro terminal, com Playwright disponível:
$env:PLAYWRIGHT_CHANNEL='msedge'
node tests/browser/web-sessions.cjs
```

A fixture escuta somente 127.0.0.1 e seus endpoints __test são exclusivos desse processo sintético, sem importação na aplicação de produção. Os testes limpam suas sessões. REVIVE_BROWSER_EVIDENCE é opcional para salvar resumo sem tokens/dados pessoais. Firefox/WebKit e aparelhos têm homologação própria no gate [#7](https://github.com/vitoradriao/revive/issues/7).

Referências: [Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) e [BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API).
