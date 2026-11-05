import { expect, it, vi } from 'vitest';
import corpus from '../../../tests/fixtures/diary-search.json';
import { createSyncCoordinator } from '../offline/sync-coordinator';
import { matchesDiarySearch, validateSearchTerm } from '../utils/diarySearch';
import { diaryFixture, diaryRecord, deferred } from '../test/diaryFixture';

it.each(corpus.cases)('busca local segue o corpus comum ($term)', ({ term, matches }) => {
    expect(corpus.rows.flatMap((row, index) => matchesDiarySearch(row, term) ? [index] : [])).toEqual(matches);
});
it('valida 100/101 pontos Unicode e não modifica o termo', () => {
    expect(() => validateSearchTerm('😀'.repeat(100))).not.toThrow();
    for (const term of ['a'.repeat(101), '😀'.repeat(101), null, '\0', '\ud800']) expect(() => validateSearchTerm(term)).toThrow();
});
it('envia termo somente no body, preserva cursor e guarda registros sem termo ou hash da consulta', async () => {
    const f = diaryFixture(); f.state.online = true;
    const request = vi.fn(async () => ({ registros: [diaryRecord], next_cursor: 'signed' }));
    const result = await f.make({ request }).list({ termo: 'sintético', limit: 20 });
    expect(request).toHaveBeenCalledWith('/v2/registros/search', { method: 'POST', body: JSON.stringify({ termo: 'sintético', limit: 20 }) });
    expect(result).toMatchObject({ records: [diaryRecord], nextCursor: 'signed', partial: false });
    expect(f.state.pages[0].filters).toEqual({ searchCache: true });
    f.state.online = false;
    expect(await f.make().list({ termo: 'SINTETICO', cursor: 'signed', limit: 20 })).toMatchObject({ records: [diaryRecord], nextCursor: null, partial: true, restarted: true, offline: true });
});
it('procura em todas as páginas locais e projeta correções e criações antes de buscar', async () => {
    const f = diaryFixture();
    f.state.pages = [{ kind: 'records', data: { registros: [{ ...diaryRecord, id: 'older', data_registro: '2025-01-01' }] } }];
    f.state.snapshot.data.registros = [diaryRecord];
    await f.store.enqueue('record.update', { recordId: diaryRecord.id, observacoes: 'Alterado' });
    const creation = await f.store.enqueue('record.create', { ...diaryRecord, data_registro: '2026-02-01', observacoes: 'Alterado' });
    expect((await f.make().list({ termo: 'sintetico', limit: 1 })).records.map(row => row.id)).toEqual(['older']);
    expect((await f.make().list({ termo: 'alterado' })).records.map(row => row.id)).toEqual([diaryRecord.id, creation.localId]);
    expect((await f.make().list({ termo: '', inicio: '2025-01-01', fim: '2025-12-31' })).records).toHaveLength(1);
});
it('mostra falha remota e cobertura parcial sem fingir sucesso completo por GET legado', async () => {
    const f = diaryFixture(); f.state.online = true;
    const request = vi.fn(async () => { throw Object.assign(new Error('Busca indisponível'), { status: 404 }); });
    await expect(f.make({ request }).list({ termo: 'a' })).rejects.toMatchObject({ status: 404 });
    expect(request).toHaveBeenCalledTimes(1);
    const fallback = await f.make({ request: async () => { throw new Error('Rede indisponível'); } }).list({ termo: 'a' });
    expect(fallback).toMatchObject({ partial: true, error: 'Rede indisponível' });
});
it('não grava nem devolve resposta da conta A depois da troca para B', async () => {
    const f = diaryFixture(); f.state.online = true;
    const wait = deferred(), save = vi.spyOn(f.store, 'savePage');
    const task = f.make({ request: () => wait.promise }).list({ termo: 'a' });
    f.state.active = false; wait.resolve({ registros: [diaryRecord] });
    await expect(task).rejects.toMatchObject({ code: 'SESSAO_ALTERADA' });
    expect(save).not.toHaveBeenCalled();
});


it('coordenador preserva POST/body, token e sinal de timeout sob o Web Lock da conta', async () => {
    const f = diaryFixture(); f.store.userId = 'a'; f.store.recoverInterrupted = vi.fn();
    const auth = { user: { id: 'a' }, epoch: '1', token: 'synthetic' };
    const request = vi.fn(async () => ({ registros: [diaryRecord], next_cursor: null }));
    const locks = { request: vi.fn((_key, task) => task()) };
    const coordinator = createSyncCoordinator({ store: f.store, session: { getSnapshot: () => auth }, request, locks, isOnline: () => true });
    await coordinator.diary('list', [{ termo: 'sintético', limit: 20 }]);
    expect(locks.request).toHaveBeenCalledWith('revive-sync-a', expect.any(Function));
    expect(request).toHaveBeenCalledWith('/v2/registros/search', expect.objectContaining({ method: 'POST', body: JSON.stringify({ termo: 'sintético', limit: 20 }), signal: expect.any(AbortSignal) }), 'synthetic');
});

it('recusa limite inválido também offline e inclui novas correspondências de correções pendentes', async () => {
    const f = diaryFixture();
    await expect(f.make().list({ termo: '', limit: 101 })).rejects.toThrow();
    f.state.online = true; f.state.snapshot.data.registros.push(diaryRecord);
    await f.store.enqueue('record.update', { recordId: diaryRecord.id, conquistas: 'Nova correspondência' });
    const result = await f.make({ request: async () => ({ registros: [], next_cursor: null }) }).list({ termo: 'nova correspondencia' });
    expect(result.records).toHaveLength(1); expect(result.records[0].id).toBe(diaryRecord.id);
});
