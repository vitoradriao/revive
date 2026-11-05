# Recuperação de senha da autenticação própria

Implementação da [issue #20](https://github.com/vitoradriao/revive/issues/20) no [PR #45](https://github.com/vitoradriao/revive/pull/45), com aceite externo e Android em 09/10/2026. O projeto mantém `public.usuarios`, bcrypt e JWT próprio; não usa Supabase Auth para redefinir essas contas.

**Entrega externa validada com Westmail:** a solicitação no Moto G52 chegou a uma caixa Gmail externa, o código foi usado no aplicativo e a nova senha abriu a Jornada. O teste usou API/banco descartáveis. A implantação de produção ainda exige o rollout abaixo; nenhum SQL remoto foi aplicado e a recuperação permanece desabilitada por padrão.

O painel oferece também [recuperação pública, exclusão e saída coordenada](web-account-lifecycle.md). Após confirmação de reset, a API expira o cookie web pelo adaptador HttpOnly; o corpo continua sem sessão e o login deve ser explícito.

## Provedor e configuração

A implementação usa SMTP com [Nodemailer](https://nodemailer.com/smtp), sem dependência de um fornecedor específico. O provedor de homologação é o [Westmail](https://github.com/vitoradriao/westmail): Stalwart com relay Gmail autorizado e SMTP TLS público via Tailscale Funnel. Mailpit 1.31.4 continua sendo somente a caixa SMTP dos testes locais/CI.

Para Westmail, use `SMTP_HOST=westmail.tail9d73df.ts.net`, `SMTP_PORT=8443` e `SMTP_SECURE=true`. Cada aplicativo recebe uma identidade interna com apenas autenticação/envio; `SMTP_USER`/`SMTP_PASSWORD` são credenciais Westmail exclusivas do Revive. `RECOVERY_EMAIL_FROM` deve corresponder ao endereço Gmail autorizado do relay. A senha Google e as credenciais do proprietário não são compartilhadas com o backend. A configuração local foi salva no `.env` ignorado pelo Git, com acesso restrito e `PASSWORD_RECOVERY_ENABLED=false` até o rollout.

Westmail atende sob demanda: PC, Docker, serviço, Tailscale e internet precisam estar disponíveis. SMTP aceito e fila vazia não comprovam recebimento; confira a caixa externa. O envio verificado chegou ao Inbox com assinatura Gmail válida, sem garantia de classificação para outros envios/destinatários. W09–W12 do Westmail continuam como etapas próprias de gestão de credenciais, limites, backup e homologação integrada.

Configure no backend, nunca no bundle mobile:

| Variável | Uso |
| --- | --- |
| `PASSWORD_RECOVERY_ENABLED` | `false` por padrão. Ative com `true` somente após o rollout e a validação do transporte. |
| `SMTP_HOST`, `SMTP_PORT` | Host do provedor e porta. A porta padrão é 587. |
| `SMTP_SECURE` | `true` para TLS desde a conexão, normalmente porta 465; `false` para STARTTLS, normalmente 587. |
| `SMTP_USER`, `SMTP_PASSWORD` | Credenciais do backend. Obrigatórias em produção. |
| `RECOVERY_EMAIL_FROM` | Remetente verificado no provedor. |

O adaptador exige TLS para hosts externos e não aceita localhost como provedor de produção. Conexão, saudação e socket têm timeout de dois segundos; o envio inteiro tem limite de 2,5 segundos. A conexão usa o resolvedor do sistema, compatível com DNS da tailnet, com validação de certificado/hostname e SNI no TLS implícito. O adaptador controla e destrói o socket ao finalizar ou cancelar, inclusive se a resolução DNS ainda estiver pendente. Rejeição ou timeout inutiliza a solicitação emitida. Linhas brutas SMTP, autenticação e MIME são descartadas pelo logger do adaptador. Em caso de falha, o evento `password_recovery_smtp` registra somente etapa normalizada (`connect`, `greeting`, `ehlo`, `starttls`, `auth`, `mail`, `rcpt` ou `data`), categoria, duração, código de transporte conhecido, resposta numérica e região validada. Mensagens de erro do provedor, endereços, identificadores de solicitação, códigos de recuperação e credenciais não são registrados. Esse diagnóstico localiza a falha, mas não comprova entrega externa.

Solicitações válidas recebem sempre o mesmo HTTP 202, mensagem neutra, identificador aleatório e intervalo de 60 segundos, inclusive para conta inexistente, limite atingido ou indisponibilidade. O piso de resposta é três segundos; não é uma garantia de tempo constante quando o banco demora mais. Os eventos operacionais contêm somente o nome do evento: `recovery_disabled`, `email_not_configured`, `email_delivery_failed`, `email_failure_cleanup_failed`, `recovery_request_unavailable` ou `recovery_confirmation_unavailable`. Não incluem endereço, código, senha ou erro do provedor. Alertas devem acompanhar esses eventos, sem enriquecer os logs com conteúdo sensível.

## Contrato e proteção

`POST /api/v2/auth/password-recovery/request` recebe `{ email }`. `POST /api/v2/auth/password-recovery/confirm` recebe `{ email, request_id, codigo, senha }`. Ambos são anônimos; códigos e senhas são enviados somente no corpo JSON, sob HTTPS fora dos testes locais. O [OpenAPI](openapi.js) descreve as respostas.

O código tem oito dígitos gerados por `crypto.randomInt`, expira em dez minutos e aceita até cinco erros. O banco guarda HMAC-SHA256 vinculado ao identificador da solicitação e ao e-mail normalizado. O HMAC usa o segredo JWT do backend; trocá-lo invalida códigos pendentes e tokens assinados anteriormente. O código não é retornado pela API nem persistido no celular. Um novo envio invalida os códigos anteriores.

Os limites ficam no PostgreSQL e valem entre processos/reinícios:

| Operação | Origem | E-mail normalizado |
| --- | --- | --- |
| Solicitar | 20 tentativas por 15 minutos | 6 por hora e intervalo mínimo de 60 segundos |
| Confirmar | 60 por hora | 30 por hora e até 5 erros por código |

Tentativas bloqueadas contam no limite da janela, mas não prolongam o intervalo de reenvio. O intervalo atravessa a mudança de janela. As chaves de origem/e-mail são HMACs, sem contatos em texto nas tabelas de limites. A origem é `req.ip`; o proxy de implantação deve ser confiável e remover cabeçalhos de encaminhamento fornecidos pelo cliente. O limite geral existente da API continua ativo.

A confirmação trava a conta e depois a solicitação. Senha, consumo de todas as solicitações e revogação de todas as sessões mobile são uma única transação. Duas confirmações concorrentes permitem exatamente uma redefinição. O login mobile revalida o hash sob o mesmo lock da conta antes de criar a sessão; refresh também trava conta antes da sessão, evitando publicar credenciais antigas após o reset.

Senhas seguem a política existente de seis caracteres, maiúscula e caractere especial, com teto adicional de 72 bytes para evitar truncamento do bcrypt. O mobile oferece campos rotulados, erros anunciados, navegação pelo teclado, reenvio com intervalo e volta ao login. O sucesso apaga os campos e não autentica automaticamente. Nenhuma operação de recuperação é armazenada na fila offline ou altera o banco SQLite.

## Rollout e recuperação operacional

1. Faça backup e valide o conjunto atual de migrations no ambiente de homologação. A [migration incremental](../supabase/migrations/20261006130000_password_recovery.sql) é transacional e aditiva. Não execute fixtures de teste em uma base compartilhada.
2. Mantenha `PASSWORD_RECOVERY_ENABLED=false` e aplique a migration antes de habilitar a recuperação. Usuários existentes recebem `credential_version=0`, sem troca de ID, hash, histórico ou sessões. A API anterior pode continuar atendendo durante esta etapa. A API nova também suporta o esquema anterior enquanto a recuperação estiver desativada: somente a ausência SQL da coluna (`42703`) permite versão zero; a criação de sessão antiga exige também RPC ausente (`PGRST202`). Erros de rede, permissão ou cache não permitem esse caminho. Assim que a coluna existir, a verificação de versão e o RPC com lock são obrigatórios, mesmo com o recurso desativado.
3. Implante a API nova em **todas** as instâncias e encerre/drene as antigas antes de habilitar a recuperação. APIs antigas não verificam a versão dos JWTs web e não têm o novo lock de criação de sessão.
4. Comprove login legado, login novo e refresh. Configure o SMTP de homologação com remetente autorizado; habilite a recuperação nesse ambiente e valide entrega externa, código inválido/expirado, senha antiga recusada, sessões revogadas e login novo. Registre apenas resultados, sem mensagem/código/credenciais.
5. Só habilite em produção após o aceite externo. A implantação de produção e a aplicação de SQL remoto não foram realizadas nesta entrega.

JWTs web sem `cv` continuam válidos somente enquanto a versão da conta for zero. Tokens novos incluem `cv`. Cada mudança de `senha_hash` incrementa a versão e revoga as sessões mobile, inclusive mudanças feitas por outro caminho no banco. A rota de compatibilidade também verifica a sessão de tokens mobile. A primeira redefinição invalida todos os JWTs web antigos da conta; contas que não redefiniram a senha preservam o acesso existente.

Se houver falha do transporte ou da implantação, desabilite a recuperação em todas as instâncias e mantenha a API com verificação de `cv`. Não retorne a uma API antiga depois que houver redefinições: ela voltaria a aceitar JWTs revogados. Não apague a versão das credenciais nem restaure hashes anteriores como forma de rollback. A correção deve avançar preservando as revogações. Uma falha dentro da confirmação desfaz senha, consumo do código e revogação; o teste real injeta uma falha após o UPDATE para comprovar esse comportamento.

Manutenção pode remover solicitações consumidas/expiradas com mais de sete dias e buckets de limites com `window_at` anterior a sete dias, em lotes pequenos. Preserve solicitações ainda válidas e buckets recentes; não limpe os limites ao reiniciar a API. O teste descarta somente suas bases/contas sintéticas.

## Evidências locais de 06/10/2026

- `npm run validate --prefix revive-mobile`: tipos, lint, 28 suítes / 126 testes e SQLite real aprovados.
- `npm run validate`: 41 testes da API, 15 do painel, links locais e build web aprovados. Auditorias da API/painel sem vulnerabilidades na execução registrada.
- `sh supabase/verification/run_ci.sh`: PostgreSQL 17.6 novo e legado, ownership/RLS/grants, SMTP real local, códigos expirados/usados/incorretos, cinco erros, reenvio, limites persistidos, mudança de janela, rollback, consumo concorrente, corrida com login/refresh, JWT web legado e preservação do histórico aprovados.
- Testes HTTP usam transporte fake para ausência/falha de provedor e mantêm a resposta neutra; o adaptador cobre rejeição e timeout.
- Moto G52 / Android 13 / API 33: APK isolado `com.reviveapp.revive.issue20`, assinatura debug e API descartável PostgreSQL/PostgREST com SMTP Mailpit local. O link abriu o formulário; e-mail inválido mostrou erro, a solicitação real chegou à caixa local, código incorreto preservou campos, código correto redefiniu e apagou os campos sem login automático. A API confirmou senha antiga, JWTs mobile/web e refresh anteriores recusados e senha nova aceita. A volta ao login e entrada com a nova senha abriram a Jornada no celular. A árvore nativa expôs rótulos dos três campos e os dois campos de senha protegidos; a inspeção visual confirmou campos e botões sem cortes na resolução padrão de 1080×2400. Não houve nova confirmação humana de áudio TalkBack para estas telas; iOS não foi testado.
- Limpeza: APK `.issue20` desinstalado, redirecionamento ADB removido, API local encerrada, containers/volumes descartáveis removidos e arquivos temporários com código/token apagados. Os aplicativos principais e configurações do telefone não foram alterados.
- Naquela data, provedor externo, remetente autorizado e recebimento real ainda estavam pendentes; o aceite abaixo resolve essa pendência.

## Aceite Westmail e Android — 09/10/2026

- Westmail iniciado com as imagens W08 existentes; núcleo, web, worker e proxy ficaram saudáveis. Criada identidade exclusiva `app-revive-recovery`, com apenas autenticação/envio. SMTP público validou cadeia/hostname TLS e autenticação.
- O primeiro envio chegou à caixa, mas o prazo de 2,5 segundos venceu durante o caminho de resolução/conexão da biblioteca. O código foi invalidado corretamente. A correção usa o resolvedor do sistema e socket cancelável: o reenvio real foi aceito em **169 ms**, sem ampliar timeouts nem reduzir TLS. Testes com socket real parado e DNS atrasado comprovam fechamento/cancelamento e ausência de conexão posterior ao timeout.
- Moto G52 / Android 13 / API 33, APK isolado `com.reviveapp.revive.issue20` (debug, SHA-256 `076e33f068cbdbd78e79b12aa809671d8d44b927853df1297935db052d1939a2`). O formulário solicitou e reenviou o código; Gmail externo confirmou Inbox e assinatura válida. O responsável forneceu o código da conta descartável, usado sem incluí-lo nas evidências. A confirmação apagou os campos, voltou ao login sem autenticação automática e a nova senha abriu a Jornada.
- A API verificou senha antiga, JWT web, access token mobile e refresh anteriores recusados; nova senha aceita, versão de credenciais incrementada e nenhuma solicitação ativa restante. Histórico, concorrência, código inválido/expirado/usado e tentativas continuam cobertos pela suíte PostgreSQL real.
- Combinação da PR com a main validada: 31 suítes / 137 testes mobile, tipos/lint e SQLite real; 67 testes API, 15 do painel/build e links locais. Banco PostgreSQL 17.6 novo/legado, SMTP Mailpit e regressões de edição/arquivamento e recuperação integram a mesma matriz.
- A consulta remota somente de estrutura confirmou a ausência de `credential_version`. A compatibilidade de deploy foi acrescentada sem alterar o banco remoto. A matriz real executa cadastro/login web e mobile, JWT legado, bootstrap, refresh e revogação antes da migration; depois aplica o SQL e comprova as garantias de recuperação. Regressões HTTP impedem o caminho legado após a migration e em falhas de permissão/cache ou com recuperação habilitada.
- O primeiro CI da integração parou ao baixar Mailpit por timeout na autenticação do Docker Hub. O CI usa o [espelho oficial GHCR](https://mailpit.axllent.org/docs/install/docker/) da mesma versão 1.31.4; as imagens local e espelhada foram comparadas. Nenhum teste foi removido.
- APK, API, banco/volumes, redirecionamento ADB e arquivos com códigos/tokens descartáveis foram removidos. Westmail permanece saudável; sua credencial exclusiva e configuração local do backend foram preservadas com acesso restrito. Nenhum código, senha, token ou contato integra este documento.
- SQL remoto, habilitação em produção, áudio TalkBack destas telas e iOS não foram realizados. O gate #7 e o rollout operacional acima continuam aplicáveis.

Os requisitos de proteção seguem o [guia de recuperação de senha da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). A caixa de CI usa a [API do Mailpit](https://mailpit.axllent.org/docs/api-v1/) para ler a mensagem somente em memória, sem imprimir seu conteúdo.
