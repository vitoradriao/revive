import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../tests/fixtures');
const fx = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'export-selection.json'), 'utf8'));
let offline;
vi.mock('../../contexts/OfflineContext', () => ({ useOffline: () => offline }));
vi.mock('../../utils/urge-time', () => ({ deviceTimezone: () => 'America/Sao_Paulo' }));

import ExportPanel from './ExportPanel';

const pageFor = (requested) => {
  // A seleção padrão usa a data atual: responde qualquer intervalo com as páginas da fixture do mesmo hábito/cursor.
  const url = new URL(requested, 'http://x');
  const key = Object.keys(fx.pages).find((candidate) => {
    const other = new URL(candidate, 'http://x');
    return other.pathname === url.pathname && other.searchParams.get('vicio_id') === url.searchParams.get('vicio_id')
      && other.searchParams.get('cursor') === url.searchParams.get('cursor');
  });
  return key ? fx.pages[key] : { registros: [], vontades: [], next_cursor: null };
};

describe('ExportPanel', () => {
  let blobs;
  beforeEach(() => {
    blobs = [];
    offline = {
      accountKey: 'conta-a', loading: false, queue: [{ id: 'pendente' }],
      snapshot: { data: { vicios: fx.habits, recaidas: fx.snapshot.recaidas, metas: fx.snapshot.metas, usuario: fx.snapshot.usuario } },
      client: { exportPage: vi.fn(async (requested) => pageFor(requested)) },
    };
    globalThis.URL.createObjectURL = vi.fn((blob) => { blobs.push(blob); return `blob:${blobs.length}`; });
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('mantém texto livre e nomes desmarcados e gera prévia e arquivo do mesmo dataset', async () => {
    render(<ExportPanel />);
    expect(screen.getByLabelText(/Observações/)).not.toBeChecked();
    expect(screen.getByLabelText(/Incluir nomes dos hábitos/)).not.toBeChecked();
    expect(screen.getByLabelText(/Incluir metas sem data/)).not.toBeChecked();
    fireEvent.click(screen.getByText(/Preparar prévia/));
    await screen.findByLabelText('Prévia da exportação');
    expect(screen.getByText(/1 pendência\(s\) local\(is\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Baixar CSV/));
    const csv = await new Response(blobs[0]).text();
    for (const sentinel of fx.sentinels) expect(csv).not.toContain(sentinel);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1'));
  });

  it('descarta a prévia quando a seleção muda', async () => {
    render(<ExportPanel />);
    fireEvent.click(screen.getByText(/Preparar prévia/));
    await screen.findByLabelText('Prévia da exportação');
    fireEvent.click(screen.getByLabelText(/Incluir nomes dos hábitos/));
    expect(screen.queryByLabelText('Prévia da exportação')).not.toBeInTheDocument();
  });

  it('cancela a coleta sem gerar arquivo', async () => {
    let release;
    offline.client.exportPage = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    render(<ExportPanel />);
    fireEvent.click(screen.getByText(/Preparar prévia/));
    fireEvent.click(await screen.findByText(/Cancelar/));
    await act(async () => { release({ registros: [], next_cursor: null }); });
    expect(screen.getByText(/Exportação cancelada/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Prévia da exportação')).not.toBeInTheDocument();
    expect(blobs).toHaveLength(0);
  });

  it('identifica exportação parcial quando uma página falha', async () => {
    offline.client.exportPage = vi.fn(async (requested) => {
      if (new URL(requested, 'http://x').searchParams.get('cursor') === 'c1') throw new Error('rede');
      return pageFor(requested);
    });
    render(<ExportPanel />);
    fireEvent.click(screen.getByText(/Preparar prévia/));
    await waitFor(() => expect(screen.getByText(/Exportação parcial\./)).toBeInTheDocument());
  });
});
