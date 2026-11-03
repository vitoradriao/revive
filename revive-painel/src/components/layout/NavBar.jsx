import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion as Motion } from 'framer-motion';
import {
  RefreshCw,
  BarChart3,
  Calendar as CalendarIcon,
  FileText,
  Heart,
  Lightbulb,
  Moon,
  PieChart,
  Plus,
  Target,
  Trophy,
  User
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { navButtonMotion } from '../../utils/constants';

const navItems = [
  { path: '/', label: 'Jornada', icon: Heart },
  { path: '/analytics', label: 'Evolução', icon: PieChart },
  { path: '/metas', label: 'Metas', icon: Target },
  { path: '/calendario', label: 'Calendário', icon: CalendarIcon },
  { path: '/conquistas', label: 'Conquistas', icon: Trophy },
  { path: '/relatorios', label: 'Relatórios', icon: FileText },
  { path: '/dicas', label: 'Dicas', icon: Lightbulb },
  { path: '/sincronizacao', label: 'Sincronização', icon: RefreshCw },
  { path: '/perfil', label: 'Perfil', icon: User },
];

const NavBar = ({ variant = 'mobile' }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedAddiction } = useData();
  const { openNewAddictionWizard, toggleTheme } = useUI();

  const allItems = [...navItems];
  if (selectedAddiction) {
    allItems.splice(3, 0, {
      path: `/vicios/${selectedAddiction.id}`,
      label: 'Detalhes',
      icon: BarChart3
    });
  }

  if (variant === 'sidebar') {
    return (
      <aside className="revive-sidebar">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-[52px] h-[52px] rounded-[18px] bg-[var(--accent)] text-[#121212] grid place-items-center font-black"
          title="Revive"
          aria-label="Ir para jornada"
        >
          <BarChart3 className="w-6 h-6" />
        </button>

        <nav className="mt-12 grid gap-3 flex-1" aria-label="Menu principal">
          {allItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Motion.button
                key={item.path}
                {...navButtonMotion}
                type="button"
                onClick={() => navigate(item.path)}
                title={item.label}
                aria-label={item.label}
                className={`w-[52px] h-[52px] rounded-[18px] grid place-items-center transition ${
                  isActive
                    ? 'bg-[var(--surface)] text-[#121212]'
                    : 'text-white/55 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-5 h-5" />
              </Motion.button>
            );
          })}
        </nav>

        <div className="grid gap-3">
          <Motion.button
            {...navButtonMotion}
            type="button"
            onClick={openNewAddictionWizard}
            title="Novo hábito"
            aria-label="Novo hábito"
            className="w-[52px] h-[52px] rounded-[18px] grid place-items-center border border-white/15 text-[var(--accent)] hover:bg-white/10 transition"
          >
            <Plus className="w-5 h-5" />
          </Motion.button>
          <Motion.button
            {...navButtonMotion}
            type="button"
            onClick={toggleTheme}
            title="Alternar tema"
            aria-label="Alternar tema"
            className="w-[52px] h-[52px] rounded-[18px] grid place-items-center border border-white/15 text-white/70 hover:text-white hover:bg-white/10 transition"
          >
            <Moon className="w-5 h-5" />
          </Motion.button>
        </div>
      </aside>
    );
  }

  return (
    <nav className="lg:hidden surface-sand rounded-[24px] p-2 mb-5 flex gap-2 overflow-x-auto" aria-label="Menu principal">
      {allItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        return (
          <Motion.button
            key={item.path}
            {...navButtonMotion}
            type="button"
            onClick={() => navigate(item.path)}
            title={item.label}
            className={`flex items-center gap-2 px-3 py-2 rounded-[16px] font-black transition whitespace-nowrap ${
              isActive
                ? 'bg-[#121212] text-[#fbfaf5]'
                : 'text-muted hover:text-app hover:bg-black/5'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{item.label}</span>
          </Motion.button>
        );
      })}
      <Motion.button
        {...navButtonMotion}
        type="button"
        onClick={openNewAddictionWizard}
        className="flex items-center gap-2 px-3 py-2 rounded-[16px] font-black text-[#121212] bg-[var(--accent)] transition whitespace-nowrap"
        title="Novo hábito"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">Novo</span>
      </Motion.button>
    </nav>
  );
};

export default NavBar;
