// Casos compartilhados por API e painel, sem dados reais.
module.exports = [
    { input: null, normalized: null },
    { input: '', normalized: null },
    { input: ' \t\r\n\u00a0\ufeff', normalized: null },
    { input: '\ufeff  texto\r\nlinha\rfinal \u3000', normalized: 'texto\nlinha\nfinal' },
    { input: 'e\u0301', normalized: 'e\u0301' },
    { input: '😀'.repeat(1000), normalized: '😀'.repeat(1000) },
];
