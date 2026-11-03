import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
  buildPreview, collectExport, datasetToCsv, datasetToHtml, datasetToJson, defaultSelection, exportFileName,
  ExportCancelledError, EXPORT_FIELDS, localDateOf, validateSelection, type ExportSelection, type ExportType,
} from './selection';

// Fixture compartilhada com o painel (revive-painel/src/utils/exportData.test.js).
const fixtureDir = join(__dirname, '../../../../tests/fixtures');
const read = (name: string) => readFileSync(join(fixtureDir, name), 'utf8');
const fx = JSON.parse(read('export-selection.json'));
const selection = fx.selection as ExportSelection;

const run = async (overrides: { failPath?: string; selection?: ExportSelection } = {}) => {
  const clock = [...fx.clock] as string[];
  const calls: string[] = [];
  const dataset = await collectExport({
    selection: overrides.selection ?? selection, habits: fx.habits, snapshot: fx.snapshot, pendingCount: fx.pendingCount,
    fetchPage: async (path) => {
      calls.push(path);
      if (overrides.failPath === path) throw new Error('falha de rede sintética');
      if (!fx.pages[path]) throw new Error(`página inesperada: ${path}`);
      return fx.pages[path];
    },
    now: () => new Date(clock.shift() || fx.clock[1]),
  });
  return { dataset, calls };
};

describe('exportação seletiva (#27) — fixture compartilhada com o painel', () => {
  it('gera CSV, JSON e HTML idênticos às saídas esperadas', async () => {
    const { dataset } = await run();
    expect(datasetToCsv(dataset)).toBe(read('export-selection.expected.csv'));
    expect(`${datasetToJson(dataset, fx.generatedAt)}\n`).toBe(read('export-selection.expected.json'));
    expect(`${datasetToHtml(dataset, fx.generatedAt)}\n`).toBe(read('export-selection.expected.html'));
  });

  it('não deixa sentinelas desmarcadas em conteúdo nem metadados', async () => {
    const { dataset } = await run();
    const outputs = [datasetToCsv(dataset), datasetToJson(dataset, fx.generatedAt), datasetToHtml(dataset, fx.generatedAt),
      JSON.stringify(buildPreview(dataset, 50)), exportFileName(dataset, 'csv')];
    for (const output of outputs) for (const sentinel of fx.sentinels as string[]) expect(output).not.toContain(sentinel);
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
  });

  it('inclui nomes, texto livre e metas sem data somente por opção explícita', async () => {
    const optIn: ExportSelection = { ...selection, includeHabitNames: true, includeUndatedGoals: true,
      fields: { ...selection.fields, metas: [...selection.fields.metas, 'descricao_meta'] } };
    const { dataset } = await run({ selection: optIn });
    const json = datasetToJson(dataset, fx.generatedAt);
    expect(json).toContain('SENTINELA_NOME_HABITO_A');
    expect(json).toContain('SENTINELA_DESCRICAO_META');
    expect(json).toContain('meta sem data');
    expect(json).not.toContain('meta antiga');
    expect(json).not.toContain('sentinela@example.invalid');
  });

  it('nunca exporta o motivo pessoal do hábito, mesmo com nomes incluídos', async () => {
    const habits = fx.habits.map((habit: object) => ({ ...habit, motivo_pessoal: 'SENTINELA_MOTIVO_PESSOAL' }));
    const dataset = await collectExport({ selection: { ...selection, includeHabitNames: true }, habits, snapshot: fx.snapshot,
      fetchPage: async (path) => fx.pages[path] });
    for (const output of [datasetToCsv(dataset), datasetToJson(dataset, fx.generatedAt), datasetToHtml(dataset, fx.generatedAt)]) {
      expect(output).not.toContain('SENTINELA_MOTIVO_PESSOAL');
      expect(output).not.toContain('motivo_pessoal');
    }
  });

  it('interrompe a coleta ao cancelar ou trocar de conta', async () => {
    const controller = new AbortController();
    await expect(collectExport({ selection, habits: fx.habits, snapshot: fx.snapshot, signal: controller.signal,
      fetchPage: async (path) => { controller.abort(); return fx.pages[path]; } })).rejects.toBeInstanceOf(ExportCancelledError);
    let current = true;
    await expect(collectExport({ selection, habits: fx.habits, snapshot: fx.snapshot, isCurrent: () => current,
      fetchPage: async (path) => { current = false; return fx.pages[path]; } })).rejects.toBeInstanceOf(ExportCancelledError);
    await expect(collectExport({ selection, habits: fx.habits, snapshot: fx.snapshot,
      fetchPage: async () => { throw Object.assign(new Error('conta'), { code: 'SESSAO_ALTERADA' }); } })).rejects.toBeInstanceOf(ExportCancelledError);
  });

  it('sem conexão, mantém recaídas e metas do snapshot e declara a falta das páginas', async () => {
    const dataset = await collectExport({ selection, habits: fx.habits, snapshot: fx.snapshot,
      fetchPage: async () => { throw new Error('offline'); } });
    expect(dataset.complete).toBe(false);
    expect(dataset.data.registros).toHaveLength(0);
    expect(dataset.data.recaidas).toHaveLength(2);
  });
});

describe('seleção da exportação', () => {
  it('começa com hábitos ativos, 30 dias locais e sem texto livre', () => {
    const initial = defaultSelection({ habits: fx.habits, timezone: 'America/Sao_Paulo', now: new Date('2026-02-03T02:00:00Z') });
    expect(initial.habitIds).toEqual([fx.habits[0].id, fx.habits[2].id]);
    expect(initial.fim).toBe('2026-02-02');
    expect(initial.inicio).toBe('2026-01-04');
    for (const [type, keys] of Object.entries(initial.fields)) {
      for (const key of keys) expect(EXPORT_FIELDS[type as ExportType].find((field) => field.key === key)?.freeText).toBe(false);
    }
    expect(validateSelection(initial, fx.habits)).toEqual({});
  });

  it('rejeita intervalos invertidos, datas inválidas, hábitos alheios e tipos sem campo', () => {
    expect(validateSelection({ ...selection, fim: '2026-01-31' }, fx.habits).fim).toBeTruthy();
    expect(validateSelection({ ...selection, inicio: '2026-02-30' }, fx.habits).inicio).toBeTruthy();
    expect(validateSelection({ ...selection, inicio: '2010-01-01' }, fx.habits).fim).toBeTruthy();
    expect(validateSelection({ ...selection, habitIds: ['outra-conta'] }, fx.habits).habitIds).toBeTruthy();
    expect(validateSelection({ ...selection, types: [] }, fx.habits).types).toBeTruthy();
    expect(validateSelection({ ...selection, fields: { ...selection.fields, metas: [] } }, fx.habits).fields).toBeTruthy();
    expect(validateSelection({ ...selection, timezone: 'Lua/Base' }, fx.habits).timezone).toBeTruthy();
  });

  it('converte instantes para a data local do fuso escolhido', () => {
    expect(localDateOf('2026-02-02T02:30:00Z', 'America/Sao_Paulo')).toBe('2026-02-01');
    expect(localDateOf('2026-02-02T02:30:00Z', 'Asia/Tokyo')).toBe('2026-02-02');
    expect(localDateOf(null, 'UTC')).toBeNull();
  });
});
