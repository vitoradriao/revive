import { requestSnapshot } from './request-snapshot';
import { patchHabit } from '../services/vicios.service';
import { createHabitDraft, habitHasPending } from '../utils/habitEdit';

const fail = (code, message) => Object.assign(new Error(message), { code });

// Executado dentro do mesmo lock de enqueue, replay, retry e descarte da conta.
export async function manageHabit({ store, habitId, draftId, input, request, reconcile, check, isOnline }) {
    check();
    if (!isOnline()) throw fail('OFFLINE', 'Conecte-se para editar, arquivar, reativar ou consultar. O rascunho foi preservado.');
    let draft = await store.getHabitDraft(draftId);
    check();
    if (!draft || draft.habitId !== habitId) throw fail('DRAFT_MISSING', 'Reabra a edição para recuperar o rascunho.');
    const persist = async patch => {
        check();
        draft = { ...draft, ...patch };
        await store.saveHabitDraft(draftId, draft);
        check();
        return draft;
    };
    const fetchRemote = async () => {
        const data = await requestSnapshot(request);
        check();
        if (data?.usuario?.id !== store.userId) throw fail('SESSAO_ALTERADA', 'A conta da resposta mudou. Reabra o hábito.');
        const habit = data.vicios?.find(item => item.id === habitId);
        if (!habit || !Number.isInteger(habit.revision)) throw fail('HABIT_UNAVAILABLE', 'O hábito não está disponível para edição.');
        await store.saveSnapshot(data);
        check();
        return { data, habit };
    };
    // Consulta explícita após reload, conflito ou resposta perdida. Nunca repete PATCH.
    if (!input) {
        const { habit } = await fetchRemote();
        return persist({ remote: habit, status: 'review', message: 'Estado remoto consultado. Compare os valores e escolha como continuar. A consulta não confirma a autoria de uma alteração anterior.' });
    }
    if (['uncertain', 'conflict', 'review'].includes(draft.status)) {
        throw fail('REVIEW_REQUIRED', 'Consulte o estado remoto e revise o rascunho antes de reaplicar.');
    }
    await reconcile();
    check();
    const { data, habit } = await fetchRemote();
    const queue = await store.getQueue();
    const pages = await store.getPages();
    check();
    const reactivating = habit.ativo === false && input.ativo === true &&
        Object.keys(input).every(key => key === 'revision' || key === 'ativo');
    if (!reactivating && habitHasPending(habitId, queue, data, pages)) {
        throw fail('PENDING_INTENTS', 'Há operações pendentes deste hábito. Resolva-as em Sincronização. Nenhuma operação foi descartada.');
    }
    if (habit.revision !== input.revision) {
        return persist({ attempted: input, remote: habit, status: 'conflict', message: 'O hábito mudou em outra aba ou sessão. Seu rascunho foi preservado; revise antes de reaplicar.' });
    }
    if ('data_inicio' in input && !habit.inicio_editavel) {
        return persist({ attempted: input, remote: habit, status: 'conflict', message: 'A data de início não pode mudar após registros, metas, conquistas ou alterações de economia.' });
    }
    if (!isOnline()) throw fail('OFFLINE', 'Sem conexão. Nenhuma edição foi enviada.');
    // O marcador é durável ANTES do envio: fechar a aba também exige consulta na retomada.
    await persist({ remote: null, status: 'uncertain', attempted: input, message: 'Não há confirmação da alteração. Consulte o estado remoto antes de reaplicar.' });
    let patchConfirmed = false;
    try {
        check();
        await patchHabit(habitId, input, request);
        patchConfirmed = true;
        check();
        const { habit: confirmed } = await fetchRemote();
        return persist({ ...createHabitDraft(confirmed), ...(Object.keys(input).every(key => key === 'revision' || key === 'ativo') ? { values: draft.values } : {}), status: 'confirmed', remote: null, message: 'Alteração confirmada. Histórico, metas e conquistas foram preservados.' });
    } catch (error) {
        check();
        if (error.code === 'SESSAO_ALTERADA') throw error;
        if (error.code === 'REVISAO_CONFLITO' || error.code === 'INICIO_COM_HISTORICO') {
            let remote = habit;
            try { remote = (await fetchRemote()).habit; } catch { check(); }
            return persist({ status: 'conflict', remote, message: error.message });
        }
        if (!patchConfirmed && !error.outcomeUnknown && error.status >= 400 && error.status < 500 && error.status !== 408) {
            return persist({ status: 'draft', message: error.message });
        }
        return draft;
    }
}
