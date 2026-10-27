// Canonical, descriptive aggregation. No diary text or free trigger text is returned.
const DAY_MS = 86400000;
const PAGE_SIZE = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOOD_CATALOG = [
    { codigo: 'excelente', rotulo: 'Excelente', valores: ['excelente', 'Excelente'] },
    { codigo: 'bom', rotulo: 'Bom', valores: ['bom', 'Bom'] },
    { codigo: 'neutro', rotulo: 'Neutro', valores: ['neutro', 'Neutro'] },
    { codigo: 'ruim', rotulo: 'Ruim', valores: ['ruim', 'Ruim'] },
    { codigo: 'pessimo', rotulo: 'Péssimo', valores: ['péssimo', 'Péssimo', 'pessimo'] },
    { codigo: 'bem', rotulo: 'Bem', valores: ['Bem'] },
    { codigo: 'confiante', rotulo: 'Confiante', valores: ['Confiante'] },
    { codigo: 'ansioso', rotulo: 'Ansioso', valores: ['Ansioso'] },
    { codigo: 'desanimado', rotulo: 'Desanimado', valores: ['Desanimado'] },
];
const TRIGGER_CATALOG = { estresse: 'Estresse', tedio: 'Tédio', situacao_social: 'Situação social', rotina: 'Rotina', outro: 'Outro' };
const addDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10);
function validDate(value) {
    return typeof value === 'string' && /^(19|20|[3-9]\d)\d{2}-\d{2}-\d{2}$/.test(value)
        && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validTimezone(value) {
    if (typeof value !== 'string' || !value || value.length > 100 || /^[+-]/.test(value)) return false;
    try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return true; } catch { return false; }
}
function civilDateFormatter(timezone) {
    const format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    return instant => {
        const parts = format.formatToParts(new Date(instant));
        return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key).value).join('-');
    };
}
const dateInZone = (instant, timezone) => civilDateFormatter(timezone)(instant);
// First millisecond of a civil date, including midnight gaps/overlaps. Never assume 24-hour days.
function startOfDate(date, timezone) {
    const civil = civilDateFormatter(timezone);
    const nominal = Date.parse(date + 'T00:00:00Z');
    let low = nominal - 2 * DAY_MS, high = nominal + 2 * DAY_MS;
    while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (civil(middle) < date) low = middle; else high = middle;
    }
    return new Date(high).toISOString();
}
function validSummaryQuery(query, now = new Date()) {
    return query && Object.keys(query).length === 3 && Object.keys(query).every(key => ['vicio_id', 'semana', 'timezone'].includes(key))
        && typeof query.vicio_id === 'string' && UUID.test(query.vicio_id) && validDate(query.semana)
        && new Date(query.semana + 'T00:00:00Z').getUTCDay() === 1 && validTimezone(query.timezone)
        && query.semana <= dateInZone(now, query.timezone);
}
function uniqueScoped(rows, ownerId, habitId) {
    const unique = new Map();
    for (const row of rows) {
        if (!row.id || row.vicio_id !== habitId || row.usuario_id && row.usuario_id !== ownerId
            || row.vicios?.usuario_id && row.vicios.usuario_id !== ownerId) continue;
        if (!unique.has(row.id)) unique.set(row.id, row);
    }
    return [...unique.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
const instantTime = value => typeof value === 'string' ? Date.parse(/(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + 'Z') : NaN;
function aggregateWeek({ ownerId, habitId, week, timezone, records = [], urges = [], relapses = [], now = new Date(), complete = true }) {
    const civilDate = civilDateFormatter(timezone);
    const end = addDays(week, 6), today = civilDate(now), observedEnd = end < today ? end : today;
    const inside = date => typeof date === 'string' && date >= week && date <= observedEnd;
    const instantInside = value => {
        const time = instantTime(value);
        return Number.isFinite(time) && time <= now.getTime() && inside(civilDate(time));
    };
    const diary = uniqueScoped(records, ownerId, habitId).filter(row => inside(String(row.data_registro).slice(0, 10)));
    const events = uniqueScoped(urges, ownerId, habitId).filter(row => instantInside(row.occurred_at));
    const lapses = uniqueScoped(relapses, ownerId, habitId).filter(row => instantInside(row.data_recaida));
    const days = new Set(diary.map(row => row.data_registro.slice(0, 10)));
    const observedDays = Math.max(0, Math.min(7, Math.round((Date.parse(observedEnd) - Date.parse(week)) / DAY_MS) + 1));
    const intensity = events.filter(row => Number.isInteger(row.intensidade) && row.intensidade >= 0 && row.intensidade <= 10);
    const sum = intensity.reduce((total, row) => total + row.intensidade, 0);
    const moods = [...MOOD_CATALOG, { codigo: 'nao_categorizado', rotulo: 'Não categorizado', valores: [] }, { codigo: 'nao_informado', rotulo: 'Não informado', valores: [] }]
        .map(({ codigo: code, rotulo: label }) => ({ codigo: code, rotulo: label, quantidade: 0, denominador: diary.length, ids: [] }));
    for (const row of diary) {
        const match = MOOD_CATALOG.find(category => category.valores.includes(row.humor?.trim()));
        const code = match?.codigo || (row.humor?.trim() ? 'nao_categorizado' : 'nao_informado');
        const category = moods.find(item => item.codigo === code);
        category.quantidade++; category.ids.push(row.id);
    }
    const triggers = new Map();
    for (const row of events) {
        for (const code of new Set(Array.isArray(row.gatilhos) ? row.gatilhos.filter(value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(value)) : [])) {
            if (!triggers.has(code)) triggers.set(code, { codigo: code, rotulo: Object.hasOwn(TRIGGER_CATALOG, code) ? TRIGGER_CATALOG[code] : 'Gatilho não catalogado (' + code + ')', quantidade: 0, denominador: events.length, ids: [] });
            const category = triggers.get(code); category.quantidade++; category.ids.push(row.id);
        }
    }
    const triggerRows = [...triggers.values()].sort((a, b) => b.quantidade - a.quantidade || (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));
    const source = (tipo, ids) => ({ tipo, ids });
    const recordIds = diary.map(row => row.id), eventIds = events.map(row => row.id), relapseIds = lapses.map(row => row.id);
    return {
        vicio_id: habitId, timezone, intervalo: { inicio: week, fim: end, inicio_instant: startOfDate(week, timezone), fim_exclusivo: startOfDate(addDays(week, 7), timezone), observado_ate: now.toISOString() },
        parcial: today <= end,
        dias_checkin: { valor: days.size, denominador: observedDays, ids: recordIds },
        episodios: { quantidade: events.length, ids: eventIds }, recaidas: { quantidade: lapses.length, ids: relapseIds },
        intensidade: { media: intensity.length ? Math.round(sum / intensity.length * 100) / 100 : null, soma: sum, denominador: intensity.length, total: events.length, ids: intensity.map(row => row.id) },
        gatilhos: triggerRows, humores: moods,
        cobertura: { carregamento: complete ? 'completo' : 'incompleto', registros: diary.length, episodios: events.length, recaidas: lapses.length,
            dias_observados: observedDays, dias_sem_checkin: observedDays - days.size, intensidade_informada: intensity.length,
            gatilhos_estruturados: events.filter(row => Array.isArray(row.gatilhos)).length,
            humor_categorizado: moods.filter(row => !['nao_informado', 'nao_categorizado'].includes(row.codigo)).reduce((total, row) => total + row.quantidade, 0) },
        frases: [
            { codigo: 'checkin_days', texto: `${days.size} de ${observedDays} dias observados têm check-in registrado.`, numerador: days.size, denominador: observedDays, origem: source('registros', recordIds) },
            { codigo: 'urge_count', texto: `${events.length} episódios de vontade registrados.`, numerador: events.length, denominador: events.length, origem: source('vontades', eventIds) },
            ...triggerRows.map(row => ({ codigo: 'trigger:' + row.codigo, texto: `${row.rotulo} apareceu em ${row.quantidade} de ${events.length} episódios registrados.`, numerador: row.quantidade, denominador: events.length, origem: source('vontades', row.ids) })),
        ],
        origens: { filtros: { vicio_id: habitId, inicio: week, fim: observedEnd, timezone },
            registros: diary.map(row => ({ id: row.id, data: row.data_registro.slice(0, 10) })),
            vontades: events.map(row => ({ id: row.id, data: row.occurred_at })), recaidas: lapses.map(row => ({ id: row.id, data: row.data_recaida })) },
    };
}
function buildWeeklySummary(input) {
    input = { now: new Date(), ...input };
    const current = aggregateWeek(input);
    const previous = aggregateWeek({ ...input, week: addDays(input.week, -7) });
    const enough = !current.parcial && !previous.parcial && input.complete !== false
        && current.cobertura.registros + current.episodios.quantidade + current.recaidas.quantidade > 0
        && previous.cobertura.registros + previous.episodios.quantidade + previous.recaidas.quantidade > 0;
    return { versao: 1, ...current, atualizado_em: input.now.toISOString(), comparacao: {
        status: enough ? 'disponivel' : 'dados_insuficientes',
        texto: enough ? `Nesta semana foram registrados ${current.episodios.quantidade} episódios de vontade e ${current.dias_checkin.valor} dias com check-in; na semana anterior, ${previous.episodios.quantidade} e ${previous.dias_checkin.valor}, respectivamente.` : 'Dados insuficientes para comparação: são necessárias duas semanas encerradas, totalmente carregadas e com registros em ambas.',
        anterior: { intervalo: previous.intervalo, cobertura: previous.cobertura, dias_checkin: previous.dias_checkin, episodios: previous.episodios, recaidas: previous.recaidas, intensidade: previous.intensidade, origens: previous.origens },
    } };
}
// Keyset pagination also works when PostgREST caps a page below the requested size.
async function loadAllPages(makeQuery) {
    const rows = []; let after = null;
    for (;;) {
        let query = makeQuery().order('id', { ascending: true }).limit(PAGE_SIZE);
        if (after) query = query.gt('id', after);
        const { data, error } = await query;
        if (error || !Array.isArray(data)) throw new Error('WEEKLY_QUERY_FAILED');
        if (!data.length) return rows;
        const next = data.at(-1).id;
        if (typeof next !== 'string' || after && next <= after) throw new Error('WEEKLY_PAGE_INVALID');
        rows.push(...data); after = next;
    }
}
function createWeeklySummaryHandler({ supabase, clock = () => new Date() }) {
    return async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const now = clock();
        const fail = (status, codigo, mensagem) => res.status(status).json({ codigo, mensagem, request_id: res.locals.requestId });
        if (!validSummaryQuery(req.query, now)) return fail(422, 'DADOS_INVALIDOS', 'Informe hábito, segunda-feira YYYY-MM-DD e fuso IANA válidos, sem semana futura.');
        const { vicio_id: habitId, semana: week, timezone } = req.query;
        try {
            const owned = () => supabase.from('vicios').select('id').eq('id', habitId).eq('usuario_id', req.usuarioId).maybeSingle();
            const habit = await owned();
            if (habit.error) throw habit.error;
            if (!habit.data) return fail(404, 'VICIO_NAO_ENCONTRADO', 'Hábito não encontrado.');
            const start = addDays(week, -7), end = addDays(week, 7);
            const from = startOfDate(start, timezone), until = startOfDate(end, timezone);
            const base = (table, columns) => supabase.from(table).select(columns + ',vicios!inner(usuario_id)').eq('vicio_id', habitId).eq('vicios.usuario_id', req.usuarioId);
            const [records, urges, relapses] = await Promise.all([
                loadAllPages(() => base('registros_diarios', 'id,vicio_id,data_registro,humor').gte('data_registro', start).lt('data_registro', end)),
                loadAllPages(() => base('eventos_vontade', 'id,usuario_id,vicio_id,occurred_at,intensidade,gatilhos').eq('usuario_id', req.usuarioId).gte('occurred_at', from).lt('occurred_at', until).lte('occurred_at', now.toISOString())),
                loadAllPages(() => base('historico_recaidas', 'id,vicio_id,data_recaida').gte('data_recaida', from).lt('data_recaida', until).lte('data_recaida', now.toISOString())),
            ]);
            // Do not return data after a concurrent deletion/ownership change.
            const confirmed = await owned();
            if (confirmed.error) throw confirmed.error;
            if (!confirmed.data) return fail(404, 'VICIO_NAO_ENCONTRADO', 'Hábito não encontrado.');
            return res.json(buildWeeklySummary({ ownerId: req.usuarioId, habitId, week, timezone, records, urges, relapses, now, complete: true }));
        } catch { return fail(503, 'RESUMO_INDISPONIVEL', 'Não foi possível carregar todo o resumo semanal. Tente novamente.'); }
    };
}
function createWeeklySourceHandler({ supabase }) {
    return async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const types = { vontades: ['eventos_vontade', 'id,vicio_id,occurred_at,timezone,intensidade,gatilhos,nota,acao_realizada,resultado'], recaidas: ['historico_recaidas', 'id,vicio_id,data_recaida,motivo,dias_abstinencia_perdidos'] };
        const config = Object.hasOwn(types, req.params.type) ? types[req.params.type] : null;
        const fail = status => res.status(status).json({ codigo: status === 404 ? 'ORIGEM_NAO_ENCONTRADA' : 'CONSULTA_INDISPONIVEL', mensagem: 'Não foi possível abrir o registro de origem.', request_id: res.locals.requestId });
        if (!config || !UUID.test(req.params.id)) return fail(404);
        try {
            const { data, error } = await supabase.from(config[0]).select(config[1] + ',vicios!inner(usuario_id)').eq('id', req.params.id).eq('vicios.usuario_id', req.usuarioId).maybeSingle();
            if (error) throw error;
            if (!data) return fail(404);
            const { vicios: _owner, ...record } = data;
            return res.json({ tipo: req.params.type, registro: record });
        } catch { return fail(503); }
    };
}
module.exports = { MOOD_CATALOG, TRIGGER_CATALOG, addDays, dateInZone, startOfDate, validSummaryQuery, aggregateWeek, buildWeeklySummary, loadAllPages, createWeeklySummaryHandler, createWeeklySourceHandler };
