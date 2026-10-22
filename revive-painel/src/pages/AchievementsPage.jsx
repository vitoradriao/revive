import React from 'react';
import { motion as Motion } from 'framer-motion';
import { Trophy, Flame, DollarSign, Target, BookOpen, Lock } from 'lucide-react';
import { useProgress } from '../contexts/useProgress';
import ProgressNotice from '../components/dashboard/ProgressNotice';
import { coverageLabel, milestoneOriginLabel } from '../utils/progressMetrics';
import PageHeader from '../components/ui/PageHeader';
import { glassSurface, screenTransition, badgeDefinitions, staggerContainer, staggerItem } from '../utils/constants';

/** @type {Object.<string, React.Component>} Mapa de nomes de icone para componentes Lucide */
const iconMap = { Flame, DollarSign, Target, BookOpen };

export default function AchievementsPage() {
  const history = useProgress();
  const progress = history.badges;
  const earnedBadges = new Set(progress.filter(badge => badge.earned).map(badge => badge.id));

  const categories = [
    { id: 'streak', label: 'Sequência', icon: Flame },
    { id: 'savings', label: 'Economia', icon: DollarSign },
    { id: 'goals', label: 'Metas', icon: Target },
    { id: 'consistency', label: 'Presença', icon: BookOpen },
  ];

  return (
    <Motion.div {...screenTransition} className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          eyebrow="Histórico permanente"
          title="Conquistas"
          description="Conquistas registradas permanecem após reiniciar uma sequência ou arquivar um hábito."
        />
        <div className={`${glassSurface} rounded-2xl px-4 py-2 flex items-center gap-2`}>
          <Trophy className="w-5 h-5 text-amber-400" />
          <span className="text-lg font-bold text-app">{history.awards === undefined ? 'Indisponível' : earnedBadges.size}</span>
          <span className="text-muted text-sm">/ {badgeDefinitions.length}</span>
        </div>
      </div>

      <ProgressNotice progress={history} />
      {history.awards === undefined && <p className="text-muted">Histórico legado: conquistas permanentes indisponíveis nesta cópia.</p>}
      {/* Resumo dos marcos disponíveis */}
      <div className={`${glassSurface} rounded-3xl p-6`}>
        <div className="flex items-center gap-4 mb-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center">
            <Trophy className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <p className="text-sm text-muted">Conquistas registradas nesta cópia</p>
            <p className="text-2xl font-bold text-app">{history.awards === undefined ? 'Indisponível' : `${Math.round((earnedBadges.size / badgeDefinitions.length) * 100)}%`}</p>
          </div>
        </div>
        {history.awards !== undefined && <div className="w-full bg-slate-700/40 rounded-full h-2 mt-3">
          <Motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(earnedBadges.size / badgeDefinitions.length) * 100}%` }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500"
          />
        </div>}
      </div>

      {/* Badge Grid by Category */}
      {categories.map(cat => {
        const badges = progress.filter(b => b.category === cat.id);
        const CatIcon = cat.icon;
        return (
          <div key={cat.id}>
            <div className="flex items-center gap-2 mb-3">
              <CatIcon className="w-5 h-5 text-white/60" />
              <h3 className="text-lg font-semibold text-app">{cat.label}</h3>
            </div>
            <Motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            >
              {badges.map(badge => {
                const BadgeIcon = iconMap[badge.icon] || Flame;
                return (
                  <Motion.div
                    key={badge.id}
                    variants={staggerItem}
                    className={`${glassSurface} rounded-2xl p-5 text-center relative overflow-hidden transition ${
                      badge.earned ? '' : 'opacity-50 grayscale'
                    }`}
                  >
                    {!badge.earned && (
                      <div className="absolute top-2 right-2">
                        <Lock className="w-4 h-4 text-white/30" />
                      </div>
                    )}
                    <div
                      className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                      style={{ backgroundColor: `${badge.color}20` }}
                    >
                      <BadgeIcon className="w-6 h-6" style={{ color: badge.color }} />
                    </div>
                    <p className="font-semibold text-app text-sm mb-1">{badge.name}</p>
                    <p className="text-xs text-muted mb-3">{badge.description}</p>
                    {!badge.earned && <p className="text-xs text-muted mb-2">{badge.current == null ? 'Progresso indisponível' : `${badge.current} / ${badge.requirement} no escopo disponível`}. Sem conquista registrada nesta cópia.</p>}
                    {!badge.earned && badge.current != null && (
                      <div className="w-full bg-slate-700/40 rounded-full h-1.5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${badge.progress}%`, backgroundColor: badge.color }}
                        />
                      </div>
                    )}
                    {badge.earned && (
                      <div className="text-xs text-emerald-400 font-medium">
                        <p>Conquista permanente</p>
                        <p>{new Date(badge.award.awarded_at).toLocaleDateString('pt-BR')} · {milestoneOriginLabel(badge.award.origem)}</p>
                        <p>{coverageLabel(badge.award.cobertura)}</p>
                      </div>
                    )}
                  </Motion.div>
                );
              })}
            </Motion.div>
          </div>
        );
      })}
    </Motion.div>
  );
}
