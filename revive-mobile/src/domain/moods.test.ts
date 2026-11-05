import { describe, expect, it } from '@jest/globals';
import { describeMood, moodKey } from './moods';

describe('moods', () => {
  it('recognizes the mobile suggestions', () => {
    expect(describeMood('Bem')).toEqual({ key: 'bem', label: 'Bem', art: 'humor-bem', known: true });
  });

  it('recognizes web suggestions regardless of case and accents', () => {
    expect(describeMood('péssimo')).toMatchObject({ key: 'pessimo', label: 'Péssimo', art: 'humor-desanimado' });
    expect(describeMood('PESSIMO')?.label).toBe('Péssimo');
    expect(describeMood('neutro')).toMatchObject({ label: 'Neutro', art: undefined, known: true });
  });

  it('keeps supporting the legacy mis-encoded value', () => {
    expect(moodKey('pÃ©ssimo')).toBe('pessimo');
  });

  it('keeps free text as typed and ignores empty values', () => {
    expect(describeMood('  Cansado ')).toEqual({ key: 'cansado', label: 'Cansado', known: false });
    expect(describeMood('   ')).toBeNull();
    expect(describeMood(undefined)).toBeNull();
  });
});
