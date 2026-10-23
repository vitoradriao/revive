import JourneyPreferences from '../components/journey/JourneyPreferences';
import FirstHabitIntroduction from '../components/journey/FirstHabitIntroduction';
import { useOffline } from '../contexts/OfflineContext';
import { resolvePrimary } from '../utils/journeyPreferences';
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, BookOpen, CheckCircle2, Heart, Plus, Repeat, Sparkles, Target } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import RelapseHistory from '../components/modals/RelapseHistory';
import RecaidaModal from '../components/modals/RecaidaModal';
import EmptyState from '../components/ui/EmptyState';
import HeroKpis from '../components/dashboard/HeroKpis';
import ActivityHeatmap from '../components/dashboard/ActivityHeatmap';
import VicioCard from '../components/dashboard/VicioCard';
import RecentTimeline from '../components/dashboard/RecentTimeline';
import QuickCheckIn from '../components/diary/QuickCheckIn';
import Button from '../components/ui/Button';
import { glassSurface } from '../utils/constants';
import { calculateGoalProgress } from '../utils/goalProgress';
import { useProgress } from '../contexts/useProgress';
import ProgressNotice from '../components/dashboard/ProgressNotice';
import { activityDays } from '../utils/progressMetrics';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { preferences } = useOffline();
  const { loading, openNewAddictionWizard } = useUI();
  const {
    motivationalMessage,
    deleteAddiction,
    registerRelapse,
    loadAddictionDetails
  } = useData();

  const [recaidaVicio, setRecaidaVicio] = useState(null);

  const [habitFilter, setHabitFilter] = useState('active');
  const progress = useProgress();
  const visibleHabits = progress.habits.filter(habit => habitFilter === 'archived' ? habit.ativo === false : habit.ativo !== false);
  const addictions = progress.habits.filter(habit => habit.ativo !== false);
  const { habit: primary } = resolvePrimary(preferences, progress.habits);
  const { records: allRecords, relapses, goals } = progress;
  const heatmapData = useMemo(() => activityDays(allRecords, relapses), [allRecords, relapses]);

  const recentActivity = useMemo(() => {
    const events = [];

    allRecords.slice(-5).forEach(r => {
      events.push({
        id: `reg-${r.id}`,
        type: 'registro',
        date: new Date(r.data_registro),
        text: `Registro de humor: ${r.humor}`,
        icon: BookOpen
      });
    });

    relapses.slice(-3).forEach(r => {
      events.push({
        id: `rec-${r.id}`,
        type: 'recaida',
        date: new Date(r.data_recaida),
        text: 'Recaída registrada',
        icon: Repeat
      });
    });

    goals.filter(m => m.concluida).slice(-3).forEach(m => {
      events.push({
        id: `meta-${m.id}`,
        type: 'meta',
        date: new Date(m.data_criacao),
        text: `Meta concluída: ${m.descricao_meta}`,
        icon: Target
      });
    });

    return events.sort((a, b) => b.date - a.date).slice(0, 8);
  }, [allRecords, relapses, goals]);

  const featuredGoals = useMemo(() => goals.slice(0, 3), [goals]);
  const getGoalProgress = (meta) => {
    if (meta.concluida) return 100;
    const vicio = progress.habits.find(item => item.id === meta.vicio_id);
    return calculateGoalProgress(meta, vicio);
  };

  const handleRefletir = (habit, input, intentId) => registerRelapse(habit, input, intentId);
  const handleResetar = (habit, input, intentId) => registerRelapse(habit, input, intentId);


  return (
    <div className="space-y-5">
      <FirstHabitIntroduction />
      <ProgressNotice progress={progress} />
      <RecaidaModal
        isOpen={recaidaVicio !== null}
        onClose={() => setRecaidaVicio(null)}
        vicio={recaidaVicio && (progress.habits.find(habit => habit.id === recaidaVicio.id) || recaidaVicio)}
        onRefletir={handleRefletir}
        onResetar={handleResetar}
        loading={loading}
      />

      <section id="journey-content" tabIndex={-1} className="grid grid-cols-1 xl:grid-cols-[1.25fr_.75fr] gap-5">
        <article className="revive-hero min-h-[430px] p-7 sm:p-10">
          <div className="relative z-[1] min-h-[360px] flex flex-col justify-between gap-10">
            <div className="flex items-center justify-between gap-4">
              <span className="revive-tag">Sua jornada</span>
              <button
                type="button"
                onClick={() => navigate('/analytics')}
                className="revive-round-icon"
                aria-label="Abrir insights"
                title="Abrir insights"
              >
                <ArrowUpRight className="w-6 h-6" />
              </button>
            </div>

            <div>
              <h2 className="max-w-4xl text-[clamp(3rem,7vw,5.75rem)] font-black leading-[0.88] tracking-[-0.085em] text-white">
                Respire, avance, celebre.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-white/60">
                Seu autocuidado organizado como um painel vivo: hábitos, humor, economia, metas e conquistas em uma única narrativa visual.
              </p>
            </div>

            <p className="text-white/80">Principal da Jornada: {primary?.nome_vicio || 'nenhum hábito ativo disponível'}</p>
            <HeroKpis progress={progress} order={preferences?.indicator_order} />
          </div>
        </article>

        <div className="grid gap-5">
          <article className="surface-accent rounded-[34px] p-7 min-h-[220px] flex flex-col justify-between">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow !text-black/50">Mensagem do dia</p>
                <h3 className="mt-4 text-4xl font-black leading-[0.95] tracking-[-0.07em] text-[#121212]">
                  Você não está sozinho.
                </h3>
              </div>
              <Sparkles className="w-7 h-7 text-[#121212]" />
            </div>
            <p className="mt-6 text-base font-bold leading-7 text-black/65">{motivationalMessage}</p>
          </article>

          <ActivityHeatmap heatmapData={heatmapData} />
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[.85fr_1.15fr] gap-5">
        <div id="introduction-checkin" tabIndex={-1}><QuickCheckIn habits={addictions} preferredHabitId={preferences?.intro?.state === 'pending' ? preferences.intro.habit_id : undefined} /></div>

        <article className="surface-dark rounded-[34px] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow !text-white/40">Metas em progresso</p>
              <h3 className="mt-2 text-3xl font-black leading-none tracking-[-0.055em] text-white">
                Marcos que sustentam a evolução
              </h3>
            </div>
            <Button type="button" variant="accent" size="sm" onClick={() => navigate('/metas')}>
              <Plus className="w-4 h-4" />
              Nova meta
            </Button>
          </div>

          <div className="mt-7 grid gap-3">
            {featuredGoals.length > 0 ? featuredGoals.map((meta) => {
              const progress = getGoalProgress(meta);
              return (
                <div key={meta.id} className="rounded-[26px] border border-white/10 bg-white/[0.055] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="font-black text-white">{meta.descricao_meta}</h4>
                      <p className="mt-1 text-sm text-white/45">{meta.concluida ? 'Meta concluída' : 'Em andamento'}</p>
                    </div>
                    <strong className="text-white">{progress}%</strong>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-[26px] border border-white/10 bg-white/[0.055] p-5 text-white/55">
                <CheckCircle2 className="mb-3 w-6 h-6 text-[var(--accent)]" />
                Crie uma meta para acompanhar os próximos marcos.
              </div>
            )}
          </div>
        </article>
      </section>

      <JourneyPreferences habits={progress.habits} />

      <label className="block">Exibir hábitos
        <select className="ml-3 p-2 rounded-xl surface-card" value={habitFilter} onChange={event => setHabitFilter(event.target.value)}>
          <option value="active">Ativos</option>
          <option value="archived">Arquivados</option>
        </select>
      </label>
      {visibleHabits.length === 0 && !loading ? (
        <EmptyState
          icon={Heart}
          title={habitFilter === 'archived' ? 'Nenhum hábito arquivado' : 'Nenhum hábito ativo disponível'}
          description={habitFilter === 'archived' ? 'Seus hábitos arquivados aparecerão aqui. Abra os detalhes para reativar.' : 'Cadastre um hábito para acompanhar uma sequência ativa. O histórico dos arquivados permanece nos relatórios.'}
          action={habitFilter === 'active' ? openNewAddictionWizard : undefined}
          actionLabel="Cadastrar hábito"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
          {visibleHabits.map(vicio => (
            <VicioCard
              key={vicio.id}
              vicio={vicio}
              recaidas={relapses}
              metas={goals}
              onViewDetails={() => {
                loadAddictionDetails(vicio.id);
                navigate(`/vicios/${vicio.id}`);
              }}
              onDelete={() => deleteAddiction(vicio)}
              onRegisterRelapse={() => setRecaidaVicio(vicio)}
            />
          ))}

          <button
            type="button"
            onClick={openNewAddictionWizard}
            className={`${glassSurface} border-dashed border-[var(--line-strong)] rounded-[34px] hover:border-[var(--accent)] hover:bg-black/5 transition p-6 flex flex-col items-center justify-center gap-3 min-h-[300px]`}
          >
            <Plus className="w-12 h-12 text-[var(--accent-strong)]" />
            <span className="text-lg font-black text-muted hover:text-app">Adicionar novo hábito</span>
          </button>
        </div>
      )}

      <RelapseHistory />
      <RecentTimeline recentActivity={recentActivity} />
    </div>
  );
}
