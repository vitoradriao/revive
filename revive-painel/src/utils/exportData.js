/**
 * Exportação seletiva do REVIVE (#27), segunda fatia.
 *
 * Núcleo sem dependência de interface: seleção, coleta paginada, projeção por
 * allowlist e serializadores (CSV, JSON e HTML) derivados do MESMO dataset.
 * O mobile tem implementação equivalente em
 * revive-mobile/src/core/export/selection.ts, validada pela mesma fixture
 * (tests/fixtures/export-selection.json).
 */
import { toCsv } from './csv.js';

export const EXPORT_SCHEMA_VERSION = 2;
export const EXPORT_PAGE_LIMIT = 100;
export const EXPORT_MAX_DAYS = 3660;

export const EXPORT_TYPES = [
  { key: 'registros', label: 'Check-ins do diário' },
  { key: 'vontades', label: 'Vontades' },
  { key: 'recaidas', label: 'Recaídas' },
  { key: 'metas', label: 'Metas' },
];

// Allowlist por tipo. Somente estes campos podem sair do aparelho/navegador.
// freeText: escrito livremente pela pessoa; sempre desmarcado por padrão.
export const EXPORT_FIELDS = {
  registros: [
    { key: 'data_registro', label: 'Data', freeText: false },
    { key: 'humor', label: 'Humor', freeText: false },
    { key: 'gatilhos', label: 'Gatilhos (texto)', freeText: true },
    { key: 'conquistas', label: 'Conquistas (texto)', freeText: true },
    { key: 'observacoes', label: 'Observações', freeText: true },
  ],
  vontades: [
    { key: 'occurred_at', label: 'Momento', freeText: false },
    { key: 'timezone', label: 'Fuso do registro', freeText: false },
    { key: 'intensidade', label: 'Intensidade (0 a 10)', freeText: false },
    { key: 'gatilhos', label: 'Gatilhos (catálogo)', freeText: false },
    { key: 'nota', label: 'Nota', freeText: true },
    { key: 'acao_realizada', label: 'Ação realizada', freeText: true },
    { key: 'resultado', label: 'Resultado', freeText: true },
  ],
  recaidas: [
    { key: 'data_recaida', label: 'Momento', freeText: false },
    { key: 'dias_abstinencia_perdidos', label: 'Dias da sequência encerrada', freeText: false },
    { key: 'motivo', label: 'Motivo', freeText: true },
  ],
  metas: [
    { key: 'data_inicio_meta', label: 'Início', freeText: false },
    { key: 'dias_objetivo', label: 'Dias objetivo', freeText: false },
    { key: 'valor_objetivo', label: 'Valor objetivo', freeText: false },
    { key: 'concluida', label: 'Concluída', freeText: false },
    { key: 'descricao_meta', label: 'Descrição', freeText: true },
  ],
};

// Campo que define a data local de cada tipo (para recorte e ordenação).
const DATE_FIELD = { registros: 'data_registro', vontades: 'occurred_at', recaidas: 'data_recaida', metas: 'data_inicio_meta' };

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86400000;

export class ExportCancelledError extends Error {
  constructor() { super('Exportação cancelada.'); this.name = 'ExportCancelledError'; this.code = 'EXPORTACAO_CANCELADA'; }
}

export const isValidLocalDate = (value) => {
  if (typeof value !== 'string' || !LOCAL_DATE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};

export const isValidTimezone = (value) => {
  if (typeof value !== 'string' || !value) return false;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: value }); return true; } catch { return false; }
};

