import React from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixtures from '../../../tests/fixtures/progress.cjs';
import { DataProvider } from './DataContext';
import { useProgress } from './useProgress';

const state = vi.hoisted(() => ({ auth: {}, offline: {} }));
vi.mock('./AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('./OfflineContext', () => ({ useOffline: () => state.offline }));
vi.mock('./UIContext', () => ({ useUI: () => ({ showToast: vi.fn(), setLoading: vi.fn(), showConfirm: vi.fn() }) }));
const wrapper = ({ children }) => <DataProvider>{children}</DataProvider>;

beforeEach(() => {
    const data = fixtures.progressFixture();
    state.auth = { user: data.usuario, sessionEpoch: 'generation-a' };
    state.offline = { client: {}, accountKey: `${data.usuario.id}:generation-a`, snapshot: { data, updatedAt: data.server_time }, queue: [] };
});

describe('origem consolidada por conta e geração', () => {
    it('mantém registros e recaídas pendentes fora do histórico consolidado', () => {
        state.offline.localOnly = true;
        state.offline.queue = [
            { type: 'record.create', localId: 'local', status: 'pending', payload: { data_registro: '2026-02-03' } },
            { type: 'relapse.create', localId: 'reset', status: 'recovery', lastError: { status: 409 }, payload: { reset_counter: true } },
        ];
        const { result } = renderHook(useProgress, { wrapper });
        expect(result.current.records).toHaveLength(3);
        expect(result.current.checkinDays).toBe(2);
        expect(result.current.current.value).toBe(2);
        expect(result.current.pendingCount).toBe(2);
        expect(result.current.conflictCount).toBe(1);
    });

    it('rejeita a cópia de A durante troca para B e uma resposta tardia de A', () => {
        const { result, rerender } = renderHook(useProgress, { wrapper });
        expect(result.current.record.value).toBe(30);
        state.auth = { user: { id: 'account-b' }, sessionEpoch: 'generation-b' };
        rerender();
        expect(result.current.available).toBe(false);
        expect(result.current.habits).toEqual([]);
        expect(result.current.updatedAt).toBeUndefined();
        expect(result.current.pendingCount).toBe(0);
        state.offline = { ...state.offline, accountKey: 'account-b:generation-b' };
        rerender();
        expect(result.current.available).toBe(false);
    });

    it('rejeita snapshot da mesma conta com geração antiga', () => {
        const { result, rerender } = renderHook(useProgress, { wrapper });
        state.auth = { ...state.auth, sessionEpoch: 'generation-new' };
        rerender();
        expect(result.current.available).toBe(false);
        expect(result.current.awards).toBeUndefined();
    });

    it('preserva a leitura ao renovar acesso sem trocar a geração', () => {
        const { result, rerender } = renderHook(useProgress, { wrapper });
        state.auth = { ...state.auth, token: 'access-renewed' };
        rerender();
        expect(result.current.record.value).toBe(30);
    });
});
