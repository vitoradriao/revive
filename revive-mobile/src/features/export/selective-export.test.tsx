import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { apiFetch } from '@/core/api/client';
import { printExportHtml, shareExportFile } from '@/core/export/reporting';
import { useSession } from '@/features/auth/session-context';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { SelectiveExport } from './selective-export';

jest.mock('lucide-react-native', () => ({ Eye: () => null, EyeOff: () => null }));
jest.mock('@/core/api/client', () => ({ apiFetch: jest.fn() }));
jest.mock('@/core/export/reporting', () => ({ shareExportFile: jest.fn(), printExportHtml: jest.fn() }));
jest.mock('@/features/auth/session-context', () => ({ useSession: jest.fn() }));
jest.mock('@/features/bootstrap/use-bootstrap', () => ({ useBootstrap: jest.fn() }));

const fx = JSON.parse(readFileSync(join(__dirname, '../../../../tests/fixtures/export-selection.json'), 'utf8'));
const pageFor = (requested: string) => {
  const url = new URL(requested, 'http://x');
  const key = Object.keys(fx.pages).find((candidate) => {
    const other = new URL(candidate, 'http://x');
    return other.pathname === url.pathname && other.searchParams.get('vicio_id') === url.searchParams.get('vicio_id')
      && other.searchParams.get('cursor') === url.searchParams.get('cursor');
  });
  return key ? fx.pages[key] : { registros: [], vontades: [], next_cursor: null };
};
const bootstrap = { vicios: fx.habits, registros: [{ id: 'local', vicio_id: fx.habits[0].id, data_registro: '2026-02-01', pending: true }],
  recaidas: fx.snapshot.recaidas, metas: fx.snapshot.metas, usuario: fx.snapshot.usuario };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useSession).mockReturnValue({ user: { id: 'conta-a' } } as never);
  jest.mocked(useBootstrap).mockReturnValue({ data: bootstrap, isLoading: false } as never);
  jest.mocked(apiFetch).mockImplementation((async (path: string) => pageFor(path)) as never);
  jest.mocked(shareExportFile).mockResolvedValue(undefined);
});

it('mantém texto livre e nomes desmarcados e compartilha o arquivo do mesmo dataset da prévia', async () => {
  await render(<SelectiveExport />);
  expect(screen.getByLabelText('Observações (texto escrito por você)').props.accessibilityState.checked).toBe(false);
  expect(screen.getByLabelText('Incluir nomes dos hábitos').props.accessibilityState.checked).toBe(false);
  await fireEvent.press(screen.getByText('Preparar prévia'));
  await screen.findByText(/^Prévia \(/);
  expect(screen.getByText(/1 pendência\(s\) ainda não sincronizada/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Compartilhar CSV'));
  const [, csv] = jest.mocked(shareExportFile).mock.calls[0]!;
  for (const sentinel of fx.sentinels as string[]) expect(csv).not.toContain(sentinel);
  expect(printExportHtml).not.toHaveBeenCalled();
});

it('descarta a prévia ao mudar a seleção', async () => {
  await render(<SelectiveExport />);
  await fireEvent.press(screen.getByText('Preparar prévia'));
  await screen.findByText(/^Prévia \(/);
  await fireEvent.press(screen.getByLabelText('Incluir nomes dos hábitos'));
  expect(screen.queryByText(/^Prévia \(/)).toBeNull();
});

it('cancela a coleta sem gerar arquivo', async () => {
  let release: (value: unknown) => void = () => undefined;
  jest.mocked(apiFetch).mockImplementation((() => new Promise((resolve) => { release = resolve; })) as never);
  await render(<SelectiveExport />);
  await fireEvent.press(screen.getByText('Preparar prévia'));
  await fireEvent.press(await screen.findByText('Cancelar exportação'));
  await act(async () => { release({ registros: [], next_cursor: null }); });
  expect(screen.getByText('Exportação cancelada. Nenhum arquivo foi gerado.')).toBeTruthy();
  expect(screen.queryByText('Compartilhar CSV')).toBeNull();
  expect(shareExportFile).not.toHaveBeenCalled();
});

it('identifica exportação parcial quando uma página falha', async () => {
  jest.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (new URL(path, 'http://x').searchParams.get('cursor') === 'c1') throw new Error('rede');
    return pageFor(path);
  }) as never);
  await render(<SelectiveExport />);
  await fireEvent.press(screen.getByText('Preparar prévia'));
  await waitFor(() => expect(screen.getByText(/^Exportação parcial:/)).toBeTruthy());
});
