# Convenções de manutenção

## Linguagem e contratos

- Identificadores novos em inglês: `camelCase` para funções/variáveis e `PascalCase` para componentes/classes.
- Textos da interface e documentação de uso em português.
- Preserve as chaves dos contratos existentes da API. Mudanças incompatíveis exigem planejamento e versionamento.
- Evite renomear identificadores existentes sem necessidade funcional; faça refatorações incrementais com verificações.

## Organização

- Mantenha componentes, serviços, contextos e utilitários nas pastas já adotadas por cada aplicação.
- Centralize endereços da API nas configurações de ambiente.
- Coloque novas orientações técnicas em `docs/` e adicione um link à [central de documentação](README.md).
- Mantenha registros acadêmicos anteriores em `docs/academico/`, identificando seu período.
- Instaladores e builds pertencem às Releases; dependências e saídas de build não devem ser versionadas.

## Formatação

O arquivo [`.editorconfig`](../.editorconfig) define UTF-8, final de linha e indentação para os editores compatíveis. Siga também o padrão do arquivo alterado e evite reformatar arquivos sem relação com a tarefa.

Use `npm ci` para reproduzir as dependências dos arquivos de lock. Ao alterar dependências, atualize e revise também o lock correspondente.

## Verificação e revisão

Confira os [comandos de testes](testes.md) e o [fluxo de contribuição](../CONTRIBUTING.md). Cada PR deve informar o problema, a alteração, a Issue relacionada e as verificações realmente executadas.
