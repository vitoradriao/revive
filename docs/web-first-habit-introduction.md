# Introdução ao primeiro hábito — #67

Entrega de API e painel web. A Jornada oferece orientações curtas, sem abrir um
modal automaticamente, para contas sem hábitos ou histórico disponível. Hábitos
arquivados também contam como histórico. Contas com introdução concluída,
dispensada ou de versão futura não recebem uma nova introdução automaticamente.
O Perfil permite rever as orientações sem apagar etapas confirmadas.

## Uso e estados

1. Começar introdução confirma a versão 1 e a etapa `habit` em preferences.
2. Cadastrar primeiro hábito abre o formulário existente: nome, data e economia
   opcional. A criação continua em `POST /api/vicios`; não há cadastro paralelo.
3. Com o ID confirmado, a etapa `reason` oferece o motivo opcional, usando o
   editor, o rascunho privado no IndexedDB e o PATCH versionado da #65. Pular
   motivo avança sem texto. Falha nessa etapa não recria o hábito.
4. A etapa `checkin` aponta para o check-in rápido existente, inicialmente com o
   hábito da introdução; uma seleção manual continua prevalecendo. Basta escolher
   uma sugestão de humor e salvar, sem digitar reflexão ou outro texto.
5. Concluir introdução salva `completed`. Essa confirmação corresponde às
   orientações; não afirma que um check-in pendente chegou ao servidor.

Pular introdução confirma `dismissed` via preferences, conservando a etapa e o
ID já confirmados, e libera a Jornada. Continuar na Jornada apenas fecha a
orientação nesta montagem: funciona também offline e não declara dispensa remota.
Na próxima abertura, a última configuração confirmada continua valendo.

Carregamento, erro, offline, conflito e hábito indisponível têm mensagens textuais.
Não são exigidos lembretes, metas, motivo ou texto livre. A interface não promete
recursos nativos com navegador fechado. Hábitos e registros existentes permanecem
acessíveis durante a orientação.

## Contrato, concorrência e privacidade

`GET/PATCH /api/v2/preferences` mantêm autenticação própria, isolamento por pessoa,
`Cache-Control: no-store` e revisão concorrente. Os campos opcionais de progresso
ampliam `intro`, preservando a validade dos documentos antigos:

```json
{
  "revision": 2,
  "intro": {
    "version": 1,
    "state": "pending",
    "step": "reason",
    "habit_id": "10000000-0000-4000-8000-000000000001"
  }
}
```

`step` aceita `habit`, `reason` e `checkin`, somente com versão maior que zero.
`habit` permite ID ausente ou null; `reason/checkin` exigem UUID. Adoção de um ID
exige hábito da própria conta, inclusive arquivado. Uma referência previamente
confirmada permanece após exclusão do hábito: ela impede recriação automática,
mas não habilita novos eventos para um hábito indisponível. Atualizações diretas
também passam pela verificação de ownership no banco. Campos desconhecidos ou
conteúdo privado em `intro` são rejeitados.

PATCH continua substituindo `intro` inteiro. O cliente preserva etapa/ID ao
concluir ou dispensar e não envia principal nem ordem dos indicadores nessa
operação. O editor comum de preferences conserva o documento de introdução.
Conflito 409 ou resposta perdida exige consultar a versão atual antes de uma
nova decisão; nenhum PATCH é reaplicado automaticamente. Outra sessão bearer e
a sessão web consultam o mesmo documento. Não há atualização por push: a
consulta explícita, abertura da tela, foco e retomada de conexão atualizam a cópia.

O cadastro é serializado pelo Web Lock já usado pela fila da conta. Antes do
POST, grava `meta/introduction` no IndexedDB, sem alterar a versão do banco:
`creating` indica resultado ainda desconhecido; `confirmed` conserva somente o
ID. O cadastro usa o serviço e o formulário existentes. Um segundo envio da
introdução é recusado se o marcador já existe ou se uma consulta remota encontra
histórico. Rejeição HTTP conhecida permite corrigir e tentar novamente; timeout,
5xx ou resposta interrompida exige recuperação, sem repetir o POST.

