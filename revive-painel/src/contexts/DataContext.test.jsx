import React from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider, useData } from './DataContext';

const {
  mockAuthState,
  mockShowToast,
  mockSetLoading,
  mockShowConfirm,
  mockListarVicios,
  mockCriarVicio
} = vi.hoisted(() => ({
  mockAuthState: {
    token: 'test-token',
    user: { id: 'user-1' }
  },
  mockShowToast: vi.fn(),
  mockSetLoading: vi.fn(),
  mockShowConfirm: vi.fn(),
  mockListarVicios: vi.fn(),
  mockCriarVicio: vi.fn()
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => mockAuthState
}));

vi.mock('./UIContext', () => ({
  useUI: () => ({
    showToast: mockShowToast,
    setLoading: mockSetLoading,
    showConfirm: mockShowConfirm
  })
}));

vi.mock('../services/vicios.service', () => ({
  listarVicios: mockListarVicios,
  buscarVicio: vi.fn(),
  criarVicio: mockCriarVicio,
  excluirVicio: vi.fn(),
  registrarRecaida: vi.fn()
}));

vi.mock('../services/metas.service', () => ({
  listarMetas: vi.fn().mockResolvedValue({ metas: [] }),
  criarMeta: vi.fn(),
  completarMeta: vi.fn(),
  excluirMeta: vi.fn()
}));

vi.mock('../services/recaidas.service', () => ({
  listarRecaidas: vi.fn().mockResolvedValue({ recaidas: [] })
}));

vi.mock('../services/mensagens.service', () => ({
  getMensagemDiaria: vi.fn().mockResolvedValue({ mensagem: { mensagem: 'Siga firme' } })
}));

vi.mock('../services/registros.service', () => ({
  listarRegistros: vi.fn().mockResolvedValue({ registros: [] }),
  criarRegistro: vi.fn()
}));

function Dummy() {
  const { addictions } = useData();
  return (
    <div>
      <span>Data provider mounted</span>
      <span data-testid="addictions">{addictions.map(addiction => addiction.nome_vicio).join(',')}</span>
    </div>
  );
}

describe('DataContext error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.token = 'test-token';
    mockAuthState.user = { id: 'user-1' };
    mockListarVicios.mockRejectedValue(new Error('erro de teste'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows toast when addictions loading fails', async () => {
    render(
      <DataProvider>
        <Dummy />
      </DataProvider>
    );

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Nao foi possivel carregar seus vicios.');
    });
  });

  it('clears user data immediately when the authenticated user changes', async () => {
    mockListarVicios
      .mockResolvedValueOnce({
        vicios: [{
          id: 'vicio-1',
          nome_vicio: 'Cigarro',
          data_inicio: new Date().toISOString(),
          valor_economizado_por_dia: 0
        }]
      })
      .mockReturnValueOnce(new Promise(() => {}));

    const { rerender, getByTestId } = render(
      <DataProvider>
        <Dummy />
      </DataProvider>
    );

    await waitFor(() => {
      expect(getByTestId('addictions')).toHaveTextContent('Cigarro');
    });

    mockAuthState.token = 'second-token';
    mockAuthState.user = { id: 'user-2' };

    rerender(
      <DataProvider>
        <Dummy />
      </DataProvider>
    );

    await waitFor(() => {
      expect(getByTestId('addictions')).toHaveTextContent('');
    });
  });
});

