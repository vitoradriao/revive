/**
 * @file moods.js
 * @description Catalogo de humores compartilhado entre os vocabularios do painel
 * (excelente/bom/neutro/ruim/pessimo) e do mobile (Bem/Confiante/Ansioso/Desanimado).
 *
 * O humor e texto livre nos dois apps; este modulo apenas reconhece as duas listas
 * de sugestoes, sem reescrever registros salvos.
 */

const UNKNOWN_COLOR = '#6b7280';

const catalog = {
  // Sugestoes do painel
  excelente: { label: 'Excelente', color: '#10b981' },
  bom: { label: 'Bom', color: '#3b82f6' },
  neutro: { label: 'Neutro', color: '#8b5cf6' },
  ruim: { label: 'Ruim', color: '#f59e0b' },
  pessimo: { label: 'Péssimo', color: '#ef4444' },
  // Sugestoes do mobile
  confiante: { label: 'Confiante', color: '#10b981' },
  bem: { label: 'Bem', color: '#3b82f6' },
  ansioso: { label: 'Ansioso', color: '#f59e0b' },
  desanimado: { label: 'Desanimado', color: '#ef4444' },
};

// Registros antigos gravados com UTF-8 lido como Latin-1 ("pÃ©ssimo").
const legacyAliases = { 'pã©ssimo': 'pessimo' };

export function moodKey(humor) {
  const normalized = String(humor ?? '').trim().toLowerCase();
  return legacyAliases[normalized] ?? normalized.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Descreve um humor salvo: rotulo e cor do catalogo quando reconhecido, ou o
 * texto original com cor neutra. Retorna `null` para valores vazios.
 */
export function describeMood(humor) {
  const original = String(humor ?? '').trim();
  if (!original) return null;
  const key = moodKey(original);
  const entry = catalog[key];
  return entry
    ? { key, label: entry.label, color: entry.color, known: true }
    : { key, label: original, color: UNKNOWN_COLOR, known: false };
}

/** Conta humores agrupando grafias equivalentes, do mais para o menos frequente. */
export function countMoods(records) {
  const counts = new Map();
  for (const record of records || []) {
    const mood = describeMood(record?.humor);
    if (!mood) continue;
    const entry = counts.get(mood.key) || { ...mood, count: 0 };
    entry.count += 1;
    counts.set(mood.key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}