A criação legada não possui contrato idempotente. O marcador evita novos envios
pela introdução; não transforma esse endpoint em uma operação idempotente nem
resolve reenvios feitos fora desse fluxo. Depois de resultado desconhecido, o
formulário da introdução oferece consulta e saída, sem a opção de repetir. Se o
hábito aparecer, escolha continuar com o cadastro existente. Se não aparecer,
aguarde e consulte novamente; não se afirma que a ausência na consulta comprova
que um envio anterior terminou.

Se o hábito foi confirmado e a gravação de preferences falhou, o marcador local
recupera o ID; em outro navegador, a lista permite escolher explicitamente o
hábito já criado. O motivo tem rascunho separado da edição completa: salvar
motivo envia somente motivo/revisão. Falha parcial, conflito e reload preservam
o rascunho e permitem consultar/revisar sem refazer o cadastro.

O check-in mantém a fila, Idempotency-Key, recibos, bloqueio contra repetição no
dia e escolha explícita de adicionar outro registro da #61. Não há novo tipo de
intenção. Salvamento local, falha de envio e confirmação do servidor continuam
separados na interface. Concluir ou dispensar a introdução não descarta a fila.
Verificações de conta/geração ocorrem antes e depois das operações assíncronas;
a troca de conta desmonta os campos e impede publicação de respostas tardias.

`intro` e o marcador de cadastro não contêm motivo, diário, senha ou token.
O motivo continua somente no rascunho privado e no hábito sincronizado, fora da
exportação padrão e das evidências. Nenhum banco, histórico, recibo ou fila é
limpo para atualizar a aplicação.

## Implantação e recuperação

Aplicar a [migration aditiva](../supabase/migrations/20261023202206_first_habit_introduction.sql)
após a migration de preferences e antes da nova API e do painel. Ela amplia a
validação JSON e acrescenta um trigger privado de ownership; não altera linhas
existentes, autenticação, RLS ou permissões públicas da tabela. Instalação nova
e upgrade legado são verificados. Dependências #56, #61, #65 e #66 foram
revalidadas no código integrado da branch.

Sem preferences disponível, a Jornada continua acessível. Uma falha de schema
não é apresentada como confirmação. Para rollback, retirar o novo painel/API
mantendo migrations, campos de progresso, rascunhos e fila. Reaplicar o cliente
retoma os dados preservados; não reverter validações de JSON enquanto existirem
documentos com progresso, nem apagar registros para contornar incompatibilidade.

## Verificações e roteiro

[Teste de navegador](../tests/browser/first-habit-introduction.cjs), registrado
como `test:browser:introduction` e incluído em `test:browser`, usa conta/fixture
sintéticas, Chromium, Firefox e WebKit, IndexedDB e Web Locks reais. O roteiro
cobre pular tudo/rever Perfil, cadastro/cancelar/voltar, pular motivo, check-in
sem digitação, offline, resposta perdida, reload sem duplicação, falha do motivo,
revisão explícita, duas abas, sessão bearer, conta histórica/arquivada e troca A/B.
WebKit usa `failedReads` e fallback regex somente para os GETs interrompidos de
bootstrap/registros/vontades/web-auth/refresh/preferences.

Acessibilidade verificada pelo navegador: foco inicial do formulário, Escape,
ativação por Enter, foco no check-in, rótulo estável após restaurar textarea,
estados `aria-live`, largura de 320 px e fonte a 200% sem sobra horizontal na
introdução. Não representa homologação com leitor de tela real.

Comandos e resultados finais estão no
[registro sintético](evidencias-testes/web-first-habit-introduction-20261023.json).
Capturas contêm somente orientações, sem motivos ou diário. O teste de PostgreSQL
cobre ownership real, etapas, falha parcial, revisão concorrente em duas conexões
e check-in sem texto com replay da mesma chave. `test:db:single` verifica também
instalação nova, legado e preservação de referências após arquivamento/exclusão.

Mobile permanece sem alterações. Interface nativa, validação em aparelho e
homologação bidirecional entre interfaces web/mobile ficam para uma entrega
posterior; a sessão bearer verifica o contrato compartilhado, não a interface
nativa. Não houve deploy ou publicação.
