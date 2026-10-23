import { describe, expect, it } from 'vitest';
import { civilTimeToInstant, dateInZone, dateTimeInZone, validTimezone } from './urge-time';
import { URGE_TRIGGER_CATALOG, urgeTriggerLabel } from './urge-triggers';
import { mergeUrges, urgePayload, validateUrgeFilters } from './urges';
const base = { vicio_id: 'habit', occurred_at: '2026-10-12T22:45:00Z', timezone: 'America/Sao_Paulo', intensidade: 0 };
describe('contratos de vontade espelhados do mobile', () => {
    it('mantém minuto civil, UTC e virada de dia em fusos extremos', () => {
        expect(civilTimeToInstant('2026-10-12', '22:45', base.timezone)).toBe('2026-10-13T01:45:00.000Z');
        expect(dateTimeInZone('2026-10-13T01:45:00Z', base.timezone)).toEqual({ date: '2026-10-12', time: '22:45' });
        expect(dateInZone('2026-10-13T01:45:00Z', 'UTC')).toBe('2026-10-13');
        expect(dateInZone('2026-01-01T10:30:00Z', 'Pacific/Kiritimati')).toBe('2026-01-02');
    });
    it.each([['2026-02-30', '12:00', 'UTC'], ['2026-10-13', '25:00', 'UTC'], ['2026-03-08', '02:30', 'America/New_York'], ['2026-11-01', '01:30', 'America/New_York'], ['2018-11-04', '00:30', 'America/Sao_Paulo'], ['2019-02-16', '23:30', 'America/Sao_Paulo'], ['2026-10-13', '12:00', 'invalid/zone']])('recusa civil inválido ou ambíguo %s %s %s', (day, time, zone) => {
        expect(civilTimeToInstant(day, time, zone)).toBeNull();
    });
    it.each([0, 10])('aceita extremo %s com opcionais vazios', intensidade => {
        expect(urgePayload({ ...base, intensidade, nota: '  ' })).toMatchObject({ intensidade, gatilhos: [], nota: null, acao_realizada: null, resultado: null });
    });
    it.each([-1, 11, 1.5, NaN, '0'])('recusa intensidade %s', intensidade => expect(() => urgePayload({ ...base, intensidade })).toThrow('inteira'));
    it('valida limites de texto e preserva códigos futuros e opcionais', () => {
        const input = { ...base, gatilhos: ['trigger_future_1'], nota: 'x'.repeat(1000), acao_realizada: ' relato ', resultado: ' resultado ' };
        expect(urgePayload(input)).toMatchObject({ gatilhos: input.gatilhos, nota: input.nota, acao_realizada: 'relato', resultado: 'resultado' });
        for (const field of ['nota', 'acao_realizada', 'resultado']) expect(() => urgePayload({ ...base, [field]: 'x'.repeat(1001) })).toThrow('1000');
        expect(URGE_TRIGGER_CATALOG.map(row => row.code)).toEqual(['estresse', 'tedio', 'situacao_social', 'rotina', 'outro']);
        expect(urgeTriggerLabel('trigger_future_1')).toBe('Outro (trigger_future_1)');
        expect(urgeTriggerLabel('tedio')).toBe('Tédio');
        expect(() => urgePayload({ ...base, gatilhos: Array.from({ length: 10 }, (_, i) => 'future_' + i) })).not.toThrow();
        for (const gatilhos of [Array.from({ length: 11 }, (_, i) => 'future_' + i), ['outro', 'outro'], ['Inválido']]) expect(() => urgePayload({ ...base, gatilhos })).toThrow('dez');
    });
    it('respeita tolerância do servidor sem aceitar instante inválido', () => {
        const now = Date.parse(base.occurred_at);
        expect(() => urgePayload({ ...base, occurred_at: new Date(now + 300000).toISOString() }, now)).not.toThrow();
        expect(() => urgePayload({ ...base, occurred_at: new Date(now + 300001).toISOString() }, now)).toThrow('cinco minutos');
        expect(() => urgePayload({ ...base, occurred_at: '2026-10-12' })).toThrow('momento');
        expect(validTimezone('UTC')).toBe(true);
        expect(() => urgePayload({ ...base, timezone: 'invalid/zone' })).toThrow('IANA');
        expect(() => validateUrgeFilters({ inicio: '2026-02-30', fim: '2026-03-01', vicio_id: 'habit', timezone: 'UTC' })).toThrow();
    });
    it('deduplica páginas e recibos por ID e desempata por ID descendente', () => {
        const a = { ...base, id: 'a' }, b = { ...base, id: 'b' };
        expect(mergeUrges([a, b], [a], [b])).toEqual([b, a]);
    });
});
