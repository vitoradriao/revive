// Exportação seletiva no painel (#27): seleção, prévia, paginação, parcial e download real do arquivo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const playwright = require('playwright');

const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/export-selection.json'), 'utf8'));
const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const number = server.address().port; server.close(() => resolve(number)); });
});
const login = async (page, email) => {
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
    await page.locator('form').getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Sair', exact: true }).waitFor();
};
// Responde por hábito e cursor, independentemente do período padrão calculado pela data atual.
const pageFor = (requested) => {
    const url = new URL(requested);
    const key = Object.keys(fx.pages).find(candidate => {
        const other = new URL(candidate, 'http://x');
        return url.pathname.endsWith(other.pathname) && other.searchParams.get('vicio_id') === url.searchParams.get('vicio_id')
            && other.searchParams.get('cursor') === url.searchParams.get('cursor');
    });
    return key ? fx.pages[key] : { registros: [], vontades: [], next_cursor: null };
};

(async () => {
    const results = [];
    for (const engine of (process.env.REVIVE_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
        const number = await freePort();
        const base = `http://127.0.0.1:${number}`;
        const server = spawn(process.execPath, [path.join(__dirname, 'session-fixture.cjs')], {
            env: { ...process.env, REVIVE_BROWSER_API_PORT: String(number) }, stdio: ['ignore', 'pipe', 'pipe'],
        });
        let browser;
        const errors = [];
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Tempo de abertura excedido')), 10000);
                server.once('error', reject);
                server.stdout.on('data', chunk => { if (String(chunk).includes('Synthetic session HTTP API')) { clearTimeout(timer); resolve(); } });
            });
            browser = await playwright[engine].launch({ headless: true,
                ...(process.env.REVIVE_BROWSER_EXECUTABLE ? { executablePath: process.env.REVIVE_BROWSER_EXECUTABLE } : {}),
            });
            const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', acceptDownloads: true, serviceWorkers: 'block' });
            context.setDefaultTimeout(20000);
            await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            await page.clock.setFixedTime(new Date('2026-02-03T15:00:00Z'));
            let failCursor = null;
            const requested = [];
            await context.route('**/api/v2/bootstrap', async route => {
                const response = await route.fetch();
                if (!response.ok()) return route.fulfill({ response });
                const original = await response.json();
                return route.fulfill({ response, json: { ...original, vicios: fx.habits.map(habit => ({ ...habit, usuario_id: original.usuario.id })), registros: [],
                    recaidas: fx.snapshot.recaidas, metas: fx.snapshot.metas.map(goal => ({ ...goal, usuario_id: original.usuario.id })), conquistas: [], mensagem: null } });
            });
            await context.route(/\/api\/v2\/(registros|vontades)\?/, async route => {
                const url = route.request().url();
                requested.push(new URL(url).searchParams.get('cursor'));
                if (failCursor && new URL(url).searchParams.get('cursor') === failCursor) return route.fulfill({ status: 503, json: { erro: 'CONSULTA_INDISPONIVEL' } });
                return route.fulfill({ json: pageFor(url) });
            });

            await page.goto(base);
            await login(page, 'a@example.invalid');
            await page.goto(base + '/relatorios');
            const panel = page.getByRole('region', { name: 'Exportar dados', exact: true });
            await panel.getByText('Exportar dados selecionados', { exact: true }).waitFor();
            assert.equal(await panel.getByLabel(/^Observações/).isChecked(), false);
            assert.equal(await panel.getByLabel(/^Incluir nomes dos hábitos/).isChecked(), false);
            assert.equal(await panel.getByLabel(/^Incluir metas sem data/).isChecked(), false);
            // Seleciona os mesmos hábitos da fixture (o arquivado não vem marcado por padrão).
            await panel.getByLabel('SENTINELA_NOME_HABITO_B (arquivado)', { exact: true }).check();
            await panel.getByLabel('SENTINELA_HABITO_NAO_SELECIONADO', { exact: true }).uncheck();
            await panel.getByRole('button', { name: /Preparar prévia/ }).click();
            const preview = page.getByRole('region', { name: 'Prévia da exportação', exact: true });
            await preview.getByText('Todas as páginas dos tipos selecionados foram carregadas.', { exact: true }).waitFor();
            assert.ok(requested.includes('c1'), 'a segunda página foi consultada');

            const [csvDownload] = await Promise.all([page.waitForEvent('download'), preview.getByRole('button', { name: /Baixar CSV/ }).click()]);
            assert.match(csvDownload.suggestedFilename(), /^revive-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\.csv$/);
            const csv = fs.readFileSync(await csvDownload.path(), 'utf8');
            assert.equal(csv.charCodeAt(0), 0xfeff);
            assert.ok(csv.includes('\r\n'));
            assert.ok(csv.includes('"Hábito 2"'));
            for (const sentinel of fx.sentinels) assert.ok(!csv.includes(sentinel), `CSV sem ${sentinel}`);

            const [jsonDownload] = await Promise.all([page.waitForEvent('download'), preview.getByRole('button', { name: /Baixar JSON/ }).click()]);
            const json = JSON.parse(fs.readFileSync(await jsonDownload.path(), 'utf8'));
            assert.equal(json.schemaVersion, 2);
            assert.equal(json.cobertura.completa, true);
            assert.equal(json.dados.registros.length, 4);
            for (const sentinel of fx.sentinels) assert.ok(!JSON.stringify(json).includes(sentinel), `JSON sem ${sentinel}`);

            // Mudar a seleção descarta a prévia; falha numa página intermediária gera arquivo parcial identificado.
            await panel.getByLabel(/^Incluir metas sem data/).check();
            assert.equal(await preview.count(), 0);
            failCursor = 'c1';
            await panel.getByRole('button', { name: /Preparar prévia/ }).click();
            await preview.getByText(/^Exportação parcial\./).waitFor();
            const [partial] = await Promise.all([page.waitForEvent('download'), preview.getByRole('button', { name: /Baixar CSV/ }).click()]);
            assert.match(partial.suggestedFilename(), /-parcial\.csv$/);
            assert.ok(fs.readFileSync(await partial.path(), 'utf8').includes('"parcial"'));

            const output = process.env.REVIVE_BROWSER_ARTIFACTS;
            if (output) {
                fs.mkdirSync(output, { recursive: true });
                await panel.screenshot({ path: path.join(output, `exportacao-seletiva-${engine}.png`), animations: 'disabled' });
            }
            const unexpected = errors.filter(message => !(engine === 'webkit' && /due to access control checks\.$/.test(message.trim())));
            assert.deepEqual(unexpected, []);
            results.push({ engine, passed: true, scenarios: ['defaults-off', 'all-pages', 'csv-download', 'json-download', 'selection-change', 'partial'] });
        } finally {
            await browser?.close();
            if (server.exitCode === null) { const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped; }
        }
    }
    console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
