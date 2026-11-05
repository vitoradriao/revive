const { aggregateWeek, buildWeeklySummary, startOfDate, validSummaryQuery, loadAllPages } = require('../../weekly-summary');
const corpus = require('../fixtures/weekly-summary.json');
const { weeklyReadQuery } = require('../helpers/weekly-database.cjs');
function fixture(patch = {}) {
    const scope = rows => rows.map(row => ({ ...row, usuario_id: corpus.ownerId, vicio_id: corpus.habitId }));
    return { ...corpus, now: new Date(corpus.now), records: scope(corpus.records), urges: scope(corpus.urges), relapses: scope(corpus.relapses), ...patch };
}
it('produces exact shared numbers, explicit catalogs and traceable phrases without free-text classification', () => {
    const summary = buildWeeklySummary(fixture());
    expect(summary.dias_checkin).toMatchObject({ valor: 3, denominador: 5 });
    expect(summary.episodios.quantidade).toBe(6); expect(summary.recaidas.quantidade).toBe(1);
    expect(summary.intensidade).toMatchObject({ media: 5, soma: 30, denominador: 6, total: 6 });
    expect(summary.gatilhos.find(row => row.codigo === 'estresse')).toMatchObject({ quantidade: 4, denominador: 6 });
    expect(summary.frases.find(row => row.codigo === 'trigger:estresse')).toMatchObject({ texto: corpus.expected.phrase, numerador: 4, denominador: 6, origem: { tipo: 'vontades', ids: corpus.urges.slice(0, 4).map(row => row.id) } });
    for (const code of ['bom', 'bem', 'nao_categorizado', 'nao_informado']) expect(summary.humores.find(row => row.codigo === code).quantidade).toBe(1);
    expect(JSON.stringify(summary)).not.toContain('texto sintético livre');
    expect(summary.comparacao.status).toBe('dados_insuficientes'); expect(summary.parcial).toBe(true);
});
it('deduplicates IDs and structured triggers, excluding foreign owner/habit/period and future events', () => {
    const f = fixture();
    f.records.push(f.records[0], { ...f.records[0], id: 'foreign', usuario_id: 'b' }, { ...f.records[0], id: 'habit', vicio_id: 'other' }, { ...f.records[0], id: 'old', data_registro: '2026-10-18' }, { ...f.records[0], id: 'future', data_registro: '2026-10-24' });
    f.urges.push(f.urges[0], { ...f.urges[0], id: 'foreign', usuario_id: 'b' }, { ...f.urges[0], id: 'other', vicio_id: 'other' }, { ...f.urges[0], id: 'old', occurred_at: '2026-10-19T02:59:59Z' }, { ...f.urges[0], id: 'future', occurred_at: '2026-10-23T15:00:01Z' });
    expect(aggregateWeek(f)).toEqual(aggregateWeek(fixture()));
});
it.each([
    ['2025-12-29', '2026-01-04', 'UTC'], ['2026-03-30', '2026-04-05', 'America/Sao_Paulo'],
])('keeps Monday through Sunday across month/year %s', (week, end, timezone) => {
    const s = aggregateWeek(fixture({ week, timezone, now: new Date('2026-05-01Z') }));
    expect(s.intervalo.fim).toBe(end); expect(s.dias_checkin.denominador).toBe(7); expect(s.parcial).toBe(false);
});
it('uses civil check-in dates and UTC convention for legacy naive relapse timestamps', () => {
    const f = fixture({ week: '2026-10-19', now: new Date('2026-10-27T00:00:00Z') });
    f.urges = [{ ...f.urges[0], occurred_at: '2026-10-19T01:00:00Z' }];
    f.relapses = [{ ...f.relapses[0], data_recaida: '2026-10-19T01:00:00' }];
    const local = aggregateWeek(f), utc = aggregateWeek({ ...f, timezone: 'UTC' });
    expect(local.dias_checkin.valor).toBe(utc.dias_checkin.valor);
    expect(local.episodios.quantidade).toBe(0); expect(utc.episodios.quantidade).toBe(1);
    expect(local.recaidas.quantidade).toBe(0); expect(utc.recaidas.quantidade).toBe(1);
});
it.each([
    ['2026-03-02', '2026-03-09', 'America/New_York', 167],
    ['2026-10-26', '2026-11-02', 'America/New_York', 169],
    ['2018-10-29', '2018-11-05', 'America/Sao_Paulo', 167],
])('resolves real IANA boundaries across DST %s', (start, end, zone, hours) => {
    expect((Date.parse(startOfDate(end, zone)) - Date.parse(startOfDate(start, zone))) / 3600000).toBe(hours);
    const f = fixture({ week: start, timezone: zone, now: new Date('2027-01-01Z'), records: [], relapses: [] });
    f.urges = [{ ...f.urges[0], occurred_at: startOfDate(start, zone) }, { ...f.urges[1], occurred_at: new Date(Date.parse(startOfDate(end, zone)) - 1).toISOString() }, { ...f.urges[2], occurred_at: startOfDate(end, zone) }];
    expect(aggregateWeek(f).episodios.quantidade).toBe(2);
});
it('handles zero/legacy/missing fields honestly, preserving intensity zero as known', () => {
    const f = fixture({ records: [], urges: [], relapses: [] });
    let s = buildWeeklySummary(f);
    expect(s.intensidade.media).toBeNull(); expect(s.intensidade.denominador).toBe(0); expect(s.dias_checkin.valor).toBe(0);
    const base = fixture();
    f.records = ['pessimo', 'Péssimo', 'Confiante', 'ansioso', 'Bem em casa'].map((humor, i) => ({ ...base.records[0], id: String(i), humor }));
    f.urges = [null, '5', -1, 11, 0].map((intensidade, i) => ({ ...base.urges[0], id: String(i), intensidade, gatilhos: i ? null : 'estresse livre' }));
    s = aggregateWeek(f);
    expect(s.intensidade).toMatchObject({ media: 0, denominador: 1, total: 5 });
    expect(s.gatilhos).toEqual([]); expect(s.cobertura.gatilhos_estruturados).toBe(0);
    expect(s.humores.find(row => row.codigo === 'nao_categorizado').quantidade).toBe(2);
    f.urges[0].gatilhos = ['constructor'];
    expect(aggregateWeek(f).gatilhos[0].rotulo).toBe('Gatilho não catalogado (constructor)');
});
it('compares only two closed seven-day fully loaded periods with observations in each', () => {
    const f = fixture({ now: new Date('2026-10-27T12:00:00Z') });
    f.records.push({ ...f.records[0], id: 'previous', data_registro: '2026-10-12' });
    const s = buildWeeklySummary(f);
    expect(s.comparacao.status).toBe('disponivel');
    expect(s.comparacao.anterior.dias_checkin.valor).toBe(1);
    expect(s.comparacao.anterior.origens.registros[0].id).toBe('previous');
    expect(buildWeeklySummary({ ...f, complete: false }).comparacao.status).toBe('dados_insuficientes');
    expect(buildWeeklySummary(fixture({ now: f.now })).comparacao.status).toBe('dados_insuficientes');
});
it('loads all keyset pages even under a smaller server cap, failing on missing/broken pages', async () => {
    const rows = Array.from({ length: 1305 }, (_, i) => ({ id: String(i).padStart(5, '0') }));
    expect(await loadAllPages(() => weeklyReadQuery(() => rows, () => [], { cap: 73 }))).toEqual(rows.map(row => ({ ...row, vicios: {} })));
    await expect(loadAllPages(() => weeklyReadQuery(() => rows, () => [], { fail: true }))).rejects.toThrow('WEEKLY_QUERY_FAILED');
    const bad = { order() { return this; }, limit() { return this; }, gt() { return this; }, then(resolve) { return Promise.resolve({ data: [rows[0]] }).then(resolve); } };
    await expect(loadAllPages(() => bad)).rejects.toThrow('WEEKLY_PAGE_INVALID');
});
it('rejects non-Monday, future, invalid IANA, array and unknown parameters', () => {
    const now = new Date(corpus.now), query = { vicio_id: corpus.habitId, semana: corpus.week, timezone: corpus.timezone };
    expect(validSummaryQuery(query, now)).toBe(true);
    for (const patch of [{ semana: '2026-02-30' }, { semana: '2026-10-20' }, { semana: '2026-10-26' }, { timezone: '+03:00' }, { timezone: 'invalid' }, { timezone: ['UTC'] }, { vicio_id: null }, { extra: 'x' }]) expect(validSummaryQuery({ ...query, ...patch }, now)).toBeFalsy();
});
