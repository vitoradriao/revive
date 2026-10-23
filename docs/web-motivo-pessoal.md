# Motivo pessoal privado no painel — #65

Base revalidada: `main 9491913`, branch `feature/65-motivo-pessoal-habito`. Foram consultados os contratos atuais da API, a edição transacional da #60, o gerenciamento e bootstrap mobile, as exportações existentes e o padrão do PR #75 (`c66e450`). Esta entrega implementa API e painel; nenhum arquivo mobile foi alterado.

## Uso e contrato

Em **Detalhes → Gerenciar hábito**, a pessoa consulta o motivo sincronizado, escreve um rascunho, salva ou deixa vazio para remover. Funciona também em hábitos arquivados. A área de leitura mostra a última versão confirmada, separada do rascunho. Offline permite leitura e preparação local; envio exige conexão.

`motivo_pessoal` é anulável na própria linha de `vicios`; hábitos anteriores começam com `null`. A [migration](../supabase/migrations/20261023120000_habit_personal_reason.sql) acrescenta coluna e constraint e substitui a RPC `edit_revive_habit`, mantendo ownership e lock da linha. Um trigger remove o campo dos DTOs de hábito gravados em recibos idempotentes de recaída, evitando cópias privadas após excluir o hábito. PATCH usa a revisão existente: uma revisão concorrente recebe `409 REVISAO_CONFLITO`; outra conta recebe `404`. Arquivo não impede a edição. O campo omitido preserva o conteúdo; `null` ou texto vazio após normalização remove.

A normalização substitui CRLF e CR por LF e remove espaços das bordas conforme `String.trim` do ECMAScript. A função SQL reproduz a lista Unicode desse trim explicitamente. A contagem considera pontos de código Unicode após normalizar: emoji fora do BMP conta um, acento combinante conta separadamente. Não há NFC/NFKC. Até 1000 são aceitos; acima disso recebe `422`, sem truncamento. NUL e substitutos Unicode isolados são recusados, pois não são texto representável no PostgreSQL UTF-8. [Casos compartilhados](../tests/fixtures/personal-reason.cjs) exercitam as mesmas regras na API e no painel; a suíte PostgreSQL compara a função SQL com esses casos.

O contador e os erros têm rótulos e anúncio de status. O textarea não usa `maxLength` UTF-16: a pessoa pode corrigir um rascunho acima do limite sem perder conteúdo. **Limpar motivo pessoal** altera somente o rascunho; **Salvar alterações** confirma a remoção online.

O [OpenAPI](openapi.js) documenta o campo e a capacidade `X-Revive-Include-Personal-Reason: true`. Sem esse cabeçalho, todas as respostas JSON da API, inclusive bootstrap, PATCH, rotas legadas e recibos aninhados, omitem `motivo_pessoal`. O painel envia a capacidade explicitamente nas requisições; ela libera o conteúdo somente em leituras e no PATCH do hábito, sem incluir o motivo em respostas de outras mutações. Autenticação e ownership continuam obrigatórios. As respostas usam `no-store` e `Vary` no cabeçalho de capacidade. Esse contrato protege o cliente mobile atual, que exporta seu bootstrap bruto, sem precisar alterar o aplicativo nesta entrega.

O verificador de documentação passa a incluir arquivos novos não ignorados antes do commit e usa execução assíncrona do Git, compatível com este ambiente.

A capacidade de leitura não é consentimento para exportação. O JSON de Perfil usa uma projeção explícita de campos do hábito; CSV de relatórios já seleciona os campos dos registros. Não há inclusão do motivo em notificações, mensagens motivacionais ou analytics. O PATCH não registra corpo ou texto em logs; o diagnóstico de falha do bootstrap contém somente código técnico.

## Rascunho, conflito, exclusão e contas

O [editor existente](../revive-painel/src/components/habits/HabitManagement.jsx) persiste o novo campo nos rascunhos da store `meta`, com base e estado remoto. O snapshot confirmado já armazena objetos aditivos. Não há mudança de versão do IndexedDB, exclusão de fila ou migração destrutiva. Rascunhos anteriores sem o campo continuam válidos e não removem o motivo ao salvar outros campos.

Conflito conserva o rascunho após reload e apresenta motivo local e remoto para comparação. **Manter rascunho e revisar com esta versão** adota a revisão explicitamente e exige novo envio. **Substituir rascunho pela versão remota** descarta os campos locais somente por escolha da pessoa. Resposta perdida mantém o marcador incerto e exige consulta; não repete PATCH automaticamente.

A operação reutiliza o Web Lock por conta, a reconciliação da fila, os prazos e as verificações de conta/geração antes e depois das etapas assíncronas. Uma resposta tardia de A não publica dados ou confirmação em B. Edição do motivo não muda sequência, taxa diária, segmentos de economia, marcos, registros ou metas.

