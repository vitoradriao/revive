# Migração do SQLite local — issue #13

O banco `revive.db` usa `PRAGMA user_version = 1`. A abertura é compartilhada por uma promessa: cache e fila aguardam a migração exclusiva terminar. A instalação nova e o banco legado v0 percorrem o mesmo passo transacional. O passo adiciona `payload_version`, encapsula JSON válido em `{ "version": 1, "data": ... }`, mantém IDs, usuário, tipo, ordem, timestamps, tentativas, status, erros e chave idempotente, e só então grava `user_version = 1`.

Os dados ficam em `bootstrap_cache_v1` e `mutation_queue_v1`. Os nomes v0 permanecem como visões somente de leitura. Um APK anterior não consegue executar sua atualização inicial da fila nem gravar nelas; a saída é reinstalar a versão atual **sem limpar os dados do aplicativo**. Uma versão atual que encontre `user_version` maior que 1 interrompe a abertura antes de escrever. Não faça downgrade de APK sobre um banco mais novo.

JSON legado inválido continua no banco com `payload_version = 0`. Uma operação com tipo, formato ou versão incompatível aparece na tela de sincronização com aviso de recuperação; ela e as operações posteriores não são enviadas automaticamente. O usuário pode descartá-la explicitamente. Um snapshot inválido é ignorado e pode ser reconstruído pelo servidor. A leitura de cache confere o ID da conta, e a fila é consultada por `user_id`.

## Reprodução e recuperação

Execute `npm ci`, `npm run validate` e, para o teste SQLite isolado, `npm run test:sqlite` em Node 22. O teste com arquivos SQLite reais cobre instalação vazia, segunda abertura, duas contas, quatro tipos de operação, tipo desconhecido, JSON corrompido, erro injetado depois de uma escrita, reabertura e versão futura. O erro faz rollback das colunas, payloads e `user_version`; a próxima abertura tenta novamente. O script usa apenas dados sintéticos e remove seus arquivos temporários.

Se uma migração falhar no aparelho, mantenha o armazenamento do aplicativo, libere espaço se necessário e abra novamente a mesma versão atualizada. Se persistir, preserve uma cópia do `revive.db` e seus arquivos WAL/SHM para análise local, sem publicar conteúdo pessoal em logs ou issues. Não apague o banco nem a fila. A reversão do código exige reverter em conjunto `database.ts`, `migrations.ts`, `envelopes.ts`, `queue-row.ts` e os testes; bancos que já chegaram a v1 devem continuar com o APK compatível.

## Validação física pendente

O teste automatizado exercita SQLite nativo do Node, não o driver Android do Expo. Antes da homologação, instalar um APK anterior sobre dados sintéticos com registro, recaída e meta pendentes; atualizar por cima com a mesma identidade de aplicativo, sem limpar dados; conferir contagem, dono, ordem e sincronização com as chaves originais. Repetir com duas contas, modo avião e encerramento durante a abertura. Registrar versão/hash dos APKs e evidência sem dados pessoais na issue de homologação. Sem aparelho conectado nesta execução, essa prova permanece aberta.
