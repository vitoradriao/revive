import { normalizePersonalReason, personalReasonLength } from './personalReason';
import { validateHabitForm } from './habitForm';

export function createHabitDraft(habit) {
    return {
        habitId: habit.id,
        base: { ...habit },
        values: {
            personalReason: habit.motivo_pessoal || '',
            name: habit.nome_vicio,
            startDate: habit.data_inicio.slice(0, 10),
            dailySavings: Number(habit.valor_economizado_por_dia || 0).toFixed(2).replace('.', ',')
        },
        status: 'draft', remote: null, attempted: null, message: ''
    };
}

export function habitEditPatch(draft) {
    const { errors, payload } = validateHabitForm(draft.values);
    if (payload.valor_economizado_por_dia > 99999999.99) errors.dailySavings = 'O limite é R$ 99.999.999,99.';
    if (Object.keys(errors).length) throw new Error(Object.values(errors).join(' '));
    const patch = { revision: draft.base.revision };
    if (payload.nome_vicio !== draft.base.nome_vicio) patch.nome_vicio = payload.nome_vicio;
    if (payload.valor_economizado_por_dia !== Number(draft.base.valor_economizado_por_dia)) {
        patch.valor_economizado_por_dia = payload.valor_economizado_por_dia;
    }
    if (payload.data_inicio !== draft.base.data_inicio.slice(0, 10)) {
        if (!draft.base.inicio_editavel) throw new Error('A data de início não pode mudar após histórico. Preserve a data remota antes de salvar.');
        patch.data_inicio = payload.data_inicio;
    }
    // Rascunhos anteriores não têm este campo e nunca removem o valor remoto.
    if (draft.values.personalReason !== undefined) {
        const reason = normalizePersonalReason(draft.values.personalReason);
        if (personalReasonLength(reason) > 1000 || (reason || '').includes('\0') || /[\uD800-\uDFFF]/u.test(reason || '')) throw new Error('Use até 1000 caracteres válidos no motivo pessoal, sem truncamento.');
        if (reason !== (draft.base.motivo_pessoal || null)) patch.motivo_pessoal = reason;
    }
    return patch;
}

// O bootstrap pode ser parcial. Uma referência desconhecida bloqueia por precaução.
export function habitHasPending(habitId, queue, data, pages = []) {
    const records = [...(data.registros || []), ...pages.flatMap(page => page.data?.registros || [])];
    return queue.some(item => {
        if (item.payload.vicio_id) return item.payload.vicio_id === habitId;
        if (item.payload.addictionId) return item.payload.addictionId === habitId;
        if (item.dependsOn) {
            const parent = queue.find(entry => entry.id === item.dependsOn);
            if (!parent) return true;
            return habitHasPending(habitId, [parent], data, pages);
        }
        const entity = item.type === 'goal.complete'
            ? data.metas?.find(goal => goal.id === item.payload.goalId)
            : records.find(record => record.id === item.payload.recordId);
        return !entity || entity.vicio_id === habitId;
    });
}
