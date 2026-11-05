# Descoberta: "tempo recuperado" — preparação da pesquisa

Preparação da [#69](https://github.com/vitoradriao/revive/issues/69), vinculada ao [roadmap #10](https://github.com/vitoradriao/revive/issues/10). Este documento **não encerra a descoberta**: não há pesquisa realizada, participantes recrutados nem decisão. Enquanto não houver rodada autorizada, a decisão permanece **pendente**.

## Estado desta preparação

| Item | Estado |
| --- | --- |
| Roteiro, hipóteses e critérios | Propostos neste documento, aguardando revisão de quem responde pelo produto |
| Protótipo de apresentação | Descrito em texto abaixo; protótipo visual ainda não criado |
| Recrutamento e contato com pessoas | **Não iniciado.** Exige autorização específica; nenhum convite foi ou será enviado a partir desta preparação |
| Rodada com 5–8 participantes | **Não executada** |
| Síntese e decisão (implementar, revisar ou descartar) | **Pendente** |

Não há mudança de produção: nenhum contador, migration, campo, endpoint ou tela. A descoberta não bloqueia a liberação das demais melhorias nem autoriza implementação automática.

## O que existe hoje

Os indicadores atuais trabalham com dias e economia estimada, com cobertura explícita (confirmada, inferida ou desconhecida), por exemplo em [progress-metrics.js](../progress-metrics.js), [metrics.ts](../revive-mobile/src/domain/metrics.ts) e [DashboardPage.jsx](../revive-painel/src/pages/DashboardPage.jsx). A economia deriva de um valor diário informado pela pessoa no cadastro do hábito. Unidade, fórmula e vigência dessa economia **não devem ser copiadas automaticamente** para tempo: a pergunta da descoberta é se a ideia faz sentido para o público, não como calculá-la.

## Perguntas da descoberta

1. Estimar "tempo que o hábito consumia por dia" é algo que as pessoas conseguem e querem informar?
2. O indicador é útil para quem está acompanhando um hábito, comparado a dias e à economia estimada?
3. A apresentação é compreendida sem sugerir medição real ou eficácia clínica?
4. Qual unidade, vigência e tratamento de lacunas e de dados anteriores seriam adequados?

## Hipóteses e critérios (propostos)

Os limiares abaixo são **propostas** para validar antes da rodada. Devem ser confirmados ou ajustados antes de qualquer contato com participantes, para não ajustá-los depois de ver os resultados.

| Id | Hipótese | Evidência que a sustenta | Evidência que a enfraquece |
| --- | --- | --- | --- |
| H1 | A maioria consegue dar uma estimativa diária sem esforço excessivo | Estimam em poucos instantes e aceitam ver o número usado | Recusam, dizem não saber ou inventam um valor só para continuar |
| H2 | A maioria entende que o valor é uma estimativa informada por ela, não uma medição | Explicam com as próprias palavras que o número vem do que informaram | Tratam como medição real, ganho comprovado ou resultado de saúde |
| H3 | O indicador agrega valor além de dias e economia | Citam ao menos uma situação em que o usaria e o preferem a, ou acrescentam a, dias/economia | Consideram redundante, indiferente ou desmotivador |
| H4 | Uma unidade (por exemplo horas acumuladas) é compreensível | Interpretam corretamente exemplos de 3 apresentações diferentes | Interpretações divergentes ou incorretas, inclusive em apresentações simples |
| H5 | Reduzir ou editar a estimativa, ou ter lacunas no histórico, não gera confusão nem culpa | Aceitam o aviso de cobertura e entendem o que muda ao editar | Interpretam lacuna como falha, ou o número como "dívida" ou punição |

Critério de decisão proposto, a confirmar antes da rodada:

- **Implementar**: H1, H2 e H3 sustentadas pela maioria dos participantes, sem sinal recorrente de dano (culpa, confusão com medição clínica).
- **Revisar**: utilidade percebida, mas H2 ou H4 falham; reapresentar com mudança de texto, unidade ou vigência e repetir uma rodada curta.
- **Descartar**: utilidade percebida baixa ou sinais recorrentes de dano ou de interpretação como medição real.
- Com 5–8 pessoas a evidência é **exploratória**: serve para decidir se vale investir, não para estimar proporções na população.

## Participantes

- Público pretendido: pessoas que acompanham ou querem acompanhar um hábito que desejam reduzir ou interromper e que usam, ou usariam, um app de acompanhamento. Quem responde pelo produto confirma o recorte.
- Meta: 5 a 8 pessoas, contato apenas com autorização específica de quem responde pelo produto, com consentimento informado de cada participante.
- Não incluir pessoas em crise ou em momento delicado. Oferecer pausa e saída a qualquer momento, sem justificativa.
- Fora do escopo: apoio imediato, planos de enfrentamento e qualquer promessa de efeito terapêutico.

## Roteiro da sessão (30 a 40 minutos)

1. **Abertura (3 min):** objetivo da conversa, participação voluntária, possibilidade de parar a qualquer momento, como os dados serão tratados (sem nome, sem gravação sem consentimento).
2. **Contexto (5 min):** como a pessoa acompanha o hábito hoje; o que olha para saber se está indo bem.
3. **Indicadores atuais (5 min):** mostrar dias e economia estimada; perguntar o que cada um significa para ela e o que não significa.
4. **Estimativa (7 min):** pedir que informe, para um hábito ficcional ou próprio, quanto tempo ele consumia por dia; observar hesitação, dúvida e a forma de estimar (H1).
5. **Apresentações do indicador (10 min):** mostrar 3 variações, em ordem alternada entre participantes, e perguntar o que cada uma significa, se parece medição e se a pessoa a usaria (H2, H3, H4).
6. **Edição e lacunas (5 min):** simular mudar a estimativa e um período sem registros; observar a reação (H5).
7. **Encerramento (3 min):** o que a pessoa levaria, o que removeria, alguma preocupação.

Perguntas devem ser abertas e neutras; evitar induzir ("não acha útil?") e não corrigir a interpretação da pessoa durante a sessão.

## Protótipo (descrição)

Três apresentações do mesmo dado, todas rotuladas como **estimativa informada por você**, sem linguagem de medição real, eficácia clínica ou ganho garantido:

- **A. Horas acumuladas:** "Pelas suas estimativas, cerca de N horas que esse hábito ocuparia."
- **B. Equivalente diário:** "Cerca de X min por dia que você estimou."
- **C. Comparação com dias:** o mesmo bloco ao lado de "N dias com check-in" e da economia estimada.

Cada variação inclui o aviso de cobertura (dias sem registro e período coberto) e a forma de editar a estimativa. Dados do protótipo são fictícios e nunca usam dados reais de contas.

## Registro e síntese (sem dados pessoais)

Para cada participante, um registro anonimizado (código P1, P2, ...; sem nome, e-mail, contato, local ou trechos identificáveis):

| Campo | Conteúdo |
| --- | --- |
| Perfil resumido | Faixa de experiência com apps de acompanhamento, sem dados identificáveis |
| H1–H5 | Sustentada, enfraquecida ou inconclusiva, com citação curta anonimizada |
| Sinais de risco | Culpa, confusão com medição, desconforto, se houver |
| Observações | Dúvidas de texto, unidade ou vigência |

A síntese separa **achados observados** de **suposições** e registra os limites (amostra pequena, recrutamento). Não registrar gravações, nomes ou contatos neste repositório.

## Piloto sintético

Uma leitura do roteiro por quem prepara a pesquisa, ou com dados fictícios, serve só para checar clareza do roteiro e do protótipo. **Não conta como pesquisa real** e não pode ser usado para decidir.

## Critérios de aceite da #69 e situação

- [ ] Roteiro, protótipo, hipóteses e critério disponíveis: roteiro, hipóteses e critérios propostos aqui; protótipo visual ainda pendente.
- [ ] Rodada autorizada com 5–8 participantes e síntese anonimizada: **pendente**.
- [ ] Decisão que fundamenta utilidade, compreensão e limites: **pendente**.
- [x] Sem pesquisa realizada, a decisão permanece pendente e a preparação não encerra a issue.
- [x] Sem mudança de produção, contato sem autorização ou resultados inventados.
