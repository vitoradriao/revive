export function validSummary(data, filters) {
    return data?.versao === 1 && data.vicio_id === filters.vicio_id && data.timezone === filters.timezone
        && data.intervalo?.inicio === filters.semana && typeof data.atualizado_em === 'string'
        && data.cobertura?.carregamento === 'completo' && Array.isArray(data.frases) && Array.isArray(data.humores)
        && Array.isArray(data.gatilhos) && data.origens && data.comparacao && data.intensidade && data.dias_checkin && data.episodios && data.recaidas;
}
// Called under the account Web Lock: acknowledgements and this cache commit cannot interleave.
export async function readWeeklySummary({ store, request, check, filters, isOnline, signal }) {
    check();
    const cached = await store.getPage('weekly-summary', filters); check();
    const last = cached && validSummary(cached.data, filters) ? cached : null;
    const fallback = (error, offline) => ({ summary: last?.data || null, offline, stale: !!last?.staleAfterMutation, error: error?.message || null });
    if (!isOnline()) return fallback(null, true);
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 20000);
    try {
        const result = await request('/v2/weekly-summary?' + new URLSearchParams(filters), { signal: controller.signal });
        check();
        if (!validSummary(result, filters)) throw new Error('Resposta do resumo inválida. Tente atualizar.');
        let cacheError = null;
        try { await store.savePage('weekly-summary', filters, result); }
        catch { cacheError = 'Resumo consultado, mas a cópia offline não pôde ser atualizada.'; }
        check();
        return { summary: result, offline: false, stale: false, error: cacheError };
    } catch (error) {
        check();
        if (error.status === 401 || error.status === 403 || error.status === 404) throw error;
        return fallback(new Error('Não foi possível atualizar o resumo semanal. ' + (last ? 'Exibindo a última consulta com sua data.' : 'Tente novamente quando houver conexão.')), !error.status);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
