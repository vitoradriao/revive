import React from 'react';
import { motion as Motion } from 'framer-motion';
import { useProgress } from '../contexts/useProgress';
import Card from '../components/ui/Card';
import KpiCard from '../components/ui/KpiCard';
import DonutChart from '../components/ui/DonutChart';
import PageHeader from '../components/ui/PageHeader';
import HeroKpis from '../components/dashboard/HeroKpis';
import ProgressNotice from '../components/dashboard/ProgressNotice';
import { moodColors, screenTransition } from '../utils/constants';
import { distinctCheckinDays, recordsInPeriod, milestoneCategoryLabel, milestoneOriginLabel, coverageLabel } from '../utils/progressMetrics';

export default function AnalyticsPage() {
    const progress = useProgress();
    const records = recordsInPeriod(progress.records, 'data_registro', 30);
    const relapses = recordsInPeriod(progress.relapses, 'data_recaida', 30);
    const moods = new Map();
    records.forEach(record => { if (record.humor) moods.set(record.humor, (moods.get(record.humor) || 0) + 1); });
    const moodData = [...moods].map(([label, value]) => ({ label, value, cor: moodColors[label] || '#6b7280' }));
    const awards = [...(progress.awards || [])].sort((a, b) => new Date(b.awarded_at) - new Date(a.awarded_at)).slice(0, 5);
    return (
        <Motion.div {...screenTransition} className="space-y-6">
            <PageHeader eyebrow="Histórico" title="Painel de análises gerais" description="Contagens descritivas dos dados consolidados disponíveis, incluindo hábitos arquivados no histórico." />
            <ProgressNotice progress={progress} />
            <HeroKpis progress={progress} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard title="Hábitos ativos disponíveis" value={progress.available ? progress.activeCount : 'Indisponível'} />
                <KpiCard title="Metas concluídas disponíveis (todo o período)" value={progress.available ? progress.completedGoals : 'Indisponível'} />
                <KpiCard title="Recaídas disponíveis (últimos 30 dias)" value={progress.available ? relapses.length : 'Indisponível'} />
                <KpiCard title="Dias com check-in disponíveis (últimos 30 dias)" value={progress.available ? distinctCheckinDays(records) : 'Indisponível'} />
            </div>
            <Card title="Distribuição de humor nos registros disponíveis (últimos 30 dias)"><DonutChart data={moodData} /></Card>
            <Card title="Conquistas permanentes recentes disponíveis">
                {awards.length ? <ul className="space-y-3">{awards.map(award => <li key={award.id} className="surface-muted rounded-xl p-3">
                    <p>{award.valor_alvo} {milestoneCategoryLabel(award.categoria)}</p>
                    <p className="text-sm text-muted">{new Date(award.awarded_at).toLocaleDateString('pt-BR')} · {milestoneOriginLabel(award.origem)} · {coverageLabel(award.cobertura)}</p>
                </li>)}</ul> : <p className="text-muted">Nenhuma conquista permanente disponível nesta cópia.</p>}
            </Card>
            <p className="text-sm text-muted">As contagens descrevem registros disponíveis. Não indicam risco nem melhora clínica; lacunas no histórico não confirmam ausência de eventos.</p>
        </Motion.div>
    );
}
