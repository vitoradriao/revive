/**
 * @file MetasPage.jsx
 * @description Pagina de gerenciamento de metas da aplicacao REVIVE.
 *
 * Funciona como wrapper (container) que conecta o componente MetasCard
 * ao contexto global de dados. Delega toda a logica de exibicao e
 * interacao para o componente MetasCard.
 *
 * Utiliza Framer Motion para animacao de transicao de tela (screenTransition).
 *
 * @component
 * @see {@link MetasCard} Componente que renderiza a interface de metas
 * @see {@link useData} Hook para operacoes CRUD de metas
 */
import React from 'react';
import { motion as Motion } from 'framer-motion';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import MetasCard from '../components/modals/MetasCard';
import { screenTransition } from '../utils/constants';

/**
 * Componente da pagina de metas.
 *
 * Extrai dados e funcoes do contexto global (goals, addictions, createGoal,
 * completeGoal, deleteGoal) e os repassa como props ao MetasCard.
 * Padrao arquitetural: Container/Presentational (separacao de responsabilidades).
 *
 * @returns {JSX.Element} Pagina animada contendo o componente MetasCard
 */
export default function MetasPage() {
  const { goals, addictions, createGoal, completeGoal, deleteGoal } = useData();
  const { loading } = useUI();

  return (
    <Motion.div {...screenTransition}>
      <MetasCard
        metas={goals}
        vicios={addictions.filter(habit => habit.ativo !== false)}
        onAddMeta={createGoal}
        onCompleteMeta={completeGoal}
        onDeleteMeta={deleteGoal}
        loading={loading}
      />
    </Motion.div>
  );
}
