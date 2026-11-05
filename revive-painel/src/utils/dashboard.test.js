import { describe, expect, it } from 'vitest';
import { selectRecentActivity } from './dashboard';

describe('selectRecentActivity', () => {
  it('keeps the newest records even when the API returns them newest-first', () => {
    const records = Array.from({ length: 7 }, (_, index) => ({
      id: index,
      humor: 'bom',
      data_registro: `2026-10-${String(20 - index).padStart(2, '0')}`,
    }));

    const events = selectRecentActivity({ records });

    expect(events.map(event => event.id)).toEqual(['reg-0', 'reg-1', 'reg-2', 'reg-3', 'reg-4']);
  });

  it('dates completed goals by completion and falls back to creation', () => {
    const goals = [
      { id: 'a', concluida: true, descricao_meta: 'A', data_criacao: '2026-01-01', data_conclusao: '2026-10-10' },
      { id: 'b', concluida: true, descricao_meta: 'B', data_criacao: '2026-09-01' },
      { id: 'c', concluida: false, descricao_meta: 'C', data_criacao: '2026-10-30' },
    ];

    const events = selectRecentActivity({ goals });

    expect(events.map(event => event.id)).toEqual(['meta-a', 'meta-b']);
  });

  it('merges sources newest-first and limits the timeline', () => {
    const events = selectRecentActivity({
      records: [{ id: 1, humor: 'bom', data_registro: '2026-10-01' }],
      relapses: [{ id: 2, data_recaida: '2026-10-05T10:00:00Z' }],
    }, 1);

    expect(events.map(event => event.id)).toEqual(['rec-2']);
  });
});
