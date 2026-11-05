// Humor is free text in both apps; each one only suggests its own options.
// This catalog lets the mobile app recognize the web vocabulary too, without
// rewriting stored records.

export type MoodArt = 'humor-bem' | 'humor-confiante' | 'humor-ansioso' | 'humor-desanimado';

export interface MoodDescription {
  /** Accent- and case-insensitive grouping key. */
  key: string;
  /** Label to display: the catalog label, or the original text trimmed. */
  label: string;
  art?: MoodArt;
  known: boolean;
}

const catalog: Record<string, { label: string; art?: MoodArt }> = {
  // Mobile suggestions
  bem: { label: 'Bem', art: 'humor-bem' },
  confiante: { label: 'Confiante', art: 'humor-confiante' },
  ansioso: { label: 'Ansioso', art: 'humor-ansioso' },
  desanimado: { label: 'Desanimado', art: 'humor-desanimado' },
  // Web suggestions
  excelente: { label: 'Excelente', art: 'humor-confiante' },
  bom: { label: 'Bom', art: 'humor-bem' },
  neutro: { label: 'Neutro' },
  ruim: { label: 'Ruim', art: 'humor-desanimado' },
  pessimo: { label: 'Péssimo', art: 'humor-desanimado' },
};

// Legacy web records saved with UTF-8 read as Latin-1 ("pÃ©ssimo").
const legacyAliases: Record<string, string> = { 'pã©ssimo': 'pessimo' };

export const moodKey = (humor: string | null | undefined) => {
  const normalized = (humor ?? '').trim().toLowerCase();
  return legacyAliases[normalized] ?? normalized.normalize('NFD').replace(/\p{M}/gu, '');
};

export function describeMood(humor: string | null | undefined): MoodDescription | null {
  const original = (humor ?? '').trim();
  if (!original) return null;
  const key = moodKey(original);
  const entry = catalog[key];
  return entry ? { key, label: entry.label, art: entry.art, known: true } : { key, label: original, known: false };
}
