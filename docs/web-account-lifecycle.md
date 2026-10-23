# Recuperação, exclusão de conta e saída no painel

Entrega da [issue #64](https://github.com/vitoradriao/revive/issues/64), revalidada na base `0212925`, que já contém sessões web (#57), fila offline (#58) e as entregas web até #63. A referência funcional permanece no [recovery mobile](../revive-mobile/src/features/auth/password-recovery.tsx) e nos contratos da autenticação própria.

## Recuperar senha

O login oferece **Esqueci minha senha**, e o perfil oferece **Redefinir senha por e-mail**. Ambos abrem `/recuperar-senha`, uma rota pública, acessível mesmo quando a restauração da sessão encontra erro de rede. Nenhum e-mail, código ou senha vai para a URL.

- `POST /api/v2/auth/password-recovery/request` recebe somente `email`, normalizado. O painel usa `request_id` e `reenviar_apos` do servidor, valida o recibo e apresenta a mensagem neutra. O contador apenas organiza o reenvio nesta página; os limites persistentes continuam no servidor e não são removidos por reload.
- A tela informa que solicitar não confirma entrega. HTTP 202 também cobre endereço desconhecido, limites, SMTP ausente/falho e rollout desabilitado. Não há texto de envio confirmado.
- `POST /api/v2/auth/password-recovery/confirm` recebe `email`, `request_id`, `codigo` e `senha` no corpo JSON. O código exige oito dígitos. A senha espelha o contrato atual: pelo menos seis caracteres, uma maiúscula ASCII, um dos caracteres especiais aceitos e até 72 bytes UTF-8; confirmação deve coincidir.
- Código, senha e confirmação ficam apenas no estado do formulário. Reenvio, alteração de e-mail, sucesso e desmontagem removem esses campos. A operação exige conexão e não entra na fila offline.
- Só uma confirmação aceita retorna ao login com mensagem de sucesso, sem criar sessão. O servidor expira o cookie HttpOnly pelo [adaptador existente](../web-auth-transport.js), incrementa a versão de credenciais e revoga as sessões da conta pelo contrato já existente. O painel invalida a geração nas abas abertas e cancela respostas antigas. Falha mantém o formulário para revisão, sem declarar redefinição.

A política de expiração de dez minutos, cinco erros, consumo único, limites e rollout continua em [password-recovery.js](../password-recovery.js), no PostgreSQL e no [guia do backend](password-recovery.md). A alteração do backend acrescenta apenas a expiração do cookie na resposta de sucesso; os corpos e status mobile permanecem compatíveis.

## Excluir conta

O perfil substitui a instrução de procurar suporte por ações disponíveis. **Excluir conta** abre diálogo com descrição das consequências, foco inicial em **Cancelar exclusão**, teclado e Escape. Cancelar não envia requisição e devolve o foco ao botão de abertura.

A confirmação chama `DELETE /api/v2/account` com access token v2 em memória. O lock de sincronização da conta exclui envios/alterações concorrentes, e o lock global de autenticação exclui login e rotação de cookie durante a exclusão. Conta e geração são verificadas antes de executar. O servidor determina o proprietário pela sessão, sem aceitar um ID escolhido pelo cliente.

Somente HTTP 204, sem corpo, confirma a exclusão. Nesse momento o servidor expira `revive_refresh` com Path `/api/v2/web-auth` e as opções HttpOnly/SameSite/Secure do adaptador. JavaScript não tenta escrever nesse cookie.

Após a confirmação, uma transação limpa todos os stores daquela conta: snapshot, páginas, rascunhos/metadados, fila, recibos e mapeamentos. O ponteiro offline e o tema local são removidos; memória, páginas privadas e diálogos são desmontados pela mudança de geração. O login informa a exclusão concluída e as demais abas convergem para a sessão encerrada.

Sem conexão, com falha do servidor ou timeout de 12 segundos, o painel não confirma exclusão nem apaga a fila. DELETE não tem retry automático nem intenção offline. Uma resposta perdida pode ocorrer após o commit remoto: o painel conserva o conteúdo local e não interpreta um 401 posterior como comprovante de exclusão. É necessário restabelecer a conexão e verificar o estado remoto antes de repetir uma operação destrutiva.

## Sair e retomar limpeza interrompida

Ao sair, as pendências são consultadas sob o lock da conta. O diálogo existente oferece três escolhas:

| Escolha | Comportamento |
| --- | --- |
| Sincronizar e sair | Usa o coordenador existente, preservando as mesmas Idempotency-Key. Só encerra quando não restam pendências e o servidor confirma a saída. Falha, backoff ou conflito mantém a sessão e a fila. |
| Cancelar | Fecha o diálogo; não revoga sessão nem altera dados. |
| Descartar pendências e sair | Revoga primeiro a sessão pelo cookie; somente após confirmação remove as pendências e os demais dados locais. Falha de rede preserva a fila e as preferências. |

Se o armazenamento não puder ser aberto, a saída não ignora pendências desconhecidas. A interface pede reabrir a página. Logout e exclusão antigos não podem atingir a conta que entrou depois. A geração persistida também é consultada dentro do lock, antes que uma notificação atrasada possa permitir trabalho antigo. Requisições autenticadas recebem sinal de cancelamento ao mudar a geração, mantendo também a recusa de respostas tardias caso o transporte não consiga cancelar.

Depois da confirmação remota, `revive_confirmed_cleanup:<id da conta>` guarda somente o valor `confirmed`. O marcador permite repetir a limpeza local sob Web Lock se uma transação IndexedDB for abortada ou o navegador fechar nessa etapa. Não guarda credenciais, conteúdo ou uma nova intenção de exclusão; não repete a requisição remota. Ele só é removido depois da limpeza local. Falhas e timeouts remotos não criam esse marcador. A retomada preserva o armazenamento e as preferências de outra conta ativa.

Não houve migration nem alteração da versão 2 do IndexedDB. Atualização/reversão não exige apagar fila ou histórico. A limpeza é restrita às ações de saída/exclusão confirmadas e à sua retomada.

## Testes e evidências

Os [testes de serviços](../revive-painel/src/services/account-lifecycle.test.js) verificam preservação em falhas, escolha explícita, conta trocada, armazenamento indisponível e retomada de limpeza. Os testes de [sessão](../revive-painel/src/services/session-manager.test.js), [recovery](../revive-painel/src/services/password-recovery.test.js), [formulário público](../revive-painel/src/pages/PasswordRecoveryPage.test.jsx) e [diálogo de exclusão](../revive-painel/src/components/account/AccountSecurity.test.jsx) cobrem coordenação, cancelamento de resposta antiga, recibos, bytes, contador, campos e foco.

A [suíte de navegador](../tests/browser/account-lifecycle.cjs), registrada em `test:browser:account` e incluída em `test:browser`, usa build público, HTTP, IndexedDB e Web Locks reais em Chromium, Firefox e WebKit. O provedor sintético mantém a mensagem somente em memória. Cenários: offline, neutralidade com SMTP/rollout indisponíveis, intervalo de reenvio, inválido, expirado, limite, indisponibilidade, sucesso, replay, senha antiga recusada, reset pelo perfil em duas abas, três escolhas de saída, falha/timeout de exclusão e limpeza dos stores/cookie. A interrupção de limpeza usa abort real da transação IndexedDB, com retomada após reload. As regressões de sessões/cliente exercitam também A/B e retorno tardio.

O [runner PostgreSQL](../tests/db/real-postgres.mjs) verifica as migrations existentes em instalação nova e upgrade legado, negativas de SQL, ownership, exclusão em cascata, revogação de access/refresh e preservação da outra conta. O [recovery real](../tests/db/password-recovery.mjs) usa SMTP Mailpit local para comprovar expiração, tentativas, limites, reenvio, rollback, consumo concorrente e revogação mobile/web.

```sh
# Node 22, conforme .nvmrc
npm run validate
npm run lint:web
/workspace/prompts/browser.sh test:browser:account
/workspace/prompts/browser.sh test:browser
npm run test:db
```

Resultados locais de 23/10/2026: Node 22.23.4; `npm run validate` aprovado com 81 testes da API, 189 unitários e 95 testes de integração do painel, além do build; `npm run lint:web` aprovado. O build mantém o aviso já existente de chunk acima de 500 kB.

`npm run test:db` não iniciou porque Docker não está instalado. A execução equivalente (`bash /tmp/revive-run-local-db.sh`) passou com PostgreSQL 17.11, PostgREST e Mailpit locais, incluindo instalação nova, upgrade legado, negativas e o runner HTTP/SQL completo. O comando de CI continua sendo `npm run test:db`. O [registro de validação](evidencias-testes/web-account-validation-20261023.json) distingue as duas execuções.

A suíte específica passou em Chromium 151.0.7922.34, Firefox 153.0 e WebKit 26.5. O [resumo por navegador](evidencias-testes/web-account-lifecycle-20261023.json) inclui a retomada após abort real de IndexedDB. A troca para B durante essa falha não expõe a fila de A; a limpeza posterior de A preserva a preferência de B.

Capturas sintéticas: [recovery com campos vazios](evidencias-testes/web-account-recovery-20261023.png), [saída com pendências](evidencias-testes/web-account-logout-20261023.png) e [exclusão sem confirmação](evidencias-testes/web-account-delete-failure-20261023.png). Não incluem códigos, senhas, tokens, conteúdo de diário ou motivos. SMTP local e resultados históricos não comprovam entrega externa ou rollout atual.

## Implantação e recuperação

Manter a configuração por ambiente: `WEB_AUTH_ENABLED`, `PASSWORD_RECOVERY_ENABLED` e SMTP são configurados no backend, conforme os guias existentes. Publicar o adaptador/API com expiração do cookie antes da interface. As dependências #57/#58 já estão na base; não há SQL novo a aplicar.

Em falha do SMTP/rollout, preservar a resposta neutra e seguir o procedimento do [backend](password-recovery.md); não retornar a uma API que aceite credenciais revogadas. Em falha de saída/exclusão, manter pendências e restabelecer conexão. Se a operação remota foi confirmada e a limpeza local interrompida, reabrir o painel retoma a transação sem reenviar a operação.

Nenhum deploy, SQL remoto ou envio externo foi realizado nesta entrega. Mobile não foi alterado; sua validação não se aplica. Leitor de tela humano e aparelho físico não foram homologados nesta rodada. Permanecem fora do escopo redesign mobile, recursos terapêuticos adicionais, proteção/agendamento nativos e publicação em produção/lojas.