Excluir o hábito elimina a própria coluna no banco. Após confirmação remota, a limpeza IndexedDB também remove os rascunhos de todas as cópias daquele hábito e suas projeções em snapshots/páginas; preserva rascunhos de outros hábitos e a fila. A exclusão transacional da conta já remove os hábitos por cascata; a limpeza local confirmada já inclui todas as stores.

## Validação e evidências

Execução em 23/10/2026, Node **22.23.4**. Dependências existentes foram reutilizadas, sem alteração de lockfiles.

| Comando | Resultado neste ambiente |
| --- | --- |
| `npm run test:api:unit` | 26 testes aprovados |
| `npm run test:web` | 290 testes aprovados (193 de serviços/utilitários e 97 de interface/contexto) |
| `npm run lint:web` | Aprovado |
| `npm run build:web` | Aprovado; aviso existente de chunk principal acima de 500 kB |
| `npm run check:docs` | Aprovado: 381 links, incluindo arquivos novos antes do commit |
| `npm run validate` | Aprovado (reexecutado fora do sandbox restrito) |
| `npm run test:db` | Bloqueado: Docker não instalado |
| `/workspace/prompts/browser.sh test:browser:reason` | Aprovado em Chromium, Firefox e WebKit |
| `npm run test:browser:reason` | Aprovado nos três motores |
| `npm run test:browser:storage` | Chromium não inicia: `sandbox_host_linux`, operação não permitida |
| `npm run validate --prefix revive-mobile` | Não aplicável: nenhum arquivo mobile alterado |

[Testes de API](../tests/integration/personal-reason-bootstrap.test.js) cobrem capacidade de leitura, DTO padrão e isolamento de bootstrap. Os testes de PATCH cobrem normalização, owner/revisão encaminhados e rejeição antes da RPC. Os testes Vitest cobrem limite Unicode, campo omitido, exportação por projeção, edição/remoção em arquivado, leitura offline, conflito com reload, comparação e resposta tardia A/B.

[A suíte de PostgreSQL](../tests/db/personal-reason.mjs) foi integrada a `test:db`: propriedade inicial nula, normalização compartilhada, API real, dono/outra conta, concorrência, arquivo, campos de cliente antigo, limites, preservação de histórico/economia/metas e exclusão de hábito/conta. O catálogo verifica tipo/anulabilidade e permissões da função; o upgrade legado verifica ausência inicial de conteúdo. A mesma asserção SQL de normalização, limite, revisão, owner, arquivo e remoção roda nas instalações nova e legada. Esses cenários ainda precisam rodar em ambiente com Docker/PostgreSQL.

[O novo navegador](../tests/browser/personal-reason.cjs), registrado como `test:browser:reason` e incluído em `test:browser`, usa Chromium/Firefox/WebKit, HTTP e IndexedDB/Web Locks reais. Exercita limite sem truncar, duas abas, conflito após reload, reaplicação explícita, exportação JSON, DTO legado, arquivo, offline, remoção e troca A/B. O filtro WebKit aceita apenas GET interrompidos da origem local para bootstrap/registros/vontades/web-auth/refresh, por `failedReads` e regex de fallback. A suíte de storage acrescenta exclusão seletiva de rascunhos com preservação de fila.

O [registro sintético](evidencias-testes/web-motivo-pessoal-20261023.json) contém somente resultados, contagens e bloqueios. Nenhum texto de motivo, credencial, token ou dado real é incluído. A suíte de navegador gravou resultados sintéticos sem o texto do motivo. Isso não substitui homologação em aparelho ou leitor de tela humano.

## Implantação, recuperação e limites

1. Publicar a API com a projeção privada por padrão **antes da migration**, pois clientes antigos exportam bootstrap bruto. A API funciona sem a nova coluna, enquanto o editor novo ainda não é publicado.
2. Aplicar a migration aditiva `20261023120000_habit_personal_reason.sql` e atualizar o schema cache do PostgREST pelo procedimento do ambiente.
3. Publicar o painel com a capacidade de leitura e exportação por projeção. Validar sessões, owner e os testes de banco/navegador no ambiente suportado antes do aceite operacional.

Rollback do painel preserva coluna, dados, rascunhos e fila. Manter a projeção de privacidade na API durante recuperação: uma versão anterior que faça `select *` sem esse filtro voltaria a expor a coluna para exportação bruta. Não remover a coluna para reverter uma interface nem limpar IndexedDB. Se o envio ficar incerto, consultar o estado remoto e comparar antes de reaplicar.

A UI mobile e a sincronização bidirecional de motivo pelo aplicativo ficam para a próxima entrega. O aplicativo atual continua editando os campos antigos sem apagar o motivo; seu bootstrap padrão não recebe o campo privado. A exportação seletiva ainda não existe: a opção de incluir motivo, **opt-in e desmarcada por padrão**, pertence à #27. Esta entrega não implementa essa opção nem declara os critérios globais mobile/#27 homologados. Não houve deploy em produção.
