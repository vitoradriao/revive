# Preferências da Jornada — #66

Entrega de API e painel web. A interface mobile, migração da seleção local nativa,
leitor de tela real e homologação bidirecional em aparelho ficam para depois.
Não houve alteração em `revive-mobile/`, deploy ou publicação.

## Contrato

`GET /api/v2/preferences` e `PATCH /api/v2/preferences` usam a autenticação v2
existente, com respostas `Cache-Control: no-store`. Ambos os transportes, sessão
web e bearer, consultam a mesma configuração por usuário. O bootstrap continua
compatível e não precisa buscar a nova tabela para atender clientes anteriores.
O contrato completo está em [OpenAPI](openapi.js).

Sem configuração, GET devolve defaults sem criar uma linha:

```json
{
  "preferences": {
    "primary_habit_id": null,
    "indicator_order": ["current_streak", "historical_record", "sequence_savings", "accumulated_savings"],
    "intro": { "version": 0, "state": "pending" },
    "revision": 0
  }
}
```

PATCH exige `revision` e pelo menos um campo editável. Campos omitidos são
preservados; `indicator_order` e `intro`, quando enviados, substituem seus valores
inteiros. A revisão é por conta, começa em zero e incrementa em cada alteração
confirmada. Revisão antiga retorna 409. A versão do conteúdo da introdução é
independente: `intro.version` de 0 a 1000000; estado `pending`, `completed` ou
`dismissed`; versão zero exige `pending`. A tela de introdução não faz parte desta
entrega. O editor web preserva seu estado remoto e não envia esse campo.

Principal não nulo exige hábito ativo da própria conta; ID ausente, arquivado ou
de outra pessoa retorna 422 sem distinguir ownership. Arquivar depois mantém o
ID, permitindo aviso e fallback ao primeiro ativo disponível. Sem ativos, não há
principal utilizável. A Jornada identifica o principal e o check-in usa essa
escolha inicial; uma seleção manual válida continua prevalecendo. Os quatro
indicadores mantêm os cálculos e as coberturas existentes; fixar principal não
altera métricas agregadas. A tela de detalhes de hábito arquivado mantém consulta
de registros, com escrita bloqueada.

## Catálogo, defaults e compatibilidade

| ID estável | Indicador existente |
| --- | --- |
| `current_streak` | Maior sequência atual entre hábitos ativos |
| `historical_record` | Recorde histórico entre hábitos disponíveis |
| `sequence_savings` | Economia estimada da sequência em destaque |
| `accumulated_savings` | Economia estimada acumulada dos hábitos disponíveis |

A ordem aceita de 1 a 32 IDs únicos, formato `^[a-z][a-z0-9_]{0,63}$`. IDs
futuros são aceitos pela API. O cliente conserva os desconhecidos no documento,
filtra somente na apresentação e acrescenta conhecidos ausentes na ordem padrão.
Uma ordem com somente IDs futuros exibe os quatro indicadores conhecidos. Não há
ocultação de todos os indicadores nem novas métricas. Reordenação usa IDs, sem
persistir textos traduzidos. Restaurar ordem é uma escolha explícita que
substitui toda a ordem pelos defaults do catálogo atual, inclusive removendo IDs
que esse cliente não conhece. Erros de validação preservam as escolhas locais;
não há truncamento silencioso de documentos no limite do contrato.

A seleção local do check-in não é importada para a configuração sincronizada.
Isso evita promover uma escolha pontual a principal e misturar preferências de
contas. A integração nativa futura deve ler este contrato por usuário e preservar
sua seleção manual, sem migrar uma chave global entre contas.

## Conexão, concorrência e recuperação

- Preferências só são alteradas online, sob o mesmo Web Lock da conta usado pela
  fila. Não há novo tipo de intenção, replay ou limpeza de pendências.
- A última resposta confirmada fica em `meta/journeyPreferences` no IndexedDB da
  conta, sem mudar a versão do banco. A fila e os rascunhos existentes permanecem.
- A consulta ocorre na entrada da Jornada, retomada da conexão, foco da janela e
  pelo botão de consulta. Outra aba/sessão aparece após uma dessas consultas;
  não há atualização em tempo real por push.
- A geração e a conta são verificadas antes/depois das etapas assíncronas, antes
  da gravação e antes da publicação da resposta. Trocar conta desmonta o editor
  e limpa os dados publicados da anterior.
- Escolhas não enviadas ficam no `sessionStorage` da aba, por conta e geração.
  Uma aba duplicada recebe uma cópia independente. Não contêm credenciais ou
  conteúdo de diário/motivo pessoal. Encerrar a sessão da aba pode removê-las;
  elas não são uma fila durável de envio.
