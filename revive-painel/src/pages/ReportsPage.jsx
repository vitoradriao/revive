/**
 * @file ReportsPage.jsx
 * @description Pagina de relatorios da aplicacao REVIVE.
 *
 * Permite ao usuario visualizar estatisticas filtradas por periodo
 * (7, 30 ou 90 dias): total de registros, economia, recaidas, metas concluidas
 * e distribuicao de humor. Inclui funcionalidade de exportacao em CSV
 * e impressao/PDF.
 *
 * @component
 * @see {@link useData} Hook para acessar dados globais
 */
import React, { useState, useMemo } from 'react';
import { motion as Motion } from 'framer-motion';
import { Download, Printer, Calendar, Heart, BookOpen, Repeat } from 'lucide-react';
import { useProgress } from '../contexts/useProgress';
import ProgressNotice from '../components/dashboard/ProgressNotice';
import HeroKpis from '../components/dashboard/HeroKpis';
import HabitProgress from '../components/dashboard/HabitProgress';
import { distinctCheckinDays, recordsInPeriod } from '../utils/progressMetrics';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import { glassSurface, screenTransition, moodColors } from '../utils/constants';

/**
 * Componente da pagina de Relatorios.
 *
 * Gerencia estado local 'periodo' (7, 30 ou 90 dias) para filtrar dados.
 * Calcula contagens dos dados disponíveis por período via useMemo.
 * Oferece exportacao CSV com geracao de Blob e download programatico.
 *
 * @returns {JSX.Element} Pagina de relatorios com filtros, estatisticas e acoes de exportacao
 */
export default function ReportsPage() {
  const progress = useProgress();
  const { habits: addictions, records: allRecords, relapses } = progress;
  const [periodo, setPeriodo] = useState(30);

  const stats = useMemo(() => {
    const periodRecords = recordsInPeriod(allRecords, 'data_registro', periodo);
    const periodRelapses = recordsInPeriod(relapses, 'data_recaida', periodo);
    const humorCount = {};
    periodRecords.forEach(r => {
      if (r.humor) humorCount[r.humor] = (humorCount[r.humor] || 0) + 1;
    });

    return {
      totalRegistros: periodRecords.length,
      totalRecaidas: periodRelapses.length,
      checkinDays: distinctCheckinDays(periodRecords),
      activeCount: progress.activeCount,
      humorDistribuicao: Object.entries(humorCount).sort((a, b) => b[1] - a[1]),
    };
  }, [periodo, allRecords, relapses, progress.activeCount]);

  /**
   * Exporta registros do periodo como arquivo CSV.
   * Cria um Blob com dados separados por virgula, gera URL temporaria
   * e dispara download automatico via elemento <a> programatico.
   * Complexidade: O(n) onde n = registros no periodo.
   */
  const exportCSV = () => {
    const headers = ['Data', 'Vício ID', 'Humor', 'Gatilhos', 'Conquistas', 'Observações', 'Cobertura', 'Consolidado em', 'Período (dias)', 'Pendências locais excluídas'];
    const rows = recordsInPeriod(allRecords, 'data_registro', periodo)
      .map(r => [r.data_registro, r.vicio_id, r.humor || '', r.gatilhos || '', r.conquistas || '', r.observacoes || '', progress.scope, progress.updatedAt || '', periodo, progress.pendingCount]);

    const escapeCell = value => `"${String(value ?? '').replace(/^[\s]*[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map(row => row.map(escapeCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revive-relatorio-${periodo}dias.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Motion.div {...screenTransition} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <PageHeader
          eyebrow="Exportação"
          title="Relatórios"
          description="Filtre períodos, visualize distribuição de humor e exporte seus registros."
        />
        <div className="flex gap-2">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setPeriodo(d)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition border ${
                periodo === d
                  ? 'bg-teal-400 text-slate-950 border-teal-200'
                  : 'text-muted border-slate-700/60 hover:text-app hover:bg-white/5'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <ProgressNotice progress={progress} />
      <HeroKpis progress={progress} />
      <p className="text-sm text-muted">Registros, presença, humor e recaídas: últimos {periodo} dias, incluindo hoje (UTC). Economias e sequências: snapshot consolidado, sem recorte pelo filtro.</p>

      {/* Resumo do período */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={`${glassSurface} rounded-2xl p-5 text-center`}>
          <Calendar className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-app">{progress.available ? stats.totalRegistros : 'Indisponível'}</p>
          <p className="text-xs text-muted">Registros disponíveis</p>
        </div>
        <div className={`${glassSurface} rounded-2xl p-5 text-center`}>
          <BookOpen className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-app">{progress.available ? stats.checkinDays : 'Indisponível'}</p>
          <p className="text-xs text-muted">Dias com check-in disponíveis</p>
        </div>
        <div className={`${glassSurface} rounded-2xl p-5 text-center`}>
          <Repeat className="w-6 h-6 text-rose-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-app">{progress.available ? stats.totalRecaidas : 'Indisponível'}</p>
          <p className="text-xs text-muted">Recaídas disponíveis</p>
        </div>
        <div className={`${glassSurface} rounded-2xl p-5 text-center`}>
          <Heart className="w-6 h-6 text-amber-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-app">{progress.available ? stats.activeCount : 'Indisponível'}</p>
          <p className="text-xs text-muted">Hábitos ativos disponíveis (snapshot)</p>
        </div>
      </div>

      {/* Mood Distribution */}
      <Card title={`Distribuição de humor (${periodo} dias)`}>
        {stats.humorDistribuicao.length > 0 ? (
          <div className="space-y-3">
            {stats.humorDistribuicao.map(([humor, count]) => {
              const total = stats.totalRegistros || 1;
              const pct = (count / total) * 100;
              return (
                <div key={humor} className="flex items-center gap-3">
                  <span className="text-sm text-white/70 capitalize w-20">{humor}</span>
                  <div className="flex-1 bg-slate-700/40 rounded-full h-2">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: moodColors[humor] || '#6b7280' }} />
                  </div>
                  <span className="text-sm text-white/50 w-12 text-right">{Math.round(pct)}%</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted text-center py-6">Nenhum dado de humor no período.</p>
        )}
      </Card>

      {/* Vicios Summary */}
      <Card title="Resumo por hábito (snapshot, incluindo arquivados)">
        <div className="space-y-3">
          {addictions.length === 0 && <p className="text-muted">Nenhum hábito disponível nesta cópia.</p>}
          {addictions.map(v => (
            <div key={v.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
              <div>
                <p className="font-semibold text-app">{v.nome_vicio} {v.ativo === false ? '(Arquivado)' : ''}</p>
                <HabitProgress habit={v} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Export Actions */}
      <div className="flex gap-4">
        <Button
          onClick={exportCSV}
          disabled={!progress.available || progress.loading}
          variant="secondary"
          size="lg"
        >
          <Download className="w-5 h-5" />
          Exportar registros disponíveis em CSV
        </Button>
        <Button
          onClick={() => window.print()}
          variant="secondary"
          size="lg"
        >
          <Printer className="w-5 h-5" />
          Imprimir / PDF
        </Button>
      </div>
    </Motion.div>
  );
}
