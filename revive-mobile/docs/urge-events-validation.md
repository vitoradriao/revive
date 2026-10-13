# Registro e consulta de vontades — issue #25

Implementação em 13/10/2026, sobre a entidade e os contratos da #24. Entradas: detalhe do hábito → Registrar vontade / Consultar histórico de vontades; calendário → Vontades / Consulta por período. A #27 não foi alterada.

## Comportamento

A criação pede uma intensidade inteira de 0 a 10. Há seleção por botões com rótulos e estado acessíveis, além de entrada numérica. Gatilhos, nota, ação realizada e resultado são opcionais; os campos livres usam o limite de 1000 caracteres do contrato. A descrição é retrospectiva: não há atividade, contato, plano ou recomendação. A confirmação informa que o contador não foi reiniciado.

O momento inicial é o instante de abertura do formulário. Data e hora podem ser ajustadas para o passado no fuso exibido, preservado durante o preenchimento mesmo se o aparelho mudar de fuso. A conversão valida a data civil e o fuso IANA, rejeita horas inexistentes/ambíguas de horário de verão e aplica a tolerância de cinco minutos do servidor. A consulta aceita período, hábito e fuso. No calendário, check-ins usam a data civil salva, enquanto recaídas e vontades usam o fuso escolhido; o botão Hoje também respeita esse fuso.

A volta à tela atualiza o hábito. Arquivar desabilita novos eventos sem apagar o rascunho; reativar permite retomar. O serviço de criação revalida conta, ownership e estado do hábito antes de persistir. A API mantém a validação transacional do hábito ativo. O histórico de hábitos arquivados continua consultável.

Os três tipos são identificados por texto: Check-in, Vontade registrada e Recaída registrada. Os filtros não dependem de cor. Datas/fuso/hábito/cursor fazem parte da identidade das consultas. Paginação e recibos são deduplicados pelo ID canônico. Consultas offline indicam explicitamente cobertura local parcial. Códigos futuros de gatilho são preservados e apresentados sem descarte.

## Fila, recibos e compatibilidade

A intenção é gravada no SQLite antes de transporte. Duplo toque não cria uma segunda intenção; Registrar outra vontade é uma ação explícita. Erro antes da gravação mantém os campos editáveis. Depois da gravação, o recibo bloqueia reenvio involuntário e mantém os campos submetidos visíveis, com estado pendente, falha ou sincronizado e acesso à recuperação.

O cliente passa a usar `/api/v2/vontades`, onde o router já era montado. O bootstrap não contém esse histórico. Por isso a resposta de criação é gravada na tabela versionada existente `urge_event_pages_v1`, sob uma chave interna de recibo por usuário/intenção, antes de retirar a intenção da fila. A leitura une páginas salvas e recibos confirmados, sem depender de um snapshot ilimitado. Após falha de bootstrap ou reinício, o mesmo ID/chave é retomado e o ID temporário é reconciliado, sem duplicar a apresentação ou a escrita remota. Reconexão/sincronização invalida as consultas afetadas.

Não há migration adicional: SQLite v3 e a tabela de páginas da #24 são reutilizados. A fila de operações antigas, payloads incompatíveis e bytes para recuperação permanecem preservados. Logout/exclusão da conta limpam páginas e recibos do usuário. Nenhum SQL remoto foi aplicado nesta entrega; o ambiente deve ter as migrations anteriores, incluindo #24/#21, antes do rollout.

## Validação automatizada

- Tipos e lint mobile; 39 suítes / 169 testes após incluir a regressão de página antiga vazia; testes de formulário, intensidade 0/10, campos opcionais, gatilhos, limites, momento passado/futuro, duplo toque, falha durável, rascunho/arquivamento e atualização do recibo.
- Fuso brasileiro perto de meia-noite, UTC, fuso positivo extremo e rejeição de horas inválidas/ambíguas; Hoje seleciona a data no fuso escolhido.
- Consulta paginada, deduplicação entre servidor/recibo/fila, conta A/B durante uma resposta, erro de autorização sem fallback para dados antigos, filtros de hábito/dia/fuso e estados offline.
- SQLite real em arquivo: criar offline, fechar/reabrir, recibo gravado antes de falha de snapshot, replay com a chave original, um único evento canônico, instante histórico e isolamento/limpeza por conta. O transporte e o adaptador nativo são substituídos neste teste; a persistência, a fila e a sincronização são os módulos reais.
- PostgreSQL 17.6/PostgREST reais: schema novo/legado, replay concorrente de vontades, autorização, filtros de dia/fuso, paginação com timestamps iguais, intensidade/futuro inválidos e contador preservado. O servidor é o contrato existente da #24, sem alteração de SQL.
- 72 testes da API e 15 do painel/build, 160 links locais da documentação e bundle Android (3902 módulos). Nenhum aparelho estava conectado na verificação desta sessão.

Comandos: `npm run validate --prefix revive-mobile`, `npm run validate` na raiz e `npm run test:db` com Docker.

## Roteiro em Android

Verificar em aparelho antes de liberação, no gate integrado [#7](https://github.com/vitoradriao/revive/issues/7). Não confundir testes automatizados ou bundle com aceite físico.

1. Registrar vontade com intensidade 0, sem campos opcionais; confirmar estado e contador intacto. Repetir com 10, gatilhos e campos máximos.
2. Em modo avião, salvar, encerrar e reabrir; consultar o evento. Reconectar e confirmar um único evento com os dados finais, sem recriar.
3. Guardar um rascunho, ir a outra tela, arquivar o hábito e retornar. Confirmar bloqueio de novas criações, rascunho preservado e histórico legível; reativar e retomar.
4. Registrar perto da meia-noite brasileira; consultar no dia/fuso brasileiro e em UTC. Mudar o fuso do aparelho durante um rascunho e verificar que o fuso salvo continua explícito. No calendário, verificar Hoje no fuso escolhido e os três tipos textuais.
5. Trocar A/B durante carregamento e sincronização. Nenhum formulário, página, recibo ou evento da conta anterior deve aparecer.
6. Com viewport pequeno, fonte ampliada e TalkBack, conferir scroll, rótulos, estados selecionados/checados, entrada numérica alternativa e anúncios de erro/recibo. Nenhum campo longo pode ser truncado pela apresentação.

## Recuperação e rollout

Publicar apenas com a API v2 e as migrations prévias disponíveis. Para falhas permanentes, usar Sincronização; repetir usa a mesma chave. Não limpar fila/cache para atualizar. Se um binário antigo não conseguir reconhecer o esquema/payload, retomar com versão compatível preservando os dados. Recibos locais são mantidos após a reconciliação porque comprovam eventos aceitos que o bootstrap não retorna.
