# Próximas melhorias

Este documento reúne pendências verificadas na documentação e na revisão do repositório. Os critérios de conclusão e o andamento ficam nas Issues vinculadas.

| Prioridade | Melhoria | Por que importa | Acompanhamento |
| --- | --- | --- | --- |
| Alta | Versionar o esquema base do banco | Permitir uma instalação reproduzível a partir de um banco vazio | [Issue #6](https://github.com/VitorYunguiar/revive/issues/6) |
| Alta | Validar o Android em aparelho físico | Verificar instalação, sessões, isolamento e modo avião no ambiente real | [Issue #7](https://github.com/VitorYunguiar/revive/issues/7) |
| Alta | Garantir atomicidade na sincronização | Evitar inconsistência entre gravações e respostas idempotentes sob falhas | [Issue #8](https://github.com/VitorYunguiar/revive/issues/8) |

Esses itens não estão concluídos. A existência de uma fila offline ou de testes automatizados não comprova, sozinha, todos os cenários de concorrência e recuperação de falhas.

Outras etapas de distribuição, como testes iOS, política de privacidade, página de exclusão e configuração de push remoto, estão no [estado da implementação mobile](../revive-mobile/docs/implementation-status.md) e no [checklist de release](../revive-mobile/docs/release-checklist.md). Devem receber tarefas próprias quando entrarem no próximo ciclo.

Para registrar uma nova proposta, use os [modelos de Issue](https://github.com/VitorYunguiar/revive/issues/new/choose) e siga o [guia de contribuição](../CONTRIBUTING.md).
