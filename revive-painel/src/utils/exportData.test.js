import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildPreview, collectExport, datasetToCsv, datasetToHtml, datasetToJson, defaultSelection, exportFileName,
  ExportCancelledError, EXPORT_FIELDS, localDateOf, validateSelection,
} from './exportData';

const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures');
const read = (name) => fs.readFileSync(path.join(fixtureDir, name), 'utf8');
const fx = JSON.parse(read('export-selection.json'));

const run = (overrides = {}) => {
  const clock = [...fx.clock];
  const calls = [];
  return collectExport({
    selection: fx.selection, habits: fx.habits, snapshot: fx.snapshot, pendingCount: fx.pendingCount,
    fetchPage: async (path) => {
      calls.push(path);
      if (overrides.failPath === path) throw new Error('falha de rede sintética');
      if (!fx.pages[path]) throw new Error(`página inesperada: ${path}`);
      return fx.pages[path];
    },
    now: () => new Date(clock.shift() || fx.clock[1]),
    ...overrides.options,
  }).then((dataset) => ({ dataset, calls }));
};

describe('exportação seletiva (#27) — fixture compartilhada com o mobile', () => {
  it('gera CSV, JSON e HTML idênticos às saídas esperadas', async () => {
    const { dataset } = await run();
    expect(datasetToCsv(dataset)).toBe(read('export-selection.expected.csv'));
    expect(datasetToJson(dataset, fx.generatedAt) + '\n').toBe(read('export-selection.expected.json'));
    expect(datasetToHtml(dataset, fx.generatedAt) + '\n').toBe(read('export-selection.expected.html'));
  });

  it('não deixa sentinelas desmarcadas em conteúdo nem metadados', async () => {
    const { dataset } = await run();
    const outputs = [datasetToCsv(dataset), datasetToJson(dataset, fx.generatedAt), datasetToHtml(dataset, fx.generatedAt),
      JSON.stringify(buildPreview(dataset, 50)), exportFileName(dataset, 'csv')];
    for (const output of outputs) for (const sentinel of fx.sentinels) expect(output).not.toContain(sentinel);
  });

  it('consulta todas as páginas e descarta duplicados entre páginas', async () => {
    const { dataset, calls } = await run();
    expect(calls).toHaveLength(Object.keys(fx.pages).length);
    expect(dataset.data.registros).toHaveLength(4);
    expect(dataset.duplicates).toBe(1);
    expect(dataset.complete).toBe(true);
  });

  it('marca o arquivo como parcial quando uma página intermediária falha', async () => {
    const { dataset } = await run({ failPath: fx.partialFailPath });
    expect(dataset.complete).toBe(false);
    expect(dataset.sources.find((source) => !source.completa)).toMatchObject({ tipo: 'registros', habito: 'Hábito 1', paginas: 1 });
    expect(datasetToCsv(dataset)).toContain('"parcial"');
    expect(datasetToHtml(dataset, fx.generatedAt)).toContain('Exportação parcial');
    expect(exportFileName(dataset, 'json')).toBe('revive-2026-02-01-a-2026-02-03-parcial.json');
    expect(buildPreview(dataset).types.find((type) => type.type === 'registros').complete).toBe(false);
  });

  it('inclui nomes, texto livre e metas sem data somente por opção explícita', async () => {
    const selection = { ...fx.selection, includeHabitNames: true, includeUndatedGoals: true,
      fields: { ...fx.selection.fields, metas: [...fx.selection.fields.metas, 'descricao_meta'] } };
    const { dataset } = await run({ options: { selection } });
    const json = datasetToJson(dataset, fx.generatedAt);
    expect(json).toContain('SENTINELA_NOME_HABITO_A');
    expect(json).toContain('SENTINELA_DESCRICAO_META');
    expect(json).toContain('meta sem data');
    expect(json).not.toContain('meta antiga');
    expect(json).not.toContain('sentinela@example.invalid');
  });

  it('nunca exporta o motivo pessoal do hábito, mesmo com nomes incluídos', async () => {
    const habits = fx.habits.map((habit) => ({ ...habit, motivo_pessoal: 'SENTINELA_MOTIVO_PESSOAL' }));
    const dataset = await collectExport({ selection: { ...fx.selection, includeHabitNames: true }, habits, snapshot: fx.snapshot,
      fetchPage: async (path) => fx.pages[path] });
    const outputs = [datasetToCsv(dataset), datasetToJson(dataset, fx.generatedAt), datasetToHtml(dataset, fx.generatedAt)];
    for (const output of outputs) { expect(output).not.toContain('SENTINELA_MOTIVO_PESSOAL'); expect(output).not.toContain('motivo_pessoal'); }
  });

  it('interrompe a coleta ao cancelar ou trocar de conta', async () => {
    const controller = new AbortController();
    let current = true;
    const fetchPage = async (path) => { controller.abort(); return fx.pages[path]; };
    await expect(collectExport({ selection: fx.selection, habits: fx.habits, snapshot: fx.snapshot, fetchPage, signal: controller.signal }))
      .rejects.toBeInstanceOf(ExportCancelledError);
    const switching = async (path) => { current = false; return fx.pages[path]; };
    await expect(collectExport({ selection: fx.selection, habits: fx.habits, snapshot: fx.snapshot, fetchPage: switching, isCurrent: () => current }))
      .rejects.toBeInstanceOf(ExportCancelledError);
  });

  it('não converte uma falha de rede em cancelamento nem o contrário', async () => {
    const fetchPage = async () => { throw new Error('offline'); };
    const dataset = await collectExport({ selection: fx.selection, habits: fx.habits, snapshot: fx.snapshot, fetchPage });
    expect(dataset.complete).toBe(false);
    expect(dataset.data.registros).toHaveLength(0);
    expect(dataset.data.recaidas).toHaveLength(2);
  });
});