/** Data civil (YYYY-MM-DD) de um instante no fuso informado. */
export const localDateOf = (value, timezone) => {
  if (value == null || value === '') return null;
  const text = String(value);
  if (LOCAL_DATE.test(text)) return text;
  const iso = /(?:z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(time));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const shiftDate = (date, days) => new Date(Date.parse(`${date}T00:00:00.000Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);

/** Seleção inicial: hábitos ativos, últimos 30 dias locais, todos os tipos, sem texto livre e sem nomes. */
export const defaultSelection = ({ habits = [], timezone, now = new Date() }) => {
  const today = localDateOf(now.toISOString(), timezone);
  return {
    habitIds: habits.filter((habit) => habit.ativo !== false).map((habit) => habit.id),
    inicio: shiftDate(today, -29),
    fim: today,
    timezone,
    types: EXPORT_TYPES.map((type) => type.key),
    fields: Object.fromEntries(Object.entries(EXPORT_FIELDS)
      .map(([type, fields]) => [type, fields.filter((field) => !field.freeText).map((field) => field.key)])),
    includeHabitNames: false,
    includeUndatedGoals: false,
  };
};

/** Retorna erros por campo; objeto vazio quando a seleção é válida. */
export const validateSelection = (selection, habits = []) => {
  const errors = {};
  const known = new Set(habits.map((habit) => habit.id));
  if (!selection.habitIds?.length) errors.habitIds = 'Selecione ao menos um hábito.';
  else if (selection.habitIds.some((id) => !known.has(id))) errors.habitIds = 'Há hábito que não pertence a esta conta.';
  if (!isValidLocalDate(selection.inicio)) errors.inicio = 'Informe uma data inicial válida.';
  if (!isValidLocalDate(selection.fim)) errors.fim = 'Informe uma data final válida.';
  else if (isValidLocalDate(selection.inicio)) {
    const days = (Date.parse(selection.fim) - Date.parse(selection.inicio)) / MS_PER_DAY;
    if (days < 0) errors.fim = 'A data final deve ser igual ou posterior à inicial.';
    else if (days > EXPORT_MAX_DAYS) errors.fim = 'Use um intervalo de até dez anos.';
  }
  if (!isValidTimezone(selection.timezone)) errors.timezone = 'Informe um fuso válido.';
  const types = (selection.types || []).filter((type) => EXPORT_FIELDS[type]);
  if (!types.length) errors.types = 'Selecione ao menos um tipo de registro.';
  else if (types.some((type) => !(selection.fields?.[type] || []).length)) errors.fields = 'Cada tipo selecionado precisa de ao menos um campo.';
  return errors;
};

/** Cópia congelada contendo apenas chaves conhecidas, na ordem da allowlist. */
export const freezeSelection = (selection, habits = []) => {
  const order = new Map(habits.map((habit, index) => [habit.id, index]));
  const types = EXPORT_TYPES.map((type) => type.key).filter((key) => selection.types.includes(key));
  return Object.freeze({
    habitIds: Object.freeze([...new Set(selection.habitIds)].sort((a, b) => order.get(a) - order.get(b))),
    inicio: selection.inicio,
    fim: selection.fim,
    timezone: selection.timezone,
    types: Object.freeze(types),
    fields: Object.freeze(Object.fromEntries(types.map((type) => [type, Object.freeze(EXPORT_FIELDS[type]
      .map((field) => field.key).filter((key) => selection.fields[type].includes(key)))]))),
    includeHabitNames: selection.includeHabitNames === true,
    includeUndatedGoals: selection.includeUndatedGoals === true,
  });
};

const project = (row, keys) => Object.fromEntries(keys.map((key) => {
  const value = row[key];
  return [key, Array.isArray(value) ? [...value] : value ?? null];
}));

const inRange = (date, selection) => date != null && date >= selection.inicio && date <= selection.fim;

/**
 * Coleta todas as páginas dos tipos selecionados e projeta pela allowlist.
 *
 * - fetchPage(path) devolve o JSON da API v2 (registros/vontades paginados).
 * - snapshot: bootstrap local (recaídas e metas vêm completas no bootstrap).
 * - Falha em qualquer página marca a fonte como incompleta; o dataset fica `parcial`.
 * - signal/isCurrent interrompem a coleta (cancelamento ou troca de conta).
 */
export async function collectExport({ selection: input, habits, snapshot, fetchPage, signal, isCurrent = () => true, now = () => new Date(), pendingCount = 0 }) {
  const selection = freezeSelection(input, habits);
  const check = () => { if (signal?.aborted || !isCurrent()) throw new ExportCancelledError(); };
  check();
  const startedAt = now().toISOString();
  const sources = [];
  const rows = Object.fromEntries(selection.types.map((type) => [type, []]));
  const seen = Object.fromEntries(selection.types.map((type) => [type, new Set()]));
  let duplicates = 0;
  const selected = new Set(selection.habitIds);
  const accept = (type, row) => {
    if (!row || !selected.has(row.vicio_id)) return;
    if (row.id != null) {
      if (seen[type].has(row.id)) { duplicates += 1; return; }
      seen[type].add(row.id);
    }
    rows[type].push({ vicio_id: row.vicio_id, ...project(row, selection.fields[type]), __date: row[DATE_FIELD[type]] ?? null });
  };

  const paged = async (type, habitId, buildPath, listKey) => {
    const source = { tipo: type, habito: habitId, origem: 'api_paginada', paginas: 0, itens: 0, completa: false, erro: null };
    sources.push(source);
    let cursor = null;
    try {
      do {
        check();
        const page = await fetchPage(buildPath(cursor));
        check();
        const items = Array.isArray(page?.[listKey]) ? page[listKey] : [];
        source.paginas += 1;
        source.itens += items.length;
        items.forEach((item) => accept(type, item));
        const next = page?.next_cursor || null;
        if (next && next === cursor) throw new Error('Cursor repetido na paginação.');
        cursor = next;
      } while (cursor);
      source.completa = true;
    } catch (error) {
      if (error instanceof ExportCancelledError) throw error;
      if (error?.code === 'SESSAO_ALTERADA') throw new ExportCancelledError();
      check();
      source.erro = 'Falha ao carregar uma página. Os itens anteriores foram mantidos, mas o tipo está incompleto.';
    }
  };

  for (const habitId of selection.habitIds) {
    if (selection.types.includes('registros')) {
      await paged('registros', habitId, (cursor) => `/v2/registros?${new URLSearchParams({
        inicio: selection.inicio, fim: selection.fim, vicio_id: habitId, limit: String(EXPORT_PAGE_LIMIT), ...(cursor ? { cursor } : {}),
      })}`, 'registros');
    }
    if (selection.types.includes('vontades')) {
      await paged('vontades', habitId, (cursor) => `/v2/vontades?${new URLSearchParams({
        vicio_id: habitId, inicio: selection.inicio, fim: selection.fim, timezone: selection.timezone,
        limit: String(EXPORT_PAGE_LIMIT), ...(cursor ? { cursor } : {}),
      })}`, 'vontades');
    }
  }
  check();

  const snapshotSource = (type, list, filter) => {
    const available = Array.isArray(list);
    sources.push({ tipo: type, habito: null, origem: 'snapshot_local', paginas: available ? 1 : 0,
      itens: available ? list.length : 0, completa: available, erro: available ? null : 'Cópia local sem este tipo de registro.' });
    (available ? list : []).filter(filter).forEach((row) => accept(type, row));
  };
  if (selection.types.includes('recaidas')) {
    snapshotSource('recaidas', snapshot?.recaidas, (row) => inRange(localDateOf(row.data_recaida, selection.timezone), selection));
  }
  if (selection.types.includes('metas')) {
    snapshotSource('metas', snapshot?.metas, (row) => {
      const date = localDateOf(row.data_inicio_meta, selection.timezone);
      return date == null ? selection.includeUndatedGoals : inRange(date, selection);
    });
  }
  // Registros com data fora do intervalo (legado com horário) não entram silenciosamente.
  if (rows.registros) rows.registros = rows.registros.filter((row) => inRange(localDateOf(row.__date, selection.timezone), selection));

  const habitById = new Map(habits.map((habit) => [habit.id, habit]));
  const habitRefs = selection.habitIds.map((id, index) => {
    const habit = habitById.get(id) || {};
    const progress = habit.progresso || null;
    return {
      vicio_id: id,
      referencia: selection.includeHabitNames ? String(habit.nome_vicio ?? `Hábito ${index + 1}`) : `Hábito ${index + 1}`,
      arquivado: habit.ativo === false,
      indicadores_na_geracao: progress ? {
        sequencia_atual_dias: progress.sequencia_atual_dias ?? null,
        sequencia_atual_cobertura: progress.sequencia_atual_cobertura ?? 'unknown',
        recorde_dias: progress.recorde_dias ?? null,
        recorde_cobertura: progress.recorde_cobertura ?? 'unknown',
        economia_acumulada_estimada: progress.economia_acumulada?.valor_estimado ?? null,
        economia_acumulada_cobertura: progress.economia_acumulada?.cobertura ?? 'unknown',
      } : null,
    };
  });
  const refById = new Map(habitRefs.map((ref) => [ref.vicio_id, ref.referencia]));
  const data = Object.fromEntries(Object.entries(rows).map(([type, list]) => [type, list
    .sort((a, b) => String(a.__date ?? '').localeCompare(String(b.__date ?? '')) || refById.get(a.vicio_id).localeCompare(refById.get(b.vicio_id)))
    .map((row) => {
      const { vicio_id: habitId, __date: _ignored, ...fields } = row;
      return Object.freeze({ habito: refById.get(habitId), ...fields });
    })]));

  const finishedAt = now().toISOString();
  return Object.freeze({
    selection,
    collection: Object.freeze({ inicio: startedAt, fim: finishedAt }),
    complete: sources.every((source) => source.completa),
    sources: Object.freeze(sources.map((source) => Object.freeze({ ...source, habito: source.habito == null ? null : refById.get(source.habito) }))),
    duplicates,
    pendingExcluded: pendingCount,
    habits: Object.freeze(habitRefs.map((ref) => Object.freeze({ referencia: ref.referencia, arquivado: ref.arquivado, indicadores_na_geracao: ref.indicadores_na_geracao }))),
    data: Object.freeze(data),
  });
}

const fieldLabel = (type, key) => EXPORT_FIELDS[type].find((field) => field.key === key)?.label || key;

/** Prévia derivada do dataset capturado: contagens, colunas e primeiras linhas por tipo. */
export const buildPreview = (dataset, sampleSize = 3) => ({
  complete: dataset.complete,
  total: Object.values(dataset.data).reduce((sum, list) => sum + list.length, 0),
  types: dataset.selection.types.map((type) => ({
    type,
    label: EXPORT_TYPES.find((item) => item.key === type).label,
    count: dataset.data[type].length,
    columns: ['Hábito', ...dataset.selection.fields[type].map((key) => fieldLabel(type, key))],
    sample: dataset.data[type].slice(0, sampleSize),
    complete: dataset.sources.filter((source) => source.tipo === type).every((source) => source.completa),
  })),
  incompleteSources: dataset.sources.filter((source) => !source.completa),
  pendingExcluded: dataset.pendingExcluded,
});

const cellValue = (value) => {
  if (Array.isArray(value)) return value.join('; ');
  if (value === true) return 'sim';
  if (value === false) return 'não';
  return value;
};

/** CSV único com coluna de tipo; colunas = união dos campos selecionados, na ordem da allowlist. */
export const datasetToCsv = (dataset) => {
  const columns = [];
  dataset.selection.types.forEach((type) => dataset.selection.fields[type].forEach((key) => {
    if (!columns.includes(key)) columns.push(key);
  }));
  const header = ['tipo', 'habito', ...columns, 'exportacao'];
  const status = dataset.complete ? 'completa' : 'parcial';
  const rows = dataset.selection.types.flatMap((type) => dataset.data[type].map((row) => [
    type, row.habito, ...columns.map((key) => (dataset.selection.fields[type].includes(key) ? cellValue(row[key]) : '')), status,
  ]));
  return toCsv(header, rows);
};

/** Envelope JSON documentando seleção efetiva, coleta e cobertura. Sem ids de conta, e-mail ou tokens. */
export const datasetToJson = (dataset, generatedAt) => JSON.stringify({
  schemaVersion: EXPORT_SCHEMA_VERSION,
  generated_at: generatedAt,
  escopo: 'selecao',
  selecao: {
    inicio: dataset.selection.inicio,
    fim: dataset.selection.fim,
    timezone: dataset.selection.timezone,
    tipos: dataset.selection.types,
    campos: dataset.selection.fields,
    nomes_dos_habitos: dataset.selection.includeHabitNames,
    metas_sem_data: dataset.selection.includeUndatedGoals,
  },
  coleta: {
    inicio: dataset.collection.inicio,
    fim: dataset.collection.fim,
    consistencia: 'sem_snapshot_transacional',
  },
  cobertura: {
    completa: dataset.complete,
    fontes: dataset.sources,
    duplicados_descartados: dataset.duplicates,
    pendencias_locais_nao_incluidas: dataset.pendingExcluded,
  },
  habitos: dataset.habits,
  dados: dataset.data,
}, null, 2);

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const COVERAGE_LABEL = { confirmed: 'confirmado', inferred: 'estimado', unknown: 'histórico parcial' };

/** Relatório imprimível com todo conteúdo escapado. */
export const datasetToHtml = (dataset, generatedAt) => {
  const s = dataset.selection;
  const habitRows = dataset.habits.map((habit) => {
    const ind = habit.indicadores_na_geracao;
    const text = (value, coverage, unit) => (value == null ? 'Indisponível' : `${value}${unit} (${COVERAGE_LABEL[coverage] || coverage})`);
    return `<tr><th scope="row">${escapeHtml(habit.referencia)}${habit.arquivado ? ' (arquivado)' : ''}</th>`
      + `<td>${escapeHtml(ind ? text(ind.sequencia_atual_dias, ind.sequencia_atual_cobertura, ' dias') : 'Indisponível')}</td>`
      + `<td>${escapeHtml(ind ? text(ind.recorde_dias, ind.recorde_cobertura, ' dias') : 'Indisponível')}</td>`
      + `<td>${escapeHtml(ind ? text(ind.economia_acumulada_estimada, ind.economia_acumulada_cobertura, '') : 'Indisponível')}</td></tr>`;
  }).join('');
  const tables = s.types.map((type) => {
    const keys = s.fields[type];
    const label = EXPORT_TYPES.find((item) => item.key === type).label;
    const body = dataset.data[type].map((row) => `<tr><td>${escapeHtml(row.habito)}</td>${keys.map((key) => `<td>${escapeHtml(cellValue(row[key]))}</td>`).join('')}</tr>`).join('');
    return `<section><h2>${escapeHtml(label)} (${dataset.data[type].length})</h2><table><thead><tr><th scope="col">Hábito</th>${keys.map((key) => `<th scope="col">${escapeHtml(fieldLabel(type, key))}</th>`).join('')}</tr></thead>`
      + `<tbody>${body || `<tr><td colspan="${keys.length + 1}">Nenhum item no período.</td></tr>`}</tbody></table></section>`;
  }).join('');
  const partial = dataset.complete ? '' : '<p class="alerta"><strong>Exportação parcial:</strong> uma ou mais fontes não foram carregadas por completo. Não use este relatório como histórico completo.</p>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório REVIVE</title>`
    + '<style>body{font-family:system-ui,sans-serif;color:#142033;padding:24px}table{border-collapse:collapse;width:100%;margin:8px 0 20px}th,td{border:1px solid #ccd7d2;padding:4px 6px;text-align:left;vertical-align:top;white-space:pre-wrap}.alerta{border:2px solid #b42318;padding:8px}</style></head><body>'
    + `<h1>Relatório REVIVE</h1><p>Período: ${escapeHtml(s.inicio)} a ${escapeHtml(s.fim)} (${escapeHtml(s.timezone)}), datas inclusivas.</p>`
    + `<p>Gerado em ${escapeHtml(generatedAt)}. Coleta de ${escapeHtml(dataset.collection.inicio)} a ${escapeHtml(dataset.collection.fim)}, sem garantia transacional entre páginas. Pendências locais ainda não sincronizadas não incluídas: ${escapeHtml(dataset.pendingExcluded)}.</p>${partial}`
    + '<h2>Indicadores na geração</h2><p>Valores no momento da geração, com a cobertura indicada. Não são resultado exclusivo do período selecionado; economia é estimativa, não saldo financeiro.</p>'
    + `<table><thead><tr><th scope="col">Hábito</th><th scope="col">Sequência atual</th><th scope="col">Recorde</th><th scope="col">Economia acumulada estimada (R$)</th></tr></thead><tbody>${habitRows}</tbody></table>`
    + `${tables}</body></html>`;
};

/** Nome neutro de arquivo, sem nomes de hábitos ou dados pessoais. */
export const exportFileName = (dataset, extension) => `revive-${dataset.selection.inicio}-a-${dataset.selection.fim}${dataset.complete ? '' : '-parcial'}.${extension}`;
