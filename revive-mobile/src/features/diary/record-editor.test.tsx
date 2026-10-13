import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { RecordEditor } from './record-editor';
import { editRecord } from './edit-record';
import { reviveApi } from '@/core/api/repositories';
import { getPendingMutations } from '@/core/storage/database';

jest.mock('lucide-react-native', () => ({ Eye: () => null, EyeOff: () => null }));
jest.mock('./edit-record', () => ({ editRecord: jest.fn() }));
jest.mock('@/features/auth/session-context', () => ({ useSession: () => ({ user: { id: 'a' } }) }));
jest.mock('@/core/auth/token-store', () => ({ tokenStore: { getGeneration: () => 1, isCurrent: () => true, getUser: async () => ({ id: 'a' }) } }));
jest.mock('@/core/storage/database', () => ({ getPendingMutations: jest.fn() }));
jest.mock('@/core/api/repositories', () => ({ reviveApi: { getRecord: jest.fn() } }));
const record = { id: 'record', vicio_id: 'habit', data_registro: '2026-10-04', revision: 1, humor: 'Original', observacoes: 'Local' };
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getPendingMutations).mockResolvedValue([]);
  jest.mocked(editRecord).mockResolvedValue({ id: 'edit', status: 'queued' });
});
it('saves only changed fields and preserves legacy long text without truncation', async () => {
  await render(<RecordEditor record={{ ...record, observacoes: 'L'.repeat(2000) }} />);
  await fireEvent.changeText(screen.getByLabelText('Humor'), 'Corrected');
  await fireEvent.press(screen.getByText('Salvar correção'));
  await waitFor(() => expect(editRecord).toHaveBeenCalledWith('a', expect.anything(), { expected_version: 1, humor: 'Corrected' }, undefined));
  expect(screen.getByLabelText('Observações').props.value).toHaveLength(2000);
});
it('preserves draft on failure, rejects oversize changes, without clearing the draft', async () => {
  jest.mocked(editRecord).mockRejectedValue(new Error('Failure'));
  await render(<RecordEditor record={record} />);
  await fireEvent.changeText(screen.getByLabelText('Humor'), 'h'.repeat(101));
  await fireEvent.press(screen.getByText('Salvar correção'));
  expect(editRecord).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Humor'), 'Corrected');
  await fireEvent.press(screen.getByText('Salvar correção'));
  await waitFor(() => expect(screen.getByText('Failure')).toBeTruthy());
  expect(screen.getByLabelText('Humor').props.value).toBe('Corrected');
});
it('loads a remote conflict alongside the local text and reapplies only after explicit action', async () => {
  jest.mocked(getPendingMutations).mockResolvedValue([{ id: 'failed-edit', type: 'record.update', status: 'failed', payload: { recordId: 'record' } }] as never);
  jest.mocked(reviveApi.getRecord).mockResolvedValue({ registro: { ...record, revision: 2, observacoes: 'Remote' } });
  await render(<RecordEditor record={record} />);
  await fireEvent.changeText(screen.getByLabelText('Observações'), 'Local preserved');
  await fireEvent.press(screen.getByText('Consultar versão remota sem apagar meu texto'));
  await waitFor(() => expect(screen.getByText('Versão remota 2')).toBeTruthy());
  expect(screen.getByLabelText('Observações').props.value).toBe('Local preserved');
  expect(editRecord).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Reaplicar meu texto nesta versão'));
  await waitFor(() => expect(editRecord).toHaveBeenCalledWith('a',record,{expected_version:2,observacoes:'Local preserved'},'failed-edit'));
});
it('keeps the original expected version when remote props change while a draft is being edited', async () => {
  const rendered = await render(<RecordEditor record={record} />);
  await fireEvent.changeText(screen.getByLabelText('Humor'), 'Local edited');
  await rendered.rerender(<RecordEditor record={{ ...record, revision: 2, humor: 'Remote' }} />);
  await fireEvent.press(screen.getByText('Salvar correção'));
  await waitFor(() => expect(editRecord).toHaveBeenCalledWith('a', expect.anything(), { expected_version: 1, humor: 'Local edited' }, undefined));
});

it('blocks a second press while the durable save is still running', async () => {
  let finish!: (receipt: { id: string; status: 'queued' }) => void;
  jest.mocked(editRecord).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(<RecordEditor record={record} />);
  await fireEvent.changeText(screen.getByLabelText('Humor'), 'Corrected');
  await fireEvent.press(screen.getByText('Salvar correção'));
  await waitFor(() => expect(editRecord).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByRole('button', { name: 'Salvar correção' }));
  expect(editRecord).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ id: 'edit', status: 'queued' }); });
});
