# Documentação do REVIVE

Os guias abaixo descrevem a organização atual do projeto. As entregas acadêmicas e evidências datadas ficam separadas para não confundir registros anteriores com instruções de uso.

## Por onde começar

| Objetivo | Documento |
| --- | --- |
| Conhecer o produto | [README principal](../README.md) |
| Avaliar funcionalidades e processo | [Roteiro de avaliação](guia-avaliacao.md) |
| Executar API e painel | [Instalação e configuração](instalacao.md) |
| Executar ou compilar o aplicativo | [Guia mobile](../revive-mobile/README.md) |
| Compreender a solução | [Arquitetura e fluxos](arquitetura-fluxograma.md) |
| Preparar o banco | [Orientações do Supabase](../supabase/README.md) |
| Executar as verificações | [Testes e qualidade](testes.md) |
| Contribuir | [Fluxo de contribuição](../CONTRIBUTING.md) e [convenções](coding-conventions.md) |
| Consultar pendências | [Roadmap](roadmap.md) |
| Conferir disponibilidade por plataforma | [Matriz de implementação, ambiente e homologação](matriz-paridade.md) |

## Publicação

- [Vercel](deploy-vercel.md): hospedagem utilizada pelo ambiente de demonstração.
- [Render](deploy-render.md): configuração alternativa mantida no repositório.
- [Android local](../revive-mobile/docs/android-local.md): desenvolvimento, assinatura e compilação no Windows.
- [Checklist mobile](../revive-mobile/docs/release-checklist.md): verificações antes da distribuição.

## Documentação do aplicativo

- [Decisão de arquitetura mobile](../revive-mobile/docs/adr-0001-mobile-architecture.md).
- [Contratos da API mobile](../revive-mobile/docs/api-contracts.md).
- [Estado da implementação](../revive-mobile/docs/implementation-status.md).
- [Melhorias de uso](../revive-mobile/docs/quality-of-life.md).

## Evidências do painel

- [Vontades e calendário web](web-urges-calendar.md): criação durável, fusos, histórico paginado, arquivamento e recuperação da #62.

- [Check-in e diário web](web-diary.md): criação/correção duráveis, comparação de conflito, paginação e evidências da #61.

- [Edição e arquivamento web](web-habit-management.md): revisão concorrente, rascunhos duráveis, pendências e recuperação da #60.

- [Progresso histórico web](web-progress-history.md): indicadores canônicos, conquistas permanentes, cobertura, fixtures de paridade e verificação da #59.

- [Sessões web v2](web-sessions.md): contrato, concorrência entre abas e verificações da issue #57; [rollout autorizado de 16/10](web-sessions-rollout.md).

- [Cadastro de hábitos no web](web-habit-creation-validation.md): confirmação de envio, validação e recuperação de falhas da issue #56.

- [Offline web](web-offline.md): IndexedDB, fila/recibos, shell, acesso local e Sincronização da #58; PR #73 aguarda integração.

## Evidências e entregas anteriores

- [Entregas acadêmicas da Fase 02](academico/fase-02/README.md): documentos, versões de revisão e diagramas preservados.
- [Capturas de testes](evidencias-testes/README.md): registros estáticos de execuções anteriores.
- [Registro de publicação de desenvolvimento](../revive-mobile/docs/deployment-validation.md): evidências datadas de API, painel e build Android.
- [Registro de validação do Supabase](../revive-mobile/docs/supabase-development-validation.md): verificações do ambiente de desenvolvimento.

Registros datados demonstram o que foi verificado naquele momento. O estado das verificações atuais deve ser consultado no [GitHub Actions](https://github.com/VitorYunguiar/revive/actions/workflows/tests.yml).
