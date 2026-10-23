import { habitHasPending } from '../utils/habitEdit';
import { goalPayload, relapsePayload } from '../utils/goalIntent';
const fail = (code, message) => Object.assign(new Error(message), { code });

// Todas as etapas executam sob o Web Lock da conta, inclusive exclusão e deduplicação.
export function createGoalOperations({ store, check, request, isOnline }) {
    const read = async () => {
        check();
        const [snapshot, queue] = await Promise.all([store.getSnapshot(), store.getQueue()]); check();
        if (snapshot?.data.usuario.id !== store.userId) throw fail('SESSAO_ALTERADA', 'A cópia desta conta não está disponível. Atualize os dados.');
        return { data: snapshot.data, queue };
    };
    const create = async (type, input, id) => {
        check();
        if (!id) throw fail('INTENT_INVALID', 'Reabra o formulário para identificar a intenção.');
        const payload = type === 'goal.create' ? goalPayload(input) : relapsePayload(input);
        const { data } = await read();
        const prior = await store.getReceipt(id); check();
        if (prior?.kind === 'confirmed') {
            if (prior.type && prior.type !== type || prior.intentPayload && JSON.stringify(prior.intentPayload) !== JSON.stringify(payload)) throw fail('INTENT_KEY_REUSED', 'Esta intenção já foi confirmada com outro conteúdo. Reabra o formulário.');
            return { id, confirmed: true };
        }
        const habitId = payload.vicio_id || payload.addictionId;
        if (!data.vicios.some(habit => habit.id === habitId && habit.ativo !== false)) throw fail('HABITO_ARQUIVADO', 'Hábito arquivado ou indisponível. Reative-o antes de salvar; o formulário foi preservado.');
        return store.enqueue(type, payload, { id });
    };
    return {
        create: (input, id) => create('goal.create', input, id),
        relapse: (input, id) => create('relapse.create', input, id),
        complete: async goalId => {
            const { data, queue } = await read();
            const existing = queue.find(item => item.type === 'goal.complete' && item.payload.goalId === goalId);
            if (existing) return existing;
            const parent = queue.find(item => item.type === 'goal.create' && item.localId === goalId);
            const mapping = goalId.startsWith('local:') ? await store.getMapping(goalId.slice(6)) : null; check();
            const remoteId = mapping?.entityId || goalId;
            const pending = queue.find(item => item.type === 'goal.complete' && item.payload.goalId === remoteId);
            if (pending) return pending;
            const goal = data.metas.find(item => item.id === remoteId);
            if (goal?.concluida) return { confirmed: true };
            if (!parent && !goal) throw fail('META_NAO_ENCONTRADA', 'Meta indisponível nesta cópia. Atualize os dados.');
            // Metas anteriores de hábitos arquivados continuam acessíveis para conclusão.
            return store.enqueue('goal.complete', { goalId: remoteId, concluida: true }, { dependsOn: parent?.id || null });
        },
        deleteHabit: async habitId => {
            const { data, queue } = await read();
            if (!isOnline()) throw fail('OFFLINE', 'Conecte-se para excluir definitivamente. As pendências foram preservadas.');
            const pages = await store.getPages(); check();
            if (habitHasPending(habitId, queue, data, pages)) throw fail('PENDING_INTENTS', 'Este hábito tem operações pendentes. Resolva-as em Sincronização antes de excluir.');
            const result = await request('/vicios/' + encodeURIComponent(habitId), { method: 'DELETE' }); check();
            if (result?.mensagem !== 'Vicio excluido definitivamente com sucesso') throw fail('DELETE_UNCONFIRMED', 'A exclusão não foi confirmada. Consulte os dados antes de tentar novamente.');
            await store.removeHabit(habitId); check();
            return { confirmed: true };
        },
        delete: async goalId => {
            const { queue } = await read();
            if (!isOnline()) throw fail('OFFLINE', 'Conecte-se para excluir definitivamente. Nenhuma pendência foi descartada.');
            if (goalId.startsWith('local:') || queue.some(item => item.payload.goalId === goalId || item.localId === goalId)) throw fail('PENDING_INTENTS', 'Esta meta tem operações pendentes. Resolva-as em Sincronização antes de excluir.');
            const result = await request('/metas/' + encodeURIComponent(goalId), { method: 'DELETE' }); check();
            if (result?.mensagem !== 'Meta excluida com sucesso') throw fail('DELETE_UNCONFIRMED', 'A exclusão não foi confirmada. Consulte os dados antes de tentar novamente.');
            await store.removeGoal(goalId); check();
            return { confirmed: true };
        }
    };
}
