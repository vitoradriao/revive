import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import RelapseHistory from './RelapseHistory';
vi.mock('../../contexts/DataContext', () => ({ useData: () => ({ relapses: [
  { id: 'event', data_recaida: '2026-01-03T01:30:00Z', timezone: 'America/Sao_Paulo', resetar_contador: false },
  { id: 'legacy', data_recaida: '2026-01-03T01:30:00Z', resetar_contador: true }
] }) }));
it('exibe a data civil no fuso preservado e identifica o fuso legado indisponível', () => {
  render(<RelapseHistory />);
  expect(screen.getByText(/02\/01\/2026, 22:30 · America\/Sao_Paulo/)).toBeInTheDocument();
  expect(screen.getByText(/03\/01\/2026, 01:30 · UTC \(fuso original indisponível\)/)).toBeInTheDocument();
});