describe('DataContext confirmed creation', () => {
  const payload = { nome_vicio: 'Café', data_inicio: '2026-10-01', valor_economizado_por_dia: 12.5 };
  const habit = { ...payload, id: 'habit-1' };
  const wrapper = ({ children }) => <DataProvider>{children}</DataProvider>;
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.token = 'test-token';
    mockAuthState.user = { id: 'user-1' };
    mockListarVicios.mockReset().mockResolvedValue({ vicios: [] });
    mockCriarVicio.mockReset();
  });
  it('propagates creation failure instead of reporting success', async () => {
    mockCriarVicio.mockRejectedValue(new Error('Não foi possível salvar'));
    const { result } = renderHook(() => useData(), { wrapper });
    await waitFor(() => expect(mockListarVicios).toHaveBeenCalled());
    await act(async () => { await expect(result.current.createAddiction(payload)).rejects.toThrow('Não foi possível salvar'); });
    expect(mockShowToast).not.toHaveBeenCalledWith('success', expect.anything());
    expect(result.current.addictions).toEqual([]);
  });
  it('keeps confirmed habit when the subsequent refresh fails', async () => {
    mockCriarVicio.mockResolvedValue({ vicio: habit });
    const { result } = renderHook(() => useData(), { wrapper });
    await waitFor(() => expect(mockListarVicios).toHaveBeenCalledOnce());
    mockListarVicios.mockRejectedValueOnce(new Error('network'));
    await act(async () => { await expect(result.current.createAddiction(payload)).resolves.toEqual({ vicio: habit }); });
    expect(result.current.addictions).toEqual([expect.objectContaining(habit)]);
    expect(mockCriarVicio).toHaveBeenCalledOnce();
    expect(mockShowToast).toHaveBeenCalledWith('success', 'Hábito criado com sucesso!');
  });
  it('returns the POST confirmation without waiting for a stalled list refresh', async () => {
    mockCriarVicio.mockResolvedValue({ vicio: habit });
    const { result } = renderHook(() => useData(), { wrapper });
    await waitFor(() => expect(mockListarVicios).toHaveBeenCalledOnce());
    mockListarVicios.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => {
      await expect(result.current.createAddiction(payload)).resolves.toEqual({ vicio: habit });
    });
    expect(result.current.addictions).toEqual([expect.objectContaining(habit)]);
  });
  it('loads the confirmed habit again after a provider remount', async () => {
    mockCriarVicio.mockImplementation(async () => {
      mockListarVicios.mockResolvedValue({ vicios: [habit] });
      return { vicio: habit };
    });
    const first = renderHook(() => useData(), { wrapper });
    await act(async () => { await first.result.current.createAddiction(payload); });
    expect(first.result.current.addictions).toHaveLength(1);
    first.unmount();
    const second = renderHook(() => useData(), { wrapper });
    await waitFor(() => expect(second.result.current.addictions).toEqual([expect.objectContaining(habit)]));
    expect(mockCriarVicio).toHaveBeenCalledOnce();
  });
  it('keeps selection and a confirmed creation across a background token refresh', async () => {
    let resolve;
    mockCriarVicio.mockReturnValue(new Promise(done => { resolve = done; }));
    const { result, rerender } = renderHook(() => useData(), { wrapper });
    await waitFor(() => expect(mockListarVicios).toHaveBeenCalledOnce());
    act(() => result.current.setSelectedAddiction(habit));
    const pending = result.current.createAddiction(payload);
    mockAuthState.token = 'refreshed-token';
    mockAuthState.user = { id: 'user-1' };
    rerender();
    expect(result.current.selectedAddiction).toEqual(habit);
    mockListarVicios.mockResolvedValue({ vicios: [habit] });
    await act(async () => { resolve({ vicio: habit }); await pending; });
    await expect(pending).resolves.toEqual({ vicio: habit });
    expect(result.current.addictions).toEqual([expect.objectContaining(habit)]);
    expect(mockShowToast).toHaveBeenCalledWith('success', 'Hábito criado com sucesso!');
  });

  it('does not publish a previous account confirmation into the new account', async () => {
    let resolve;
    mockCriarVicio.mockReturnValue(new Promise(done => { resolve = done; }));
    const { result, rerender } = renderHook(() => useData(), { wrapper });
    await waitFor(() => expect(mockListarVicios).toHaveBeenCalledOnce());
    const pending = result.current.createAddiction(payload).catch(error => error);
    mockAuthState.token = 'second-token';
    mockAuthState.user = { id: 'user-2' };
    rerender();
    await act(async () => { resolve({ vicio: habit }); await pending; });
    expect(await pending).toBeInstanceOf(Error);
    expect(result.current.addictions).toEqual([]);
    expect(mockShowToast).not.toHaveBeenCalledWith('success', expect.anything());
  });
});
