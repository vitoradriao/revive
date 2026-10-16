import React from 'react';
import { motion as Motion } from 'framer-motion';
import { LogOut, Moon, Plus, Sun, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { navButtonMotion } from '../../utils/constants';
import Button from '../ui/Button';

const Header = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, openNewAddictionWizard } = useUI();

  return (
    <Motion.header
      className="revive-topbar"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="min-w-0">
        <p className="eyebrow">Painel de progresso</p>
        <h1 className="mt-1 text-4xl sm:text-5xl font-black leading-[0.9] tracking-[-0.07em] text-app">Revive</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <button type="button" className="revive-pill max-w-[220px]" title={user?.nome || user?.email || 'Usuário'}>
          <User className="w-4 h-4 shrink-0" />
          <span className="truncate">{user?.nome || user?.email || 'Usuário'}</span>
        </button>

        <Button type="button" variant="primary" size="md" aria-label="Novo hábito" onClick={openNewAddictionWizard}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo hábito</span>
        </Button>

        <Motion.button
          {...navButtonMotion}
          type="button"
          onClick={toggleTheme}
          className="revive-round-icon border border-[var(--line)]"
          title="Alternar tema"
          aria-label="Alternar tema"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Motion.button>

        <Motion.button
          {...navButtonMotion}
          type="button"
          onClick={logout}
          className="revive-round-icon border border-[var(--line)]"
          title="Sair"
          aria-label="Sair"
        >
          <LogOut className="w-5 h-5" />
        </Motion.button>
      </div>
    </Motion.header>
  );
};

export default Header;
