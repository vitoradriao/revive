/**
 * Exportação seletiva do painel (#27): seleção, prévia e arquivos do MESMO dataset capturado.
 *
 * - Mudar a seleção descarta a prévia; uma nova captura é exigida.
 * - Cancelar, sair ou trocar de conta interrompe a coleta e descarta o dataset.
 * - Download/impressão só por ação explícita; object URLs e iframes são liberados em seguida.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileJson, Printer, Search, X } from 'lucide-react';
import { useOffline } from '../../contexts/OfflineContext';
import { deviceTimezone } from '../../utils/urge-time';
import { fieldBase, glassSurface } from '../../utils/constants';
import {
  buildPreview, collectExport, datasetToCsv, datasetToHtml, datasetToJson, defaultSelection, exportFileName,
  ExportCancelledError, EXPORT_FIELDS, EXPORT_TYPES, validateSelection,
} from '../../utils/exportData';
import Button from '../ui/Button';

const cell = (value) => (Array.isArray(value) ? value.join('; ') : value === true ? 'sim' : value === false ? 'não' : value ?? '');

function useObjectUrls() {
  const urls = useRef(new Set());
  useEffect(() => () => { urls.current.forEach((url) => URL.revokeObjectURL(url)); urls.current.clear(); }, []);
  return (content, type, name) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    urls.current.add(url);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 0);
  };
}

function printHtml(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  frame.srcdoc = html;
  frame.onload = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } finally { setTimeout(() => frame.remove(), 1000); }
  };
  document.body.appendChild(frame);
}

function Preview({ dataset, onCsv, onJson, onPrint }) {
  const preview = useMemo(() => buildPreview(dataset), [dataset]);
  return (
    <section aria-label="Prévia da exportação" className="space-y-3 border rounded-2xl p-4">
      <h3 className="font-semibold">Prévia ({preview.total} {preview.total === 1 ? 'item' : 'itens'})</h3>
      {preview.complete
        ? <p role="status">Todas as páginas dos tipos selecionados foram carregadas.</p>
        : <p role="alert"><strong>Exportação parcial.</strong> {preview.incompleteSources.length} fonte(s) não foram carregadas por completo. O arquivo será identificado como parcial.</p>}
      <p className="text-sm text-muted">
        Coleta de {new Date(dataset.collection.inicio).toLocaleString('pt-BR')} a {new Date(dataset.collection.fim).toLocaleString('pt-BR')}, sem garantia transacional entre páginas.
        {preview.pendingExcluded ? ` ${preview.pendingExcluded} pendência(s) local(is) ainda não sincronizada(s) não entram no arquivo.` : ''}
        {dataset.duplicates ? ` ${dataset.duplicates} item(ns) repetido(s) entre páginas foram descartados.` : ''}
      </p>
      {preview.types.map((type) => (
        <div key={type.type} className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="text-left font-semibold">{type.label}: {type.count}{type.complete ? '' : ' (incompleto)'}</caption>
            <thead><tr>{type.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
            <tbody>
              {type.sample.map((row, index) => (
                <tr key={index}>{['habito', ...dataset.selection.fields[type.type]].map((key) => <td key={key} className="whitespace-pre-wrap">{String(cell(row[key]))}</td>)}</tr>
              ))}
              {!type.sample.length && <tr><td colSpan={type.columns.length}>Nenhum item no período.</td></tr>}
            </tbody>
          </table>
          {type.count > type.sample.length && <p className="text-xs text-muted">Mostrando {type.sample.length} de {type.count}.</p>}
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button onClick={onCsv}><Download className="w-4 h-4 inline" /> Baixar CSV</Button>
        <Button onClick={onJson}><FileJson className="w-4 h-4 inline" /> Baixar JSON</Button>
        <Button onClick={onPrint}><Printer className="w-4 h-4 inline" /> Imprimir relatório / PDF</Button>
      </div>
    </section>
  );
}

export default function ExportPanel() {
  const { client, accountKey, snapshot, queue = [], loading } = useOffline();
  const habits = useMemo(() => snapshot?.data?.vicios || [], [snapshot]);
  // Seleção e captura pertencem a uma conta e a um conjunto de hábitos: ao mudar, a seleção
  // volta ao padrão, capturas anteriores são ignoradas e a coleta em curso é abortada.
  const scope = `${accountKey ?? ''}:${habits.map((habit) => habit.id).join(',')}`;
  const [state, setState] = useState(null);
  const [captureState, setCapture] = useState({ status: 'idle' });
  const controller = useRef(null);
  const scopeRef = useRef(scope);
  const download = useObjectUrls();
  useEffect(() => {
    scopeRef.current = scope;
    return () => controller.current?.abort();
  }, [scope]);

  if (loading || !accountKey) return <section aria-label="Exportar dados" className={`${glassSurface} rounded-3xl p-6`}><p role="status">Carregando dados da conta…</p></section>;

  const selection = state?.scope === scope ? state.value : defaultSelection({ habits, timezone: deviceTimezone() });
  const capture = captureState.scope === scope ? captureState : { status: 'idle' };
  const errors = validateSelection(selection, habits);
  const update = (patch) => {
    controller.current?.abort();
    setCapture({ status: 'idle', scope });
    setState({ scope, value: { ...selection, ...patch } });
  };
  const toggle = (list, key) => (list.includes(key) ? list.filter((item) => item !== key) : [...list, key]);

  const prepare = async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const key = accountKey, owner = scope;
    setCapture({ status: 'collecting', scope: owner });
    try {
      const dataset = await collectExport({
        selection, habits, snapshot: snapshot?.data, pendingCount: queue.length, signal: current.signal,
        isCurrent: () => scopeRef.current === owner,
        fetchPage: (path) => client.exportPage(path, key, { signal: current.signal }),
      });
      if (!current.signal.aborted && scopeRef.current === owner) setCapture({ status: 'ready', dataset, scope: owner });
    } catch (error) {
      if (current.signal.aborted || error instanceof ExportCancelledError) setCapture({ status: 'cancelled', scope: owner });
      else setCapture({ status: 'error', message: 'Não foi possível preparar a exportação. Nenhum arquivo foi gerado.', scope: owner });
    }
  };
  const cancel = () => { controller.current?.abort(); setCapture({ status: 'cancelled', scope }); };
  const dataset = capture.status === 'ready' ? capture.dataset : null;
  const generatedAt = () => new Date().toISOString();

  return (
    <section aria-label="Exportar dados" className={`${glassSurface} rounded-3xl p-6 space-y-4`}>
      <h2 className="text-2xl font-bold">Exportar dados selecionados</h2>
      <p className="text-sm text-muted">Arquivos podem conter informações pessoais. Textos escritos por você e nomes dos hábitos ficam desmarcados até você escolher incluí-los. Nada é enviado a terceiros: o arquivo só é baixado por sua ação.</p>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Hábitos</legend>
        {!habits.length && <p>Nenhum hábito disponível para exportar.</p>}
        {habits.map((habit) => (
          <label key={habit.id} className="flex items-center gap-2">
            <input type="checkbox" checked={selection.habitIds.includes(habit.id)} onChange={() => update({ habitIds: toggle(selection.habitIds, habit.id) })} />
            {habit.nome_vicio}{habit.ativo === false ? ' (arquivado)' : ''}
          </label>
        ))}
        {errors.habitIds && <p role="alert">{errors.habitIds}</p>}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <label>De<input type="date" className={fieldBase} value={selection.inicio} onChange={(event) => update({ inicio: event.target.value })} /></label>
        <label>Até (inclusive)<input type="date" className={fieldBase} value={selection.fim} onChange={(event) => update({ fim: event.target.value })} /></label>
        <label>Fuso horário IANA<input className={fieldBase} value={selection.timezone} list="export-timezones" onChange={(event) => update({ timezone: event.target.value })} /></label>
        <datalist id="export-timezones"><option value="America/Sao_Paulo" /><option value="UTC" /><option value="America/New_York" /></datalist>
      </div>
      {['inicio', 'fim', 'timezone'].map((key) => errors[key] && <p key={key} role="alert">{errors[key]}</p>)}

      <fieldset className="space-y-3">
        <legend className="font-semibold">Tipos e campos</legend>
        {EXPORT_TYPES.map((type) => {
          const on = selection.types.includes(type.key);
          return (
            <div key={type.key} className="border rounded-xl p-3">
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={on} onChange={() => update({ types: toggle(selection.types, type.key) })} />{type.label}
              </label>
              {on && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2" role="group" aria-label={`Campos de ${type.label}`}>
                  {EXPORT_FIELDS[type.key].map((field) => (
                    <label key={field.key} className="flex items-center gap-1 text-sm">
                      <input type="checkbox" checked={selection.fields[type.key].includes(field.key)}
                        onChange={() => update({ fields: { ...selection.fields, [type.key]: toggle(selection.fields[type.key], field.key) } })} />
                      {field.label}{field.freeText ? ' (texto escrito por você)' : ''}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {errors.types && <p role="alert">{errors.types}</p>}
        {errors.fields && <p role="alert">{errors.fields}</p>}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="font-semibold">Opções</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={selection.includeHabitNames} onChange={() => update({ includeHabitNames: !selection.includeHabitNames })} />Incluir nomes dos hábitos (sem isso, aparecem como “Hábito 1”, “Hábito 2”…)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={selection.includeUndatedGoals} onChange={() => update({ includeUndatedGoals: !selection.includeUndatedGoals })} />Incluir metas sem data de início</label>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" disabled={Object.keys(errors).length > 0 || capture.status === 'collecting'} onClick={prepare}>
          <Search className="w-4 h-4 inline" /> Preparar prévia
        </Button>
        {capture.status === 'collecting' && <Button onClick={cancel}><X className="w-4 h-4 inline" /> Cancelar</Button>}
      </div>
      {navigator.onLine === false && <p role="status">Sem conexão: check-ins e vontades não poderão ser carregados por completo e o arquivo sairá parcial.</p>}
      <div aria-live="polite">
        {capture.status === 'collecting' && <p role="status">Carregando todas as páginas…</p>}
        {capture.status === 'cancelled' && <p role="status">Exportação cancelada. Nenhum arquivo foi gerado.</p>}
        {capture.status === 'error' && <p role="alert">{capture.message}</p>}
      </div>
      {dataset && (
        <Preview
          dataset={dataset}
          onCsv={() => download(datasetToCsv(dataset), 'text/csv;charset=utf-8', exportFileName(dataset, 'csv'))}
          onJson={() => download(datasetToJson(dataset, generatedAt()), 'application/json;charset=utf-8', exportFileName(dataset, 'json'))}
          onPrint={() => printHtml(datasetToHtml(dataset, generatedAt()))}
        />
      )}
    </section>
  );
}
