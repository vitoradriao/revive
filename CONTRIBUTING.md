# Contribuindo com o REVIVE

## Registrar a tarefa

Abra uma Issue antes de iniciar uma correção ou melhoria. Descreva o problema, o resultado esperado e os critérios de conclusão. Para bugs, inclua passos de reprodução e o ambiente, sem dados pessoais ou credenciais.

## Criar uma branch

Atualize a `main` e crie uma branch com nome relacionado à tarefa:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/numero-da-issue-descricao
```

Use também `fix/`, `docs/` ou `chore/` quando forem mais adequados. Desenvolva a alteração nessa branch e mantenha a `main` para alterações integradas por PR.

## Fazer commits durante o trabalho

Faça um commit quando concluir uma etapa coerente e verificável. Separe mudanças independentes, mas mantenha juntas as partes necessárias para a mesma correção. Revise o diff e adicione somente os arquivos da tarefa.

Exemplos de mensagens:

```text
fix: corrigir validação da data de uma meta
docs: atualizar configuração local do painel
chore: distribuir instalador pela Release
```

O histórico deve refletir o trabalho realizado, com datas reais. Não divida alterações artificialmente para aumentar a contagem de commits e não reescreva commits já compartilhados sem alinhar com a equipe.

## Validar e abrir o Pull Request

1. Execute as verificações correspondentes à mudança. Para API ou painel, use `npm run validate` na raiz. Para mobile, use `npm run validate --prefix revive-mobile`.
2. Para documentação, confira comandos, links relativos e consistência com os arquivos de configuração. Registre o que foi ou não executado.
3. Envie a branch com `git push -u origin nome-da-branch`.
4. Abra um PR para `main`, descrevendo o problema, a solução e a validação. Relacione a Issue com `Closes #numero` quando o PR resolver toda a tarefa.
5. Aguarde as verificações automáticas e solicite revisão de outro integrante quando disponível. Corrija os apontamentos antes de integrar.
6. Na integração, prefira um merge commit quando os commits individuais forem úteis para acompanhar a evolução. Evite perder etapas relevantes em um único commit genérico.

O workflow de testes executa a validação da API e do painel nos PRs. A validação do mobile deve ser registrada separadamente quando houver mudanças no aplicativo.

## Distribuir instaladores e builds

Anexe arquivos como `.msi`, `.apk` e `.aab` a uma GitHub Release, com tag, descrição e instruções de uso. Não adicione esses binários ao código-fonte. Para arquivos de terceiros, informe a origem, a versão e o checksum SHA-256.

Antes de remover um arquivo já versionado, confirme que o anexo da Release está acessível e atualize os links da documentação. A exclusão em um novo commit não apaga o arquivo dos commits anteriores; mudanças no histórico exigem planejamento separado.

## Informações privadas

Não versione `.env`, tokens, senhas, chaves de assinatura ou dados reais de usuários. Use arquivos de exemplo com valores vazios e remova informações sensíveis de capturas e logs anexados às Issues.
