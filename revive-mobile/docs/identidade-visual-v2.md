# Identidade visual v2 — 17 telas

Referência: pacote fornecido pelo usuário `revive-completo-17-telas-ilustracoes-finais.zip`, direção 02. Todas as 17 composições estão implementadas com componentes React Native, dados reais e os SVGs ilustrativos aprovados. As telas de referência não são usadas como imagens de interface.

## Onde encontrar cada composição

| Tela | Local no aplicativo e implementação |
| --- | --- |
| 01 Jornada | Aba Jornada: cabeçalho, pôster do recorde, indicadores e cartões dos hábitos; check-in rápido preservado |
| 02 Hábitos | Aba Hábitos: cartões ilustrados, botão de jornada e acesso aos hábitos arquivados |
| 03 Metas | Aba Metas: notas numeradas, contadores e ações de concluir/excluir |
| 04 Insights / Visão geral | Aba Insights: indicadores, humor, calendário e conquistas |
| 05 Insights / Relatórios | Seletor Relatórios no Insights: CSV, JSON e impressão existentes |
| 06 Perfil | Aba Perfil: conta, sincronização, lembrete com edição de horário recolhível, privacidade, saída e exclusão |
| 07 Sincronização | Perfil → Sincronização: ilustração, carregamento e fila real, com recuperação/descarte existentes |
| 08 Novo hábito | Jornada/Hábitos → Adicionar: título editorial, ilustração e formulário validado |
| 09 Nova meta | Metas → Criar: escolha do hábito, dias e valor combináveis e início a partir de hoje |
| 10 Detalhe / Check-in | Abrir um hábito → Check-in: resumo compacto, quatro humores e campos livres com limites |
| 11 Recaída | Abrir um hábito → Recaída: reflexão opcional e duas ações, ambas com confirmação |
| 12 Registros | Abrir um hábito → Registros: linha do tempo, registros com datas repetidas, acesso ao diário e exclusão confirmada |
| 13 Calendário | Insights → Calendário: mês/ano, dias futuros desabilitados, Hoje, atividades e filtros recolhíveis |
| 14 Conquistas / Sequência | Insights → Conquistas → Sequência: coleção de quatro ilustrações e próximos capítulos de 180/365 dias |
| 15 Conquistas / Economia | Conquistas → Economia: moeda, envelope, cofrinho e tesouro; progresso real |
| 16 Conquistas / Metas | Conquistas → Metas: bandeira, escada e constelação em lista ilustrada |
| 17 Conquistas / Registros | Conquistas → Registros: diário, volumes e percentuais calculados |

As telas 10–12 são três seções do mesmo detalhe do hábito, como previsto na documentação do pacote. Alternar entre elas preserva o rascunho do check-in e da reflexão; abrir outro hábito inicia rascunhos separados. O resumo completo, a edição/arquivamento e as vontades continuam acessíveis em **Ver progresso completo** e **Vontades e gerenciamento**.

## Regras e estados

- Recorde histórico, sequência atual e economia acumulada mantêm as definições atuais do domínio. Economia permanece identificada como estimativa.
- Falha ao carregar dados não é apresentada como progresso zero. As telas oferecem atualização quando necessário e preservam avisos de histórico incompleto e sincronização pendente.
- Conquistas usam marcos permanentes registrados: uma recaída não remove uma conquista. Os marcos conquistados recebem check e texto. Os próximos marcos usam barras limitadas a 100%, com percentuais arredondados apenas na apresentação.
- **Diferença dos dados ilustrativos:** o domínio atual conta **dias distintos com check-in**, inclusive nas conquistas de registros. Dois registros no mesmo dia continuam aparecendo separadamente no histórico, mas contam como um dia nos indicadores. Esta regra foi preservada e testada.
- Humores começam sem seleção e permitem texto livre. Recaída mantém reflexão opcional de até 1.000 caracteres e confirmação explícita da escolha de reiniciar ou manter o contador.
- Exclusão do hábito mantém confirmação e conexão obrigatória. Erros de conexão e gravação são tratados, e o texto da reflexão é preservado após falha.
- O calendário consulta os check-ins do mês visível e do dia escolhido, permite carregar páginas adicionais e identifica a cobertura parcial. Vontades/recaídas mantêm o fuso escolhido; check-ins mantêm a data civil salva. Hoje e o limite de datas acompanham a mudança de dia no fuso escolhido.
- Filtros por tipo, hábito e fuso, hábitos arquivados, vontades, diário, privacidade e exportações continuam disponíveis. As exportações usam os dados reais com os avisos de privacidade existentes.
- Cache, sessões, lembretes e fila SQLite mantêm seus contratos e migrações.

