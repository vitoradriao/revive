import { describe, expect, it } from 'vitest';
import fixtures from '../../../tests/fixtures/progress.cjs';
import * as mobile from '../../../revive-mobile/src/domain/metrics';
import { achievementProgress } from '../../../revive-mobile/src/domain/achievements';
import { accountAccumulatedSavings, accountCurrentStreak, accountRecordHolder, buildProgressView, currentStreak, distinctCheckinDays, metricText, sequenceSavings, activityDays } from './progressMetrics';

const { progressFixture } = fixtures;

describe('progresso canônico web e mobile', () => {
    it.each([
        { reset: true }, { reset: false }, { archived: true }, { legacy: true }, { unknown: true }, { prospective: true }, { duplicateRecords: false },
    ])('converge na mesma fixture: %j', options => {
        const data = progressFixture(options);
        expect(accountCurrentStreak(data.vicios)).toEqual(mobile.accountCurrentStreak(data.vicios));
        expect(accountRecordHolder(data.vicios)).toEqual(mobile.accountRecordHolder(data.vicios));
        expect(accountAccumulatedSavings(data.vicios)).toEqual(mobile.accountAccumulatedSavings(data.vicios));
        expect(currentStreak(data.vicios[0])).toEqual(mobile.currentStreak(data.vicios[0]));
        expect(sequenceSavings(data.vicios[0])).toEqual(mobile.sequenceSavings(data.vicios[0]));
        expect(distinctCheckinDays(data.registros)).toBe(mobile.distinctCheckinDays(data.registros));
        const web = buildProgressView({ data });
        for (const badge of achievementProgress(data)) {
            expect(web.badges.find(item => item.category === ({ 'Dias consecutivos': 'streak', 'Economia estimada acumulada': 'savings', 'Metas concluídas': 'goals', 'Registros diários': 'consistency' })[badge.category]
                && item.requirement === badge.target)).toMatchObject({ earned: badge.earned, current: badge.current, progress: badge.percent });
        }
    });

    it('preserva recorde, conquista e economia depois do reset', () => {
        const view = buildProgressView({ data: progressFixture() });
        expect(view.current.value).toBe(2);
        expect(view.record.value).toBe(30);
        expect(view.sequenceSavings.value).toBe(20);
        expect(view.savings).toEqual({ value: 320, coverage: 'inferred' });
        expect(view.badges.find(badge => badge.id === 'streak-30').earned).toBe(true);
        expect(buildProgressView({ data: progressFixture({ reset: false }) }).current.value).toBe(32);
    });

    it('aplica economia prospectiva do servidor sem multiplicar pela taxa atual', () => {
        const view = buildProgressView({ data: progressFixture({ prospective: true }) });
        expect(view.sequenceSavings).toMatchObject({ value: 30, coverage: 'confirmed' });
        expect(view.savings).toEqual({ value: 330, coverage: 'confirmed' });
    });

    it('mantém desconhecido indisponível e não fabrica conquistas legadas', () => {
        const view = buildProgressView({ data: progressFixture({ legacy: true }) });
        expect(view.current.value).toBeNull();
        expect(metricText(view.current)).toBe('Indisponível');
        expect(view.record.value).toBeNull();
        expect(view.savings.value).toBeNull();
        expect(view.badges.every(badge => !badge.earned)).toBe(true);
        expect(metricText({ value: 0, coverage: 'confirmed' })).toBe('0 dias');
        expect(metricText({ value: 0, coverage: 'unknown' }, true)).toBe('Indisponível');
        expect(buildProgressView().savings.value).toBeNull();
    });

    it('inclui arquivados no histórico e mantém apenas ativos na sequência atual', () => {
        const active = progressFixture();
        const archived = progressFixture({ archived: true, reset: false }).vicios[0];
        const view = buildProgressView({ data: { ...active, vicios: [...active.vicios, { ...archived, id: 'archived' }] } });
        expect(view.activeCount).toBe(1);
        expect(view.current.value).toBe(2);
        expect(view.record.value).toBe(32);
        expect(view.savings.value).toBe(640);
    });

    it('conta datas distintas mesmo com recaída e registros repetidos', () => {
        const data = progressFixture();
        const view = buildProgressView({ data });
        expect(view.checkinDays).toBe(2);
        const days = activityDays(data.registros, data.recaidas, new Date(data.server_time));
        expect(days.find(day => day.date === '2026-02-01')).toMatchObject({ count: 2, hasRelapse: true });
        expect(days.filter(day => day.count > 0)).toHaveLength(2);
    });

    it('não promove bootstrap ou primeira página a histórico completo', () => {
        const first = progressFixture();
        const view = buildProgressView({ data: { ...first, registros: first.registros.slice(0, 1), next_cursor: 'another-page' } });
        expect(view.scope).toContain('Cópia parcial');
        expect(view.checkinDays).toBe(1);
        expect(buildProgressView({ data: { ...first, registros: [], next_cursor: null } }).scope).toContain('não garante todo o histórico');
    });

    it('não incorpora intenções locais nem conflitos aos indicadores consolidados', () => {
        const data = progressFixture();
        const view = buildProgressView({ data, localOnly: true, stale: true, queue: [
            { type: 'record.create', payload: { data_registro: '2026-02-03' }, status: 'pending' },
            { type: 'relapse.create', payload: { reset_counter: true }, status: 'recovery', lastError: { status: 409 } },
        ] });
        expect(view.checkinDays).toBe(2);
        expect(view.current.value).toBe(2);
        expect(view.pendingCount).toBe(2);
        expect(view.conflictCount).toBe(1);
    });
});
