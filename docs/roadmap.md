# Acompanhamento do roadmap

Estado verificado em **23/09/2026**. As issues seguem sendo a fonte dos critérios detalhados; o PR #34 ainda está aberto, portanto a issue #8 só será concluída após integração.

| Issue | Melhoria | Estado | Entrega |
| --- | --- | --- | --- |
| [#11](https://github.com/vitoradriao/revive/issues/11) | Atualizar Vite/Vitest e corrigir avisos de segurança da infraestrutura de testes | Concluída | [PR #28](https://github.com/vitoradriao/revive/pull/28) |
| [#6](https://github.com/vitoradriao/revive/issues/6) | Versionar o esquema base do banco e permitir atualização segura de bases existentes | Concluída | [PR #30](https://github.com/vitoradriao/revive/pull/30) |
| [#12](https://github.com/vitoradriao/revive/issues/12) | Validar migrations e integração transacional em PostgreSQL real no CI | Concluída | [PR #31](https://github.com/vitoradriao/revive/pull/31) |
| [#13](https://github.com/vitoradriao/revive/issues/13) | Versionar o esquema SQLite e preservar operações pendentes | Concluída | [PR #32](https://github.com/vitoradriao/revive/pull/32) |
| [#14](https://github.com/vitoradriao/revive/issues/14) | Revogar sessões e isolar contas durante refresh e troca de usuário | Concluída | [PR #33](https://github.com/vitoradriao/revive/pull/33) |
| [#8](https://github.com/vitoradriao/revive/issues/8) | Tornar mutações atômicas e persistir a fila antes do envio | PR aberto; checks de API, mobile e PostgreSQL passaram | [PR #34](https://github.com/vitoradriao/revive/pull/34) |
| [#7](https://github.com/vitoradriao/revive/issues/7) | Homologar Android, atualização, modo offline e privacidade em aparelho físico | Pendente; depende da integração das funcionalidades do ciclo | [Issue #7](https://github.com/vitoradriao/revive/issues/7) |

## Pendências do ciclo

As próximas entregas seguem a ordem e as dependências definidas no roadmap principal [#10](https://github.com/vitoradriao/revive/issues/10). Depois que #8 for integrada, a próxima issue da fila é #15: tratar avisos transitivos do Expo sem sair da matriz do SDK 57. A homologação física da #7 permanece como gate de liberação.

Não publique o aplicativo automaticamente ao concluir essas tarefas. Os cenários físicos de instalação, upgrade, notificações e privacidade exigem validação própria antes da liberação.

Outras etapas de distribuição, como testes iOS, política de privacidade, página de exclusão e configuração de push remoto, estão no [estado da implementação mobile](../revive-mobile/docs/implementation-status.md) e no [checklist de release](../revive-mobile/docs/release-checklist.md).

Para registrar uma nova proposta, use os [modelos de Issue](https://github.com/vitoradriao/revive/issues/new/choose) e siga o [guia de contribuição](../CONTRIBUTING.md).
