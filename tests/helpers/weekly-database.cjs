// Synthetic PostgREST reads, including joins, strict filters, order and capped pages.
function weeklyReadQuery(getRows, getHabits, { cap = 500, fail = false } = {}) {
    const filters = []; let limit = cap, order = null;
    const query = {
        select() { return this; },
        eq(field, value) { filters.push(row => field === 'vicios.usuario_id' ? getHabits().some(habit => habit.id === row.vicio_id && habit.usuario_id === value) : row[field] === value); return this; },
        gt(field, value) { filters.push(row => row[field] > value); return this; },
        gte(field, value) { filters.push(row => row[field] >= value); return this; },
        lt(field, value) { filters.push(row => row[field] < value); return this; },
        lte(field, value) { filters.push(row => row[field] <= value); return this; },
        limit(value) { limit = Math.min(value, cap); return this; },
        order(field, { ascending }) { order = { field, ascending }; return this; },
        execute() {
            if (fail) return { data: null, error: { message: 'synthetic-private-database-error' } };
            let rows = getRows().filter(row => filters.every(filter => filter(row)));
            if (order) rows = rows.sort((a, b) => String(a[order.field]).localeCompare(String(b[order.field])) * (order.ascending ? 1 : -1));
            return { data: rows.slice(0, limit).map(row => ({ ...row, vicios: { usuario_id: getHabits().find(habit => habit.id === row.vicio_id)?.usuario_id } })), error: null };
        },
        async maybeSingle() { const result = this.execute(); return { ...result, data: result.data?.[0] || null }; },
        then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject); },
    };
    return query;
}
module.exports = { weeklyReadQuery };
