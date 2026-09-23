/**
 * @file AnalyticsPage.jsx
 * @description Pagina de analises gerais (Analytics) da aplicacao REVIVE.
 *
 * Apresenta painel analitico completo com KPIs (vicios ativos, total economizado,
 * metas concluidas, taxa de recaida), grafico donut de distribuicao de humor,
 * tempo medio entre recaidas, top 5 gatilhos correlacionados, conquistas
 * recentes e insights/recomendacoes automaticas baseadas nos dados.
 *
 * Faz uso intensivo de useMemo para derivar metricas a partir dos dados brutos.
 * Todas as transformacoes sao documentadas com sua complexidade algoritmica.
 *
 * @component
 * @see {@link useData} Hook para acessar dados globais (vicios, metas, registros, recaidas)
 * @see {@link DonutChart} Componente de grafico donut para distribuicao de humor
 * @see {@link KpiCard} Componente de card de KPI com indicador de tendencia
 */
import React, { useMemo } from 'react';
import { motion as Motion } from 'framer-motion';
import { Heart, DollarSign, CheckCircle, Repeat, Clock, Flame, AlertCircle, BookOpen, Star } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import Card from '../components/ui/Card';
import KpiCard from '../components/ui/KpiCard';
import DonutChart from '../components/ui/DonutChart';
import PageHeader from '../components/ui/PageHeader';
import { moodColors, screenTransition } from '../utils/constants';
import { MS_PER_DAY } from '../utils/formatters';

/**
 * Componente da pagina de Analytics.
 *
 * Calcula diversas metricas derivadas com useMemo:
 * - totalEconomizado: soma de valores economizados
 * - viciosAtivos: contagem de vicios
 * - metasConcluidas: contagem de metas finalizadas
 * - diasUltimoRegistro: tempo desde o ultimo registro
 * - taxaRecaida: porcentagem de recaidas por dia medio
 * - tendenciaRecaidas: variacao percentual entre ultimos 30 e 60 dias
 * - conquistasRecentes: ultimas 5 conquistas registradas
 * - dadosHumor: distribuicao de humor (ultimos 30 dias) para grafico donut
 * - tempoMedioRecaidas: media de dias entre recaidas consecutivas
 * - topGatilhosRecaidas: top 5 gatilhos que precedem recaidas
 *
 * @returns {JSX.Element} Pagina de analises com KPIs, graficos e insights
 */
