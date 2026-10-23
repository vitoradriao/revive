/**
 * @file ProfilePage.jsx
 * @description Pagina de perfil do usuario da aplicacao REVIVE.
 *
 * Exibe informacoes do usuario (nome, email), resumo estatistico
 * (vicios ativos, metas concluidas, registros), preferencias (tema claro/escuro),
 * acoes de dados (exportar JSON) e botao de logout.
 *
 * Utiliza tres contextos React: AuthContext (autenticacao), UIContext (tema)
 * e DataContext (dados do usuario).
 *
 * @component
 * @see {@link useAuth} Hook de autenticacao (usuario, logout)
 * @see {@link useUI} Hook de interface (tema, toggle)
 * @see {@link useData} Hook de dados (vicios, metas, registros, recaidas)
 */
import React from 'react';
import AccountSecurity from '../components/account/AccountSecurity';
import { motion as Motion } from 'framer-motion';
import { User, Sun, Moon, Download, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { useProgress } from '../contexts/useProgress';
import ProgressNotice from '../components/dashboard/ProgressNotice';
import HeroKpis from '../components/dashboard/HeroKpis';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import { glassSurface, screenTransition } from '../utils/constants';
import { exportHabit } from '../utils/personalReason';

/**
 * Componente da pagina de Perfil.
 *
 * Funcionalidade principal: exportacao da cópia parcial dos dados do usuario em JSON
 * e alternancia de tema (claro/escuro) via toggle switch.
 * A exportacao cria um Blob JSON e dispara download automatico.
 *
 * @returns {JSX.Element} Pagina de perfil com info do usuario, estatisticas, preferencias e acoes
 */
export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useUI();
  const progress = useProgress();
  const { habits: addictions, goals, records: allRecords, relapses } = progress;

  /**
   * Exporta os dados consolidados disponíveis do usuário como arquivo JSON.
   * Inclui vicios, metas, registros, recaidas e timestamp de exportacao.
   * Cria Blob com JSON formatado (2 espacos) e dispara download via <a> programatico.
   */
  const exportData = () => {
    const data = { addictions: addictions.map(exportHabit), goals, registros: allRecords, relapses, conquistas: progress.awards, coverage: 'partial', scope: progress.scope, consolidatedAt: progress.updatedAt, pendingCount: progress.pendingCount, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'revive-dados-exportados.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Motion.div {...screenTransition} className="space-y-6 max-w-2xl mx-auto">
      <PageHeader
        eyebrow="Conta"
        title="Perfil"
        description="Gerencie preferências, exportação de dados e sessão."
      />

      <ProgressNotice progress={progress} />
      <HeroKpis progress={progress} />

      {/* Dados da conta */}
      <div className={`${glassSurface} rounded-3xl p-6`}>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-[#7CF6C4]/20 flex items-center justify-center">
            <User className="w-8 h-8 text-[#7CF6C4]" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-app">{user?.nome || 'Usuário'}</h3>
            <p className="text-muted">{user?.email}</p>
          </div>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-white/5 rounded-xl border border-white/10">
            <p className="text-2xl font-bold text-[#7CF6C4]">{progress.available ? progress.activeCount : 'Indisponível'}</p>
            <p className="text-xs text-muted">Hábitos ativos disponíveis</p>
          </div>
          <div className="text-center p-3 bg-white/5 rounded-xl border border-white/10">
            <p className="text-2xl font-bold text-[#35D3FF]">{progress.available ? progress.completedGoals : 'Indisponível'}</p>
            <p className="text-xs text-muted">Metas concluídas disponíveis</p>
          </div>
          <div className="text-center p-3 bg-white/5 rounded-xl border border-white/10">
            <p className="text-2xl font-bold text-amber-400">{progress.available ? progress.checkinDays : 'Indisponível'}</p>
            <p className="text-xs text-muted">Dias com check-in disponíveis</p>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className={`${glassSurface} rounded-3xl p-6`}>
        <h3 className="text-lg font-semibold text-app mb-4">Preferências</h3>

        {/* Theme Toggle */}
        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 mb-3">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? <Moon className="w-5 h-5 text-purple-400" /> : <Sun className="w-5 h-5 text-amber-400" />}
            <div>
              <p className="font-medium text-app">Tema</p>
              <p className="text-xs text-muted">{theme === 'dark' ? 'Escuro' : 'Claro'}</p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            aria-label="Alternar tema"
            aria-pressed={theme === 'dark'}
            className={`w-12 h-6 rounded-full transition relative ${theme === 'dark' ? 'bg-purple-500/40' : 'bg-amber-500/40'}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${theme === 'dark' ? 'translate-x-0.5' : 'translate-x-6'}`} />
          </button>
        </div>
      </div>

      {/* Data Actions */}
      <div className={`${glassSurface} rounded-3xl p-6`}>
        <h3 className="text-lg font-semibold text-app mb-4">Dados</h3>

        <button
          onClick={exportData}
          disabled={!progress.available || progress.loading}
          className="w-full flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition mb-3"
        >
          <Download className="w-5 h-5 text-[#7CF6C4]" />
          <div className="text-left">
            <p className="font-medium text-app">Exportar dados</p>
            <p className="text-xs text-muted">Baixar cópia parcial consolidada em JSON, com cobertura e conquistas</p>
          </div>
        </button>

        <AccountSecurity />
      </div>

      {/* Logout */}
      <Button
        onClick={logout}
        variant="danger"
        size="lg"
        className="w-full"
      >
        <LogOut className="w-5 h-5" />
        Sair da conta
      </Button>
    </Motion.div>
  );
}
