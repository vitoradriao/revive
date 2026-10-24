/**
 * Serialização CSV para exportações do REVIVE (#27).
 *
 * Regras: UTF-8 com BOM, quebra de linha CRLF, todas as células entre aspas e
 * neutralização de fórmulas de planilha. Texto escrito pela pessoa nunca pode
 * ser interpretado como fórmula ao abrir o arquivo no Excel, Calc ou Sheets.
 */

// Caracteres que o software de planilha ignora antes de decidir se a célula é fórmula:
// espaços Unicode, controles C0/DEL e caracteres invisíveis (ZWSP, BOM).
const IGNORED_PREFIX = '\\s\\u0000-\\u001f\\u007f\\u00a0\\u200b-\\u200d\\u2060\\ufeff';
const FORMULA_START = new RegExp(`^[${IGNORED_PREFIX}]*[=+\\-@]`);
// OWASP: tab e CR iniciais também iniciam interpretação em algumas planilhas.
const CONTROL_START = /^[\t\r]/;

export const CSV_BOM = '﻿';
export const CSV_NEWLINE = '\r\n';

export const neutralizeFormula = (raw: string) => (
  FORMULA_START.test(raw) || CONTROL_START.test(raw) ? `'${raw}` : raw
);

export const csvCell = (value: unknown) => {
  const raw = value == null ? '' : String(value);
  return `"${neutralizeFormula(raw).replace(/"/g, '""')}"`;
};

export const toCsv = (header: readonly unknown[], rows: readonly (readonly unknown[])[]) => {
  const body = [header, ...rows].map((row) => row.map(csvCell).join(',')).join(CSV_NEWLINE);
  return `${CSV_BOM}${body}`;
};
