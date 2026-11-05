import { validPreferences } from '../utils/journeyPreferences';

// Online, sob o Web Lock da conta. Nunca cria intenções na fila offline.
export async function syncPreferences({ store, request, check, input, isOnline }) {
    check();
    if (!isOnline()) throw Object.assign(new Error('Conecte-se para alterar ou consultar preferências. Suas escolhas locais foram preservadas.'), { code: 'OFFLINE' });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
        const result = await request('/v2/preferences', { signal: controller.signal,
            ...(input ? { method: 'PATCH', body: JSON.stringify(input) } : {}) });
        check();
        if (!validPreferences(result?.preferences)) throw new Error('Resposta de preferências inválida. Consulte novamente antes de salvar.');
        await store.savePreferences(result.preferences);
        check();
        return result.preferences;
    } finally { clearTimeout(timer); }
}