## Fontes, desenhos e responsividade

A paleta fica em [theme.ts](../src/ui/theme.ts). A interface usa Arial/Georgia onde disponíveis; Android usa as fontes nativas `sans-serif` e `serif`. O fundo é sólido e estático. Textos pequenos sobre cartões pastel usam azul-tinta. O tom destrutivo foi escurecido para manter contraste sobre pêssego.

Títulos, botões e cartões crescem com o conteúdo e a interface permite rolagem. Categorias e humores se reorganizam em telas estreitas ou com texto ampliado. A barra inferior reserva altura para as áreas seguras e a escala de fonte. A marca permanece como elemento gráfico, com rótulo acessível; o texto da interface mantém a ampliação do sistema.

[Ilustrações SVG](../assets/illustrations/) contém os 13 desenhos independentes aprovados, mais o sol, o caminho, a sincronização e quatro conquistas extraídos dos grupos vetoriais das telas. Nenhum dado pessoal dos desenhos foi incorporado. A [licença Lucide](../assets/illustrations/LICENCA-LUCIDE.txt) acompanha a origem dos ícones.

Para atualizar os desenhos, edite os SVGs e regenere o módulo estático consumido pelo Metro:

```bash
cd revive-mobile
node scripts/generate-illustrations.mjs
```

Não foram adicionados transformadores SVG ou dependências. Títulos, campos e controles são nativos e separados dos desenhos decorativos.

## Validação e revisão

`npm run validate --prefix revive-mobile` verifica tipos, lint, 43 suítes Jest / 181 testes e os cenários SQLite. A cobertura inclui:

- Troca entre categorias de conquistas, datas distintas e permanência dos marcos após recaída.
- Visão geral/Relatórios, exportações e navegação para Calendário/Conquistas.
- Rascunhos ao alternar seções e isolamento ao trocar de hábito.
- Cancelamento/confirmação das duas opções de recaída, erro com preservação da reflexão e bloqueio de hábitos arquivados.
- Dois registros com a mesma data, abertura do registro e confirmação antes de excluir o hábito.
- Consulta do mês visível, bloqueio do futuro, Hoje e troca de dia em outro fuso.
- Criação de meta com dias e dinheiro combinados, validação de objetivos e exclusão de hábitos arquivados da seleção.
- Suítes existentes de sessão, lembretes, formulários, isolamento de conta, fila offline e diário.

A revisão visual utiliza os componentes reais e a navegação inferior do Expo Router em React Native Web com dados sintéticos e serviços substituídos por dublês. Foram capturadas as 17 composições em 320, 360 e 412 pixels e uma simulação de texto a 150% em 320 pixels. Essa revisão não executa autenticação, armazenamento, notificações ou rede reais do aparelho.

A exportação dos bundles Android e iOS (`expo export --platform android --platform ios`) valida o empacotamento do aplicativo. A homologação em aparelho físico — toque, teclado, fontes do sistema, notificações, biometria e modo avião — será feita separadamente. Não há APK novo anexado a esta alteração.

## Testar a versão atual no Android

Na pasta do repositório, use a branch do PR:

```powershell
git fetch origin
git switch feature/53-mobile-identidade-visual
git pull --ff-only
cd revive-mobile
npm ci
npm run android
```

O comando Android exige o ambiente descrito em [Android local](android-local.md), um aparelho conectado ou emulador e `EXPO_PUBLIC_API_URL` configurada conforme o [README](../README.md). Para gerar um instalador local, siga esse mesmo guia e use `npm run android:apk` com a assinatura já configurada. O APK antigo apontado no README antecede estas telas.
