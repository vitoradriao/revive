const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const playwright = require('playwright');
const corpus = require('../fixtures/weekly-summary.json');
const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const until = async check => {
    const deadline = Date.now() + 25000;
    while (!await check()) { if (Date.now() > deadline) throw new Error('Estado esperado do resumo semanal não chegou.'); await new Promise(resolve => setTimeout(resolve, 100)); }
};
const login = async (page, email = 'a@example.invalid') => {
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
    await page.getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Sair', exact: true }).waitFor();
};
const readStore = (page, name) => page.evaluate(({ ownerId, name }) => new Promise((resolve, reject) => {
    const request = indexedDB.open('revive-account-' + ownerId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
        const db = request.result, tx = db.transaction(name), rows = tx.objectStore(name).getAll(); let result;
        rows.onsuccess = () => { result = rows.result; }; tx.oncomplete = () => { db.close(); resolve(result); }; tx.onabort = () => reject(tx.error);
    };
}), { ownerId: corpus.ownerId, name });
(async () => {
    const results = [];
    for (const engine of (process.env.REVIVE_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
        const port = await freePort(), base = `http://127.0.0.1:${port}`;
        const server = spawn(process.execPath, [path.join(__dirname, 'session-fixture.cjs')], {
            env: { ...process.env, REVIVE_BROWSER_API_PORT: String(port), REVIVE_WEEKLY_CLOCK: corpus.now }, stdio: ['ignore', 'pipe', 'pipe']
        });
        let browser;
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Fixture não iniciou.')), 10000);
                server.once('error', reject); server.stdout.on('data', chunk => { if (String(chunk).includes('Synthetic session HTTP API')) { clearTimeout(timer); resolve(); } });
            });
            browser = await playwright[engine].launch({ headless: true,
                ...(process.env.REVIVE_BROWSER_EXECUTABLE ? { executablePath: process.env.REVIVE_BROWSER_EXECUTABLE } : {}) });
            const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'pt-BR', timezoneId: corpus.timezone });
            context.setDefaultTimeout(25000);
            await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
            const page = await context.newPage(), errors = [], failedReads = new Set();
            // WebKit can surface an aborted/offline fetch as a page error; constrain exemptions to actual failed reads.
            await context.exposeBinding('__weeklyFailedRead', (_source, url) => { failedReads.add(url); });
            await context.addInitScript(() => {
                const original = window.fetch;
                window.fetch = async (...args) => {
                    try { return await original(...args); }
                    catch (error) {
                        const [input, options] = args;
                        if ((options?.method || input?.method || 'GET') === 'GET') {
                            try { await window.__weeklyFailedRead(new URL(typeof input === 'string' ? input : input.url, location.href).href); } catch { /* Document closing. */ }
                        }
                        throw error;
                    }
                };
            });
            page.on('pageerror', error => errors.push(error.message));
            await page.clock.setFixedTime(new Date(corpus.now));
            await fetch(base + '/__test/seed-weekly', { method: 'POST' });
            await page.goto(base); await login(page);
            await page.waitForFunction(() => !!navigator.serviceWorker.controller && !!localStorage.getItem('revive_offline_account'));
            const started = Date.now(); await page.goto(base + '/analytics');
            const summary = page.getByRole('region', { name: 'Resumo semanal', exact: true });
            await summary.getByText(corpus.expected.phrase, { exact: true }).waitFor();
            assert.ok(Date.now() - started < 10000);
            await page.getByRole('heading', { name: 'Evolução', exact: true }).waitFor();
            assert.match(await summary.innerText(), /Semana parcial/);
            assert.match(await summary.getByRole('table', { name: 'Alternativa textual ao gráfico de gatilhos' }).innerText(), /Estresse\s+4 de 6/);
            await summary.getByLabel('Hábito do resumo').focus(); await page.keyboard.press('Tab');
            assert.equal(await summary.getByLabel('Semana', { exact: true }).evaluate(el => document.activeElement === el), true);
            await summary.getByRole('link', { name: 'Ver episódios: Estresse', exact: true }).click();
            const origins = summary.getByRole('region', { name: 'Registros de origem', exact: true });
            assert.equal(await origins.getByRole('listitem').count(), 4);
            await origins.getByRole('button').first().click(); await origins.getByRole('heading', { name: 'Vontade · intensidade 0/10' }).waitFor();
            await summary.getByRole('link', { name: 'Ver check-ins: Bom', exact: true }).click();
            await origins.getByRole('button').first().click();
            await origins.getByRole('region', { name: 'Corrigir registro', exact: true }).getByLabel('Humor', { exact: true }).waitFor();
            await summary.getByLabel('Semana', { exact: true }).selectOption('-1');
            await summary.getByText('Nenhum registro nesta semana. Lacunas não confirmam ausência de eventos.', { exact: true }).waitFor();
            await summary.getByLabel('Semana', { exact: true }).selectOption('0'); await summary.getByText(corpus.expected.phrase, { exact: true }).waitFor();
            // Fetch real Express data, then delay one old-context response while changing timezone.
            const transport = mode => fetch(base + '/__test/weekly-transport', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode }) });
            await transport('hold'); await summary.getByRole('button', { name: 'Atualizar resumo semanal', exact: true }).click();
            await until(async () => (await (await fetch(base + '/__test/weekly-status')).json()).held === 1);
            await summary.getByLabel('Fuso horário IANA').fill('UTC'); await fetch(base + '/__test/weekly-release', { method: 'POST' });
            await summary.getByText(corpus.expected.phrase, { exact: true }).waitFor();
            assert.equal(await summary.getByText('Resposta antiga indevida', { exact: true }).count(), 0);
            await summary.getByLabel('Fuso horário IANA').fill(corpus.timezone); await summary.getByText(corpus.expected.phrase, { exact: true }).waitFor();
            // Real offline outbox remains separate; reading/retrying the summary cannot clear it.
            await page.goto(base + '/vicios/' + corpus.habitId);
            const form = page.getByRole('region', { name: 'Registrar vontade', exact: true });
            await until(() => form.getByLabel('Intensidade (0 a 10)').isEnabled());
            await context.setOffline(true);
            await form.getByLabel('Intensidade (0 a 10)').fill('7'); await form.getByRole('button', { name: 'Salvar vontade', exact: true }).click();
            await until(async () => (await readStore(page, 'outbox')).length === 1);
            // In-app navigation keeps the offline shell and account generation.
            await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
            await summary.getByText(/Offline\. Último resumo consolidado/).waitFor();
            assert.match(await summary.innerText(), /1 pendência\(s\).*separadas/);
            await summary.getByText(corpus.expected.phrase, { exact: true }).waitFor();
            await summary.getByRole('button', { name: 'Atualizar resumo semanal', exact: true }).click();
            await until(() => summary.getByRole('button', { name: 'Atualizar resumo semanal', exact: true }).isEnabled());
            assert.equal((await readStore(page, 'outbox')).length, 1);
            assert.match(await summary.getByText(/Atualizado em/).innerText(), /23\/10\/2026/);
            if (process.env.REVIVE_BROWSER_ARTIFACTS) {
                fs.mkdirSync(process.env.REVIVE_BROWSER_ARTIFACTS, { recursive: true });
                await summary.screenshot({ path: path.join(process.env.REVIVE_BROWSER_ARTIFACTS, `weekly-summary-offline-${engine}.png`), animations: 'disabled' });
            }
            // Force summary failure after acknowledgement to inspect persisted invalidation, then refresh.
            await transport('error'); await context.setOffline(false);
            await until(async () => (await readStore(page, 'outbox')).length === 0);
            await until(async () => (await readStore(page, 'pages')).filter(row => row.kind === 'weekly-summary').every(row => row.staleAfterMutation));
            await summary.getByRole('alert').waitFor();
            await transport('normal'); await summary.getByRole('button', { name: 'Atualizar resumo semanal', exact: true }).click();
            await summary.getByText('Estresse apareceu em 4 de 7 episódios registrados.', { exact: true }).waitFor();
            const pages = (await readStore(page, 'pages')).filter(row => row.kind === 'weekly-summary');
            assert.ok(pages.some(row => row.filters.timezone === 'UTC')); assert.ok(pages.some(row => row.filters.timezone === corpus.timezone));
            assert.ok(pages.every(row => row.userId === corpus.ownerId));
            await page.goto(base + '/vicios/' + corpus.habitId);
            await page.getByRole('button', { name: 'Arquivar hábito', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar arquivamento', exact: true }).click();
            await page.getByRole('button', { name: 'Reativar hábito', exact: true }).waitFor();
            await page.goto(base + '/analytics'); await summary.getByText('Estresse apareceu em 4 de 7 episódios registrados.', { exact: true }).waitFor();
            assert.match(await summary.getByLabel('Hábito do resumo').locator('option:checked').textContent(), /arquivado/);
            await page.getByRole('button', { name: 'Sair', exact: true }).click(); await login(page, 'b@example.invalid');
            await page.goto(base + '/analytics'); await summary.getByText('Nenhum registro nesta semana. Lacunas não confirmam ausência de eventos.', { exact: true }).waitFor();
            assert.equal(await summary.getByText(/Estresse apareceu/).count(), 0);
            const allowed = error => engine === 'webkit' && [...failedReads].some(url => {
                const parsed = new URL(url);
                return parsed.origin === base && /^\/api\/(?:v2\/)?(?:bootstrap|registros|vontades|weekly-summary|preferences|web-auth\/refresh)/.test(parsed.pathname)
                    && error.endsWith('/' + parsed.host + parsed.pathname + parsed.search + ' due to access control checks.');
            });
            assert.deepEqual(errors.filter(error => !allowed(error)), []);
            results.push({ engine, browserVersion: browser.version(), yearFixture: 365, canonicalPhrase: true, sourceIds: true,
                accessibleTable: true, keyboard: true, oldResponseIgnored: true, timezoneCache: true, offlineDate: true,
                queuePreserved: true, confirmedInvalidation: true, archived: true, accountIsolation: true });
            await context.close();
        } finally {
            await browser?.close();
            if (server.exitCode === null && server.signalCode === null) {
                const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped;
            }
        }
    }
    console.log(JSON.stringify(results, null, 2));
    if (process.env.REVIVE_BROWSER_ARTIFACTS) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_ARTIFACTS, 'weekly-summary-results.json'), JSON.stringify(results, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