export default function AnalyticsPage() {
  const { addictions, goals, allRecords, relapses } = useData();

  // Soma dos valores economizados de todos os vicios - O(n)
  const totalEconomizado = useMemo(() =>
    addictions.reduce((acc, v) => acc + (Number(v.valor_economizado) || 0), 0),
    [addictions]
  );

  // Numero de vicios ativos (equivale ao tamanho do array) - O(1)
  const viciosAtivos = useMemo(() => addictions.length, [addictions]);

  // Conta metas com flag concluida=true - O(n) onde n = total de metas
  const metasConcluidas = useMemo(() =>
    goals.filter(meta => meta.concluida).length,
    [goals]
  );

  /**
   * Calcula ha quantos dias foi feito o ultimo registro.
   * Retorna string formatada ('Hoje', '3d atras', etc.) ou '-' se nao houver registros.
   * Complexidade: O(1) - acessa apenas o ultimo elemento do array ordenado.
   */
  const diasUltimoRegistro = useMemo(() => {
    if (allRecords.length === 0) return '-';
    const ultimaData = new Date(allRecords[allRecords.length - 1].data_registro);
    const hoje = new Date();
    const diff = Math.floor((hoje - ultimaData) / MS_PER_DAY);
    return diff === 0 ? 'Hoje' : `${diff}d atras`;
  }, [allRecords]);

  /**
   * Calcula taxa de recaida como porcentagem de recaidas por dia medio de acompanhamento.
   * Formula: (total_recaidas / media_dias_acompanhamento) * 100
   * Complexidade: O(n) onde n = numero de vicios.
   */
  const taxaRecaida = useMemo(() => {
    if (relapses.length === 0) return '0%';
    if (addictions.length === 0) return '0%';
    const diasMedia = addictions.reduce((acc, v) => {
      const inicio = new Date(v.data_inicio);
      const dias = Math.ceil((new Date() - inicio) / MS_PER_DAY) || 1;
      return acc + dias;
    }, 0) / addictions.length;
    const taxa = (relapses.length / diasMedia) * 100;
    return `${taxa.toFixed(1)}%`;
  }, [relapses, addictions]);

  /**
   * Calcula variacao percentual de recaidas entre os ultimos 30 e 60 dias.
   * Valor positivo = aumento de recaidas; negativo = diminuicao.
   * Complexidade: O(n) onde n = total de recaidas.
   */
  const tendenciaRecaidas = useMemo(() => {
    const agora = new Date();
    const _30dias = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const _60dias = new Date(agora.getTime() - 60 * 24 * 60 * 60 * 1000);

    const recaidas30 = relapses.filter(r => new Date(r.data_recaida) >= _30dias).length;
    const recaidas60 = relapses.filter(r => new Date(r.data_recaida) >= _60dias && new Date(r.data_recaida) < _30dias).length;

    if (recaidas60 === 0) return 0;
    return ((recaidas30 - recaidas60) / recaidas60) * 100;
  }, [relapses]);

  /**
   * Extrai as 5 conquistas mais recentes dos registros que possuem o campo 'conquistas'.
   * Ordena por data decrescente.
   * Complexidade: O(n*log(n)) devido a ordenacao, onde n = registros com conquistas.
   */
  const conquistasRecentes = useMemo(() => {
    return allRecords
      .filter(r => r.conquistas && r.conquistas.trim() !== '')
      .sort((a, b) => new Date(b.data_registro) - new Date(a.data_registro))
      .slice(0, 5)
      .map((r, index) => ({
        id: r.id || index,
        data: new Date(r.data_registro),
        descricao: r.conquistas
      }));
  }, [allRecords]);

  /**
   * Agrega a distribuicao de humor dos ultimos 30 dias para alimentar o grafico donut.
   * Usa um objeto como mapa de contagem (reduce com acumulador).
   * Complexidade: O(n) onde n = total de registros.
   * @type {Array<{label: string, value: number, cor: string}>}
   */
  const dadosHumor = useMemo(() => {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 30);

    const contagem = allRecords
      .filter(r => new Date(r.data_registro) >= dataLimite)
      .reduce((acc, reg) => {
        if (reg.humor) acc[reg.humor] = (acc[reg.humor] || 0) + 1;
        return acc;
      }, {});

    return Object.entries(contagem).map(([label, value]) => ({
      label, value, cor: moodColors[label] || '#6b7280'
    }));
  }, [allRecords]);

  /**
   * Calcula o tempo medio (em dias) entre recaidas consecutivas por vicio.
   * Agrupa recaidas por vicio, ordena por data e calcula diferencas entre pares consecutivos.
   * Complexidade: O(n*log(n)) onde n = total de recaidas (devido a ordenacao por vicio).
   */
  const tempoMedioRecaidas = useMemo(() => {
    if (relapses.length < 2) return 'N/A';

    const porVicio = relapses.reduce((acc, r) => {
      if (!acc[r.vicio_id]) acc[r.vicio_id] = [];
      acc[r.vicio_id].push(new Date(r.data_recaida));
      return acc;
    }, {});

    const mediasGerais = [];
    for (const vicioId in porVicio) {
      const datas = porVicio[vicioId].sort((a, b) => a - b);
      if (datas.length < 2) continue;
      for (let i = 1; i < datas.length; i++) {
        const diffDias = (datas[i] - datas[i - 1]) / MS_PER_DAY;
        mediasGerais.push(diffDias);
      }
    }

    if (mediasGerais.length === 0) return 'N/A';
    const mediaFinal = mediasGerais.reduce((a, b) => a + b, 0) / mediasGerais.length;
    return `${mediaFinal.toFixed(1)} dias`;
  }, [relapses]);

  /**
   * Identifica os top 5 gatilhos que mais aparecem nos registros ate 2 dias antes de recaidas.
   * Correlaciona registros de humor/gatilhos com datas de recaida usando janela temporal.
   * Complexidade: O(r * n) onde r = recaidas e n = registros.
   * @type {Array<[string, number]>} Array de tuplas [gatilho, frequencia]
   */
  const topGatilhosRecaidas = useMemo(() => {
    if (!relapses.length || !allRecords.length) return [];

    const contagemGatilhos = {};
    relapses.forEach(recaida => {
      const dataRecaida = new Date(recaida.data_recaida);
      const dataLimite = new Date(dataRecaida);
      dataLimite.setDate(dataRecaida.getDate() - 2);

      allRecords
        .filter(r => r.vicio_id === recaida.vicio_id && new Date(r.data_registro) >= dataLimite && new Date(r.data_registro) < dataRecaida)
        .forEach(r => {
          if (!r.gatilhos) return;
          r.gatilhos.split(',').map(g => g.trim().toLowerCase()).filter(Boolean).forEach(g => {
            contagemGatilhos[g] = (contagemGatilhos[g] || 0) + 1;
          });
        });
    });
    return Object.entries(contagemGatilhos).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [allRecords, relapses]);

  return (
    <Motion.div {...screenTransition} className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title="Painel de análises gerais"
        description="Identifique padrões de humor, recaídas, economia e consistência para tomar decisões melhores."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard icon={<Heart className="text-emerald-400 w-8 h-8" />} title="Vícios ativos" value={viciosAtivos} border="emerald" />
        <KpiCard icon={<DollarSign className="text-cyan-400 w-8 h-8" />} title="Total Economizado" value={`R$ ${totalEconomizado.toFixed(2)}`} border="cyan" />
        <KpiCard icon={<CheckCircle className="text-yellow-400 w-8 h-8" />} title="Metas concluídas" value={metasConcluidas} border="yellow" />
        <KpiCard icon={<Repeat className="text-red-400 w-8 h-8" />} title="Taxa de recaída" value={taxaRecaida} trend={tendenciaRecaidas} border="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Distribuição de humor (últimos 30 dias)"><DonutChart data={dadosHumor} /></Card>
        <div className="space-y-6">
          <Card title="Último registro">
            <div className="flex items-center justify-center h-full">
              <p className="text-4xl font-bold text-[#7CF6C4] flex items-center gap-3">
                <Clock className="w-8 h-8" />
                {diasUltimoRegistro}
              </p>
            </div>
          </Card>
          <Card title="Tempo médio entre recaídas">
            <div className="flex items-center justify-center h-full">
              <p className="text-3xl font-bold text-purple-300 flex items-center gap-3">
                <Flame className="w-6 h-6" />
                {tempoMedioRecaidas}
              </p>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Top 5 gatilhos correlacionados com recaídas">
          {topGatilhosRecaidas.length > 0 ? (
            <ul className="space-y-2">
              {topGatilhosRecaidas.map(([gatilho, freq], index) => (
                <li key={index} className="flex items-center justify-between text-app surface-muted p-3 rounded-xl">
                  <span className="capitalize flex items-center gap-2"><Flame className="w-4 h-4 text-red-400" />{gatilho}</span>
                  <span className="text-sm text-muted">{freq} ocorrências</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-muted flex items-center justify-center h-full">Nenhuma correlação de gatilho encontrada.</p>}
        </Card>

        <Card title="Conquistas Recentes">
          <div className="space-y-3 max-h-[240px] overflow-y-auto pr-2">
            {conquistasRecentes.length > 0 ? conquistasRecentes.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3 surface-muted rounded-xl">
                <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Star className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-app">{item.descricao}</p>
                  <p className="text-xs text-muted">{item.data.toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
            )) : <p className="text-muted flex items-center justify-center h-full">Nenhuma conquista registrada recentemente.</p>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card title="Insights e recomendações">
          <div className="space-y-3">
            {diasUltimoRegistro !== '-' && !diasUltimoRegistro.includes('Hoje') && (
              <div className="insight-card insight-warning flex items-start gap-3 p-4 bg-yellow-500/20 border border-yellow-400/30 rounded-lg">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Aumente seu Engajamento</p>
                  <p className="text-sm">Você não registra há {diasUltimoRegistro}. Reflexões diárias fortalecem a recuperação!</p>
                </div>
              </div>
            )}
            {tendenciaRecaidas > 0 && (
              <div className="insight-card insight-danger flex items-start gap-3 p-4 bg-red-500/20 border border-red-400/30 rounded-lg">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Aumento de Risco Detectado</p>
                  <p className="text-sm">Recaídas aumentaram {tendenciaRecaidas.toFixed(0)}% nos últimos 30 dias. Identifique gatilhos e procure apoio.</p>
                </div>
              </div>
            )}
            {tendenciaRecaidas < 0 && relapses.length > 0 && (
              <div className="insight-card insight-success flex items-start gap-3 p-4 bg-emerald-500/20 border border-emerald-400/30 rounded-lg">
                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Você está melhorando!</p>
                  <p className="text-sm">Recaídas diminuíram {Math.abs(tendenciaRecaidas).toFixed(0)}% nos últimos 30 dias. Continue assim!</p>
                </div>
              </div>
            )}
            {topGatilhosRecaidas.length > 0 && (
              <div className="insight-card insight-info flex items-start gap-3 p-4 bg-blue-500/20 border border-blue-400/30 rounded-lg">
                <BookOpen className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Foco em Gatilhos</p>
                  <p className="text-sm">O gatilho "{topGatilhosRecaidas[0][0]}" aparece antes de recaídas. Desenvolva estratégias para lidar com isso.</p>
                </div>
              </div>
            )}
            {addictions.length > 0 && (
              <div className="insight-card insight-journey flex items-start gap-3 p-4 bg-purple-500/20 border border-purple-400/30 rounded-lg">
                <Heart className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Sua Jornada</p>
                  <p className="text-sm">Você já investiu <strong>R$ {totalEconomizado.toFixed(2)}</strong> em sua saúde. Cada dia é uma vitória!</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </Motion.div>
  );
}
