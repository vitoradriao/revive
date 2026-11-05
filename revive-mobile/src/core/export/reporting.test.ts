import { describe, expect, it, jest } from '@jest/globals';
import { createCsv, createPrintSummaryHtml } from './reporting';
import type { BootstrapData } from '@/domain/types';

jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: {} } }));
jest.mock('expo-print', () => ({ printAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const makeData = (habitName = 'Hábito A'): BootstrapData => ({
  server_time: '2026-02-01T12:00:00Z',
  usuario: { id: 'u', nome: 'Pessoa', email: 'test@example.invalid' },
  vicios: [{
    id: 'habit', usuario_id: 'u', nome_vicio: habitName, data_inicio: '2025-12-01',
    progresso: {
      sequencia_atual_dias: 2, sequencia_atual_cobertura: 'confirmed', recorde_dias: 30, recorde_cobertura: 'confirmed',
      dias_checkin: 1, economia_sequencia: { valor_estimado: 20, cobertura: 'inferred' },
      economia_acumulada: { valor_estimado: 500, cobertura: 'inferred' },
      marcos: [{ id: 'award', categoria: 'streak', valor_alvo: 30, awarded_at: '2026-01-30T12:00:00Z', origem: 'period_threshold', cobertura: 'confirmed' }],
    },
  }],
  registros: [
    { id: '1', vicio_id: 'habit', data_registro: '2026-01-30', humor: 'Bem' },
    { id: '2', vicio_id: 'habit', data_registro: '2026-01-30', humor: 'Confiante' },
  ],
  recaidas: [], metas: [], mensagem: null,
  conquistas: [{ id: 'award', vicio_id: null, categoria: 'streak', valor_alvo: 30, awarded_at: '2026-01-30T12:00:00Z', origem: 'period_threshold', cobertura: 'confirmed' }],
});

describe('CSV export', () => {
  it('neutraliza fórmulas em texto livre, nomes de hábitos e metas, e usa BOM e CRLF', () => {
    const data = makeData('=HYPERLINK("x")');
    data.registros = [{ id: '1', vicio_id: 'habit', data_registro: '2026-01-30', humor: ' +Bem', observacoes: '@texto' }];
    const csv = createCsv(data);
    expect(csv.startsWith('﻿"tipo"')).toBe(true);
    expect(csv).toContain('\r\n');
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv).toContain('"\' +Bem"');
    expect(csv).toContain('"\'@texto"');
  });
});

describe('printable progress summary', () => {
  it('distinguishes active sequence, historical record, distinct check-in dates and estimated coverage', () => {
    const html = createPrintSummaryHtml(makeData(), new Date('2026-02-01T12:00:00Z'));

    expect(html).toContain('Sequência atual');
    expect(html).toContain('Recorde histórico');
    expect(html).toContain('Dias distintos com check-in');
    expect(html).toContain('Economia estimada acumulada');
    expect(html).toContain('30 dias consecutivos');
    expect(html).toContain('1 dia');
    expect(html).not.toContain('Total economizado');
  });

  it('escapes habit names and uses an unavailable state for unknown history', () => {
    const html = createPrintSummaryHtml(makeData('<script>alert(1)</script>'), new Date('2026-02-01T12:00:00Z'));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
