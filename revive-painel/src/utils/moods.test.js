import { describe, expect, it } from 'vitest';
import { countMoods, describeMood, moodKey } from './moods';

describe('moods', () => {
  it('recognizes the mobile vocabulary with its own label and color', () => {
    expect(describeMood('Confiante')).toEqual({ key: 'confiante', label: 'Confiante', color: '#10b981', known: true });
    expect(describeMood('Desanimado')?.color).toBe('#ef4444');
  });

  it('recognizes web values regardless of case and accents', () => {
    expect(describeMood('péssimo')?.label).toBe('Péssimo');
    expect(describeMood('PESSIMO')?.key).toBe('pessimo');
  });

  it('keeps supporting the legacy mis-encoded value', () => {
    expect(moodKey('pÃ©ssimo')).toBe('pessimo');
  });

  it('keeps free text as typed with a neutral color', () => {
    expect(describeMood(' Cansado ')).toEqual({ key: 'cansado', label: 'Cansado', color: '#6b7280', known: false });
    expect(describeMood('')).toBeNull();
  });

  it('counts equivalent spellings together and skips empty moods', () => {
    const counts = countMoods([{ humor: 'bom' }, { humor: 'Bom' }, { humor: 'Bem' }, { humor: '' }, {}]);
    expect(counts.map(({ label, count }) => [label, count])).toEqual([['Bom', 2], ['Bem', 1]]);
  });
});
