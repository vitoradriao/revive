// Toda consulta sob coordenação tem prazo, para não reter o lock indefinidamente.
export async function requestSnapshot(request) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try { return await request('/v2/bootstrap', { signal: controller.signal }); }
    finally { clearTimeout(timeout); }
}
