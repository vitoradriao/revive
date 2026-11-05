/**
 * Serialização CSV das exportações do painel (#27).
 *
 * Mesmas regras do mobile (revive-mobile/src/core/export/csv.ts): UTF-8 com BOM,
 * CRLF, todas as células entre aspas e neutralização de fórmulas de planilha.
 */

// Caracteres ignorados pela planilha antes de decidir se a célula é fórmula:
// espaços Unicode, controles C0/DEL e invisíveis (ZWSP, BOM).
const IGNORED_PREFIX = '\\s\\u0000-\\u001f\\u007f\\u00a0\\u200b-\\u200d\\u2060\\ufeff';
const FORMULA_START = new RegExp(`^[${IGNORED_PREFIX}]*[=+\\-@]`);
const CONTROL_START = /^[\t\r]/;

export const CSV_BOM = '﻿';
export const CSV_NEWLINE = '\r\n';

export const neutralizeFormula = (raw) => (
  FORMULA_START.test(raw) || CONTROL_START.test(raw) ? `'${raw}` : raw
);

export const csvCell = (value) => {
  const raw = value == null ? '' : String(value);
  return `"${neutralizeFormula(raw).replaceAll('"', '""')}"`;
};

export const toCsv = (header, rows) => {
  const body = [header, ...rows].map((row) => row.map(csvCell).join(',')).join(CSV_NEWLINE);
  return `${CSV_BOM}${body}`;
};
