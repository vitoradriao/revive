const {
    sanitize,
    formatDuration,
    calculateAddictionStats
} = require('../../index');

describe('api helper functions', () => {
    it('sanitize trims strings and keeps nullish values', () => {
        expect(sanitize('  abc  ')).toBe('abc');
        expect(sanitize('')).toBe('');
        expect(sanitize(null)).toBe(null);
        expect(sanitize(undefined)).toBe(undefined);
    });

    it('formatDuration returns human readable duration in Portuguese', () => {
        expect(formatDuration(0)).toBe('0 dias');
        expect(formatDuration(1)).toBe('1 dia');
        expect(formatDuration(35)).toBe('1 mes, 5 dias');
        expect(formatDuration(365)).toBe('1 ano');
        expect(formatDuration(400)).toBe('1 ano, 1 mes, 5 dias');
        expect(formatDuration(730)).toBe('2 anos');
    });

    it('calculateAddictionStats computes abstinence and savings', () => {
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() - 10);
        const stats = calculateAddictionStats({
            data_inicio: baseDate.toISOString(),
            valor_economizado_por_dia: 5
        });

        expect(stats.abstinenceDays).toBeGreaterThanOrEqual(10);
        expect(stats.savedAmount).toBeGreaterThanOrEqual(50);
        expect(typeof stats.formattedDuration).toBe('string');
    });
});