describe('seleção da exportação', () => {
  it('começa com hábitos ativos, 30 dias locais e sem texto livre', () => {
    const selection = defaultSelection({ habits: fx.habits, timezone: 'America/Sao_Paulo', now: new Date('2026-02-03T02:00:00Z') });
    expect(selection.habitIds).toEqual([fx.habits[0].id, fx.habits[2].id]);
    expect(selection.fim).toBe('2026-02-02');
    expect(selection.inicio).toBe('2026-01-04');
    for (const [type, keys] of Object.entries(selection.fields)) {
      for (const key of keys) expect(EXPORT_FIELDS[type].find((field) => field.key === key).freeText).toBe(false);
    }
    expect(selection.includeHabitNames).toBe(false);
    expect(selection.includeUndatedGoals).toBe(false);
    expect(validateSelection(selection, fx.habits)).toEqual({});
  });

  it('rejeita intervalos invertidos, datas inválidas, hábitos alheios e tipos sem campo', () => {
    const base = { ...fx.selection };
    expect(validateSelection({ ...base, fim: '2026-01-31' }, fx.habits).fim).toBeTruthy();
    expect(validateSelection({ ...base, inicio: '2026-02-30' }, fx.habits).inicio).toBeTruthy();
    expect(validateSelection({ ...base, inicio: '2010-01-01' }, fx.habits).fim).toBeTruthy();
    expect(validateSelection({ ...base, habitIds: ['outra-conta'] }, fx.habits).habitIds).toBeTruthy();
    expect(validateSelection({ ...base, habitIds: [] }, fx.habits).habitIds).toBeTruthy();
    expect(validateSelection({ ...base, types: [] }, fx.habits).types).toBeTruthy();
    expect(validateSelection({ ...base, fields: { ...base.fields, metas: [] } }, fx.habits).fields).toBeTruthy();
    expect(validateSelection({ ...base, timezone: 'Lua/Base' }, fx.habits).timezone).toBeTruthy();
  });

  it('converte instantes para a data local do fuso escolhido', () => {
    expect(localDateOf('2026-02-02T02:30:00Z', 'America/Sao_Paulo')).toBe('2026-02-01');
    expect(localDateOf('2026-02-02T02:30:00Z', 'Asia/Tokyo')).toBe('2026-02-02');
    expect(localDateOf('2026-02-02', 'Asia/Tokyo')).toBe('2026-02-02');
    expect(localDateOf(null, 'UTC')).toBeNull();
  });
});
