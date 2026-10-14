# Identidade visual v2 — primeira entrega

Referência: pacote fornecido pelo usuário `revive-completo-17-telas-ilustracoes-finais.zip`, direção 02. A implementação usa componentes React Native e dados da conta; os SVGs de tela inteira não são usados como interface.

## Cobertura das referências

| Tela | Implementação nesta entrega |
| --- | --- |
| 01 Jornada | Cabeçalho, pôster do recorde, indicadores e cartões dos hábitos; check-in rápido preservado |
| 02 Hábitos | Cartões ilustrados; acesso a hábitos ativos e arquivados preservado |
| 03 Metas | Notas numeradas em cores alternadas, contadores e ações de concluir/excluir |
| 04 Insights / Visão geral | Indicadores reais, humor, calendário e conquistas |
| 05 Insights / Relatórios | Aba própria com as exportações CSV, JSON e impressão existentes |
| 06 Perfil | Cabeçalho e cartões; lembrete, bloqueio, saída e exclusão preservados |
| 07 Sincronização | Composição ilustrada, carregamento explícito e fila real com ações existentes |
| 08 Novo hábito | Título editorial, ilustração, campos e validação existentes |
| 09 Nova meta | Título editorial, escolha de hábito e objetivos combináveis |
| 10 Detalhe / Check-in | Quatro expressões originais, campos livres e limites; resumo completo preservado |
| 11 Recaída | Herda os controles e cores; composição específica pendente |
| 12 Registros | Herda os controles e cores; composição específica pendente |
| 13 Calendário | Herda a base visual; composição específica pendente |
| 14–17 Conquistas | Quatro categorias selecionáveis, 15 marcos sem duplicação, ilustrações e estados explícitos |

As composições secundárias e a densidade do detalhe do hábito precisam de uma próxima revisão. Edição/arquivamento, vontades, diário e avisos de cobertura continuam disponíveis, mesmo quando não constam dos desenhos de referência.

## Regras preservadas

- Recorde histórico, sequência atual e economia acumulada mantêm as definições do domínio. A economia continua identificada como estimativa.
- Estados de cobertura incompleta e operações pendentes continuam explícitos. Valores desconhecidos não viram zero.
- Conquistas dependem de marcos permanentes registrados; uma recaída não remove uma conquista. Os marcos conquistados recebem check e texto e dispensam a barra repetida. Os próximos marcos mantêm progresso proporcional limitado a 100%.
- **Divergência da referência:** o código atual conta **dias distintos com check-in**, inclusive para conquistas de registros. Dois registros no mesmo dia contam como um dia. Esta entrega preserva essa regra e seus testes.
- Os humores começam sem seleção; o texto livre continua permitido. Rótulos e estado de seleção ficam nos controles, não nos desenhos.
- Exportações usam o snapshot real, com os avisos de privacidade existentes. Exclusão e recaída mantêm as confirmações existentes.
- Cache, sessões, lembretes e fila SQLite não foram migrados nesta alteração.

## Fontes e desenhos

A paleta fica em [theme.ts](../src/ui/theme.ts). A interface usa Arial/Georgia onde disponíveis; Android usa as fontes nativas `sans-serif` e `serif`, sem downloads adicionais. O fundo é sólido e estático. Textos pequenos sobre cartões pastel usam azul-tinta para manter a leitura.

[Ilustrações SVG](../assets/illustrations/) contém os 13 desenhos independentes aprovados, mais o sol, o caminho, a sincronização e quatro conquistas extraídos dos grupos vetoriais das telas. Nenhum dado pessoal dos desenhos foi incorporado. A [licença Lucide](../assets/illustrations/LICENCA-LUCIDE.txt) acompanha a origem dos ícones.

Para atualizar os desenhos, edite os SVGs e regenere o módulo estático consumido pelo Metro:

```bash
cd revive-mobile
node scripts/generate-illustrations.mjs
```

Não é necessário instalar transformadores SVG ou novas dependências. Os textos de título e os controles continuam nativos, separados das ilustrações decorativas.

## Validação

`npm run validate --prefix revive-mobile` executa tipos, lint, testes Jest e verificações SQLite. Os testes de tela cobrem a navegação entre as quatro categorias, os dias distintos, a permanência de conquistas após recaída, a troca Visão geral/Relatórios, as três exportações e os destinos Calendário/Conquistas. As suítes existentes também verificam check-in, formulários, lembretes, isolamento de conta, fila e diário.

Nesta entrega passaram as verificações de tipos, lint, 40 suítes Jest (171 testes) e os cenários SQLite. Também foi exportado o bundle Android com `expo export --platform android`.

Foi revisada uma prévia isolada dos componentes em React Native Web, com dados sintéticos, nas larguras de 320 e 360 pixels. A captura das abas principais, formulários, sincronização, relatórios e quatro categorias de conquistas não registrou erros JavaScript ou transbordamento horizontal do documento. Essa prévia substitui os serviços nativos por dublês e não valida a navegação nativa ou integrações reais.

A validação em Android/iOS real, incluindo fontes, teclado, ampliação de texto e áreas seguras da navegação, continua pendente. Não foi gerado um novo APK nesta entrega.
