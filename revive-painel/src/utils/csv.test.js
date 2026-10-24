import { describe, expect, it } from 'vitest';
import { CSV_BOM, csvCell, toCsv } from './csv';

describe('csvCell', () => {
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', ' =HYPERLINK("x")', '\t=1', '\r=1', '\n=1', ' =1', '​@x', '\u0001+1'])(
    'neutraliza fórmula iniciada por %j',
    (value) => {
      const cell = csvCell(value);
      expect(cell.startsWith('"\'')).toBe(true);
      expect(cell).toContain(value.replaceAll('"', '""'));
    },
  );

  it.each(['Texto normal', 'a=b', '1-2', 'e-mail@example.invalid', '', '0', 'ação'])('mantém %j sem prefixo', (value) => {
    expect(csvCell(value)).toBe(`"${value}"`);
  });

  it('trata nulo e indefinido como célula vazia e converte tipos primitivos', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(7)).toBe('"7"');
  });

  it('duplica aspas e preserva quebras de linha dentro da célula', () => {
    expect(csvCell('disse "oi"\nlinha 2')).toBe('"disse ""oi""\nlinha 2"');
  });
});

describe('toCsv', () => {
  it('usa BOM UTF-8, CRLF entre linhas e todas as células entre aspas', () => {
    const csv = toCsv(['Data', 'Observações'], [['2026-01-30', 'ação'], ['2026-01-31', '=1+1']]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      '"Data","Observações"',
      '"2026-01-30","ação"',
      '"2026-01-31","\'=1+1"',
    ]);
  });
});
