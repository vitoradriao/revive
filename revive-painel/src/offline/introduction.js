import { criarVicio } from '../services/vicios.service';
import { requestSnapshot } from './request-snapshot';
import { syncPreferences } from './journey-preferences';

const fail = (code, message) => Object.assign(new Error(message), { code });

// O cadastro continua no contrato existente. O marcador impede repetir um POST incerto.
// Todas as operações são executadas sob o Web Lock da conta, inclusive entre abas.
export async function manageIntroduction({ store, action, input, request, check, isOnline }) {
    check();
    const marker = await store.getIntroduction(); check();
    if (action === 'read') return marker;
    if (action !== 'createHabit') throw fail('INTRO_ACTION', 'Etapa indisponível.');
    if (!isOnline()) throw fail('OFFLINE', 'Conecte-se para cadastrar o hábito. Nenhum cadastro foi confirmado.');
    if (marker && marker.status !== 'rejected') throw fail('INTRO_RECOVERY', 'O cadastro anterior pode ter sido salvo. Consulte os hábitos e continue com o cadastro existente.');
    const preferences = await syncPreferences({ store, request, check, isOnline }); check();
    if (preferences.intro.version !== 1 || preferences.intro.state !== 'pending' || preferences.intro.step !== 'habit') {
        throw fail('INTRO_CHANGED', 'A introdução mudou em outra sessão. Consulte as etapas atuais.');
    }
    const data = await requestSnapshot(request); check();
    if (data.usuario.id !== store.userId) throw fail('SESSAO_ALTERADA', 'A conta mudou. Reabra a introdução.');
    await store.saveSnapshot(data); check();
    if (['vicios', 'registros', 'metas', 'recaidas', 'conquistas'].some(key => data[key]?.length)) {
        throw fail('INTRO_HISTORY', 'Já há dados nesta conta. Continue com um hábito existente ou volte à Jornada.');
    }
    await store.saveIntroduction({ status: 'creating' }); check();
    let confirmed = false;
    try {
        const response = await criarVicio(input, undefined, request); check();
        confirmed = true;
        await store.saveIntroduction({ status: 'confirmed', habitId: response.vicio.id }); check();
        await store.saveSnapshot({ ...data, vicios: [response.vicio] }); check();
        return response;
    } catch (error) {
        check();
        if (!confirmed && !error.outcomeUnknown && error.status >= 400 && error.status < 500 && error.status !== 408) {
            await store.saveIntroduction({ status: 'rejected' }); check();
        }
        throw error;
    }
}
