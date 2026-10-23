import { getLocalDateString } from './goalProgress';
import { validDate, validTimezone } from './urge-time';
const invalid = message => { throw Object.assign(new Error(message), { code: 'DADOS_INVALIDOS' }); };

export function goalPayload(input) {
    const description = input.descricao_meta?.trim();
    if (!input.vicio_id || !description || description.length > 240) invalid('Selecione um hábito e descreva a meta em até 240 caracteres.');
    const days = input.dias_objetivo === '' || input.dias_objetivo == null ? null : Number(input.dias_objetivo);
    const value = input.valor_objetivo === '' || input.valor_objetivo == null ? null : Number(input.valor_objetivo);
    if (days !== null && (!Number.isInteger(days) || days <= 0 || days > 36500)) invalid('Informe de 1 a 36.500 dias inteiros.');
    if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 9999999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.0001)) invalid('Informe um valor positivo com até duas casas decimais.');
    if (days === null && value === null) invalid('Preencha um objetivo em dias ou em dinheiro.');
    if (typeof input.iniciar_hoje !== 'boolean') invalid('Escolha a base da contagem.');
    const date = input.iniciar_hoje ? input.data_inicio_meta || getLocalDateString() : null;
    if (date && !validDate(date)) invalid('Informe uma data de início válida.');
    // As bases numéricas são calculadas pelo servidor, como no contrato mobile.
    return { vicio_id: input.vicio_id, descricao_meta: description, ...(days !== null ? { dias_objetivo: days } : {}),
        ...(value !== null ? { valor_objetivo: value } : {}), iniciar_hoje: input.iniciar_hoje, data_inicio_meta: date };
}

export function relapsePayload(input, now = Date.now()) {
    if (!input.addictionId || typeof input.resetarContador !== 'boolean') invalid('Escolha explicitamente se deseja reiniciar o contador.');
    if (!validTimezone(input.timezone)) invalid('Informe um fuso IANA válido.');
    if (!/(Z|[+-]\d{2}:\d{2})$/i.test(input.occurred_at || '') || !Number.isFinite(Date.parse(input.occurred_at)) || Date.parse(input.occurred_at) > now + 300000) invalid('Informe um momento válido, até cinco minutos no futuro.');
    if (input.motivo != null && (typeof input.motivo !== 'string' || input.motivo.trim().length > 1000)) invalid('Use até 1000 caracteres no motivo.');
    return { addictionId: input.addictionId, resetarContador: input.resetarContador, motivo: input.motivo?.trim() || '',
        occurred_at: new Date(input.occurred_at).toISOString(), timezone: input.timezone };
}

export const intentStatusLabel = status => ({ pending: 'Salvo neste navegador · Pendente', sending: 'Enviando · Aguardando confirmação',
    retry: 'Envio não confirmado · Nova tentativa pendente', recovery: 'Falha ou conflito · Revise em Sincronização' }[status] || 'Confirmado pelo servidor');