- Antes do PATCH, um marcador exige revisão. Conflito, resposta perdida ou reload
  preservam escolhas e bloqueiam envio. Consulte, compare principal e ordem do
  servidor e escolha manter escolhas locais com a revisão consultada ou usar a
  versão remota. Não há repetição automática do PATCH.
- Se a confirmação remota chegar e a persistência local falhar, a interface não
  declara configuração salva neste navegador. Consulte novamente para recuperar
  a cópia; nenhuma fila é apagada para corrigir armazenamento.
- Offline usa somente a configuração confirmada da conta, ou defaults quando não
  há cópia. A edição e o envio ficam desabilitados. O estado é anunciado em texto.

Botões Subir/Descer têm nomes acessíveis, limites desabilitados e mantêm foco
quando os itens mudam de posição. Uma região `aria-live` anuncia a nova posição.
Listas ordenadas expõem as posições; estados de erro usam alertas. A restauração
exige salvar para confirmar no servidor.

## Schema, implantação e rollback

Aplicar [migration aditiva](../supabase/migrations/20261023130000_journey_preferences.sql)
antes da API e do cliente. A tabela privada tem RLS e acesso apenas de
`service_role`; o RPC valida revisão sob lock da linha e a configuração também
tem constraints. Uma FK composta impede principal de outra conta mesmo em
escrita direta. Excluir hábito limpa apenas sua referência e incrementa revisão;
excluir usuário remove suas preferências por cascata. A ordem contém IDs de
indicadores, não referências a hábitos.

Instalação nova e upgrade legado preservam hábitos, histórico, fila e recibos.
Conta sem preferências não recebe configuração inventada durante a migration.
Rollback de aplicação pode manter tabela, funções e configuração; não remover
schema nem limpar IndexedDB/fila. API antiga continua com bootstrap existente.
Se a migration faltar ou uma consulta falhar, a API responde 503; não retorna
sucesso ou defaults como se a leitura tivesse sido confirmada.

## Verificações de 23/10/2026

Ambiente Node 22.23.4. [Registro sintético](evidencias-testes/web-journey-preferences-20261023.json).

- `npm run test:api:unit`: 41 testes passaram.
- `npm run test:web`: 197 unitários e 103 testes de componentes/contextos passaram.
- `npm run lint:web`, `npm run build:web` e `npm run check:docs`: executados na revisão final; resultados no registro.
- `npm run validate`: bloqueado nos testes HTTP, que recebem `listen EPERM` ao
  abrir sockets locais; não se declara validação completa aprovada.
- `npm run test:db`: Docker ausente. Tentativa de PostgreSQL local com servidor
  também bloqueada por restrição de sockets.
- `PG_BIN=/caminho/postgresql/17/bin npm run test:db:single`: PostgreSQL real 17.11, migrations e verificações SQL
  completas em instalação nova e legado; defaults, owner, revisão obsoleta,
  arquivamento, restauração e cascatas passaram. Esse modo sem servidor não
  substitui concorrência em duas conexões nem testes HTTP/PostgREST.
- `/workspace/prompts/browser.sh test:browser:preferences` e execução direta de
  `npm run test:browser:preferences`: bloqueadas por sockets. Sem capturas reais
  ou homologação Chromium/Firefox/WebKit nesta execução.
- Mobile: validação não aplicável, sem arquivos alterados nessa aplicação.

O teste [de navegador](../tests/browser/journey-preferences.cjs), registrado em
`test:browser`, cobre três engines, ordenação com Enter/foco, duas abas, conflito
com reload e revisão explícita, seleção manual, sessão bearer separada, IDs
futuros, introdução, arquivo, offline, restauração e A/B. Usa IndexedDB e Web
Locks reais quando executado em ambiente suportado. Evidências opcionais são
sintéticas, sem tokens ou conteúdo pessoal. WebKit filtra somente diagnósticos de
GETs interrompidos por navegação, com `failedReads` e fallback regex.

Pendências de aceite: executar `npm run validate`, `npm run test:db`, o novo
navegador e regressões `test:browser:habits`, `test:browser:diary`,
`test:browser:progress` e `test:browser:client` em ambiente com sockets; validar
leitor de tela e paridade mobile em aparelho. O teste bearer cobre o contrato
compartilhado, sem representar a interface mobile.


Revalidação local adicional: `npm run validate`, `npm run lint:web` e `test:browser:preferences` nos três motores aprovados.
