import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReportsPage from './ReportsPage';
import fixtures from '../../../tests/fixtures/progress.cjs';

vi.mock('../contexts/DataContext', () => ({
    useData: () => ({ progressSource: { data: fixtures.progressFixture() } }),
}));

describe('ReportsPage', () => {
    it('exibe economia acumulada canônica e os escopos do filtro', () => {
        render(<ReportsPage />);
        expect(screen.getByText('Relatórios')).toBeInTheDocument();
        expect(screen.getAllByText(/320,00/).length).toBeGreaterThan(0);
        expect(screen.getByText('Resumo por hábito (snapshot, incluindo arquivados)')).toBeInTheDocument();
        expect(screen.getByText('Hábito sintético')).toBeInTheDocument();
        expect(screen.getByText(/sem recorte pelo filtro/)).toBeInTheDocument();
    });
});
