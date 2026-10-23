const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const playwright = require('playwright');
const corpus = require('../fixtures/diary-search.json');
const accountId = '00000000-0000-4000-8000-000000000001';
const habitId = '10000000-0000-4000-8000-000000000001';
const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const login = async (page, email = 'a@example.invalid') => {
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
    await page.getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Sair', exact: true }).waitFor();
};
const readStore = (page, name) => page.evaluate(({ accountId, name }) => new Promise((resolve, reject) => {
    const open = indexedDB.open('revive-account-' + accountId);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
        const db = open.result, tx = db.transaction(name), request = tx.objectStore(name).getAll();
        let rows; request.onsuccess = () => { rows = request.result; };
        tx.oncomplete = () => { db.close(); resolve(rows); }; tx.onabort = () => reject(tx.error);
    };
}), { accountId, name });
const until = async check => {
    const deadline = Date.now() + 20000;
    while (!await check()) {
        if (Date.now() >= deadline) throw new Error('Estado esperado da busca não chegou.');
        await new Promise(resolve => setTimeout(resolve, 100));
    }
};
(async () => {
    const results = [];
    for (const engine of (process.env.REVIVE_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
        const port = await freePort(), base = `http://127.0.0.1:${port}`;
        const server = spawn(process.execPath, [path.join(__dirname, 'session-fixture.cjs')], {
            env: { ...process.env, REVIVE_BROWSER_API_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
        });
        let browser;
        const errors = [], failedReads = new Set();
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Fixture não iniciou.')), 10000);
                server.once('error', reject);
                server.stdout.on('data', chunk => { if (String(chunk).includes('Synthetic session HTTP API')) { clearTimeout(timer); resolve(); } });
            });
            browser = await playwright[engine].launch({ headless: true,
                ...(process.env.REVIVE_BROWSER_EXECUTABLE ? { executablePath: process.env.REVIVE_BROWSER_EXECUTABLE } : {}) });
            const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
            context.setDefaultTimeout(20000);
            await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
            const readPaths = ['/api/v2/bootstrap', '/api/v2/registros', '/api/v2/vontades', '/api/v2/web-auth/refresh', '/api/v2/preferences'];
            await context.exposeBinding('__testFailedRead', (_source, value) => {
                const url = new URL(value);
                if (url.origin === base && readPaths.includes(url.pathname)) failedReads.add('/' + url.host + url.pathname + url.search + ' due to access control checks.');
            });
            await context.addInitScript(() => {
                const nativeFetch = window.fetch;
                window.fetch = async (...args) => {
                    const [input, options] = args;
                    try { return await nativeFetch(...args); }
                    catch (error) {
                        if ((options?.method || input?.method || 'GET') === 'GET') {
                            try { await window.__testFailedRead(new URL(typeof input === 'string' ? input : input.url, location.href).href); } catch { /* Document closing. */ }
                        }
                        throw error;
                    }
                };
            });
            context.on('requestfailed', request => {
                const url = new URL(request.url());
                if (request.method() === 'GET' && url.origin === base && readPaths.includes(url.pathname)) failedReads.add('/' + url.host + url.pathname + url.search + ' due to access control checks.');
            });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message.trim()));
            await page.clock.setFixedTime(new Date('2026-10-23T15:00:00Z'));
            await page.goto(base); await login(page);
            await page.waitForFunction(() => !!localStorage.getItem('revive_offline_account'));
            const quick = page.getByRole('region', { name: 'Check-in rápido', exact: true });
            await quick.getByRole('button', { name: 'Adicionar reflexão opcional' }).click();
            assert.equal(await quick.getByRole('complementary', { name: 'Perguntas opcionais' }).getByRole('listitem').count(), 3);
            for (const label of ['Humor', 'Gatilhos', 'Conquistas', 'Observações']) assert.equal(await quick.getByLabel(label, { exact: true }).inputValue(), '');
            assert.equal(await quick.getByRole('button', { name: 'Salvar check-in' }).isDisabled(), true);
            assert.equal((await readStore(page, 'outbox')).length, 0);
            assert.equal((await readStore(page, 'meta')).filter(row => row.key.startsWith('recordDraft:')).length, 0);
            assert.equal((await (await fetch(base + '/__test/status')).json()).counts.writes, 0);
            await fetch(base + '/__test/seed-diary-search', { method: 'POST' });
            await page.goto(base + '/vicios/' + habitId);
            const diary = page.getByRole('region', { name: 'Diário por período', exact: true });
            const search = diary.getByRole('searchbox', { name: 'Buscar no diário' });
            await diary.getByRole('checkbox', { name: 'Buscar em todo o histórico' }).check();
            await until(async () => await diary.getByRole('listitem').count() === 20);
            const started = Date.now();
            await search.focus();
            assert.equal(await search.evaluate(element => document.activeElement === element), true);
            await page.keyboard.press('Tab');
            assert.equal(await diary.getByRole('checkbox', { name: 'Buscar em todo o histórico' }).evaluate(element => document.activeElement === element), true);
            await search.focus();
            await search.fill('sentinela anual');
            await diary.getByText(/Sentinela anual/).waitFor();
            assert.equal(await diary.getByRole('listitem').count(), 1);
            assert.ok(Date.now() - started < 10000);
            assert.equal(await diary.locator('b').count(), 0);
            // Clear term: normal full-history pagination, stable unique IDs through all 365 records.
            await search.fill('');
            await until(async () => await diary.getByRole('listitem').count() === 20);
            while (await diary.getByRole('button', { name: 'Carregar mais registros' }).count()) {
                await diary.getByRole('button', { name: 'Carregar mais registros' }).click();
                await until(async () => !await diary.getByText('Consultando diário…', { exact: true }).count());
            }
            assert.equal(await diary.getByRole('listitem').count(), 365);
            const requests = [];
            const observe = req => { if (req.url().endsWith('/api/v2/registros/search')) requests.push(req); };
            page.on('request', observe);
            for (const test of corpus.cases.filter(test => test.term && test.matches.length)) {
                await search.fill(test.term);
                const count = Array.from({ length: 365 }, (_, index) => index).filter(index => test.matches.includes(index % corpus.rows.length)).length;
                const expected = Math.min(20, count);
                await until(async () => await diary.getByRole('listitem').count() === expected);
            }
            assert.ok(requests.every(req => req.method() === 'POST' && new URL(req.url()).search === '' && typeof req.postDataJSON().termo === 'string'));
            page.off('request', observe);
            await search.fill('x'.repeat(101));
            await diary.getByRole('alert').filter({ hasText: '100 caracteres' }).waitFor();
            assert.equal(await diary.getByRole('listitem').count(), 0);
            await search.fill('x'.repeat(100));
            await diary.getByText('Nenhum registro neste período nos dados disponíveis.', { exact: true }).waitFor();
            // A late response cannot restore the prior query, even while the account lock serializes reads.
            await fetch(base + '/__test/search-transport', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hold: true }) });
            const oldResponse = page.waitForResponse(response => response.url().endsWith('/api/v2/registros/search'));
            await search.fill('sentinela anual');
            await diary.getByText('Consultando diário…', { exact: true }).waitFor();
            await until(async () => (await (await fetch(base + '/__test/status')).json()).heldSearch > 0);
            await search.fill('ausente');
            await fetch(base + '/__test/search-transport', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hold: false }) });
            await oldResponse;
            await diary.getByText('Nenhum registro neste período nos dados disponíveis.', { exact: true }).waitFor();
            assert.equal(await diary.getByText(/Sentinela anual/).count(), 0);
            await page.getByRole('button', { name: 'Arquivar hábito', exact: true }).click();
            await page.getByRole('button', { name: 'Confirmar arquivamento', exact: true }).click();
            await page.getByRole('button', { name: 'Reativar hábito', exact: true }).waitFor();
            await search.fill('sentinela anual'); await diary.getByText(/Sentinela anual/).waitFor();
            // Real IndexedDB coverage remains available offline and does not persist query keys.
            const pages = await readStore(page, 'pages');
            assert.ok(pages.every(row => !JSON.stringify({ key: row.key, filters: row.filters }).includes('termo')));
            await context.setOffline(true);
            await search.fill('CAFÉ');
            await diary.getByText(/Cobertura parcial: a cópia local/).waitFor();
            assert.ok(await diary.getByRole('listitem').count() > 20);
            assert.equal(await diary.getByRole('button', { name: 'Carregar mais registros' }).count(), 0);
            const output = process.env.REVIVE_BROWSER_ARTIFACTS;
            if (output) {
                fs.mkdirSync(output, { recursive: true });
                // Mask field and diary text; captures expose state and layout only.
                await page.screenshot({ path: path.join(output, `diary-search-offline-${engine}.png`), animations: 'disabled', fullPage: false, mask: [search, diary.locator('ul')] });
            }
            await context.setOffline(false);
            await page.getByRole('button', { name: 'Sair', exact: true }).click();
            await login(page, 'b@example.invalid');
            assert.equal(await page.getByText(/Sentinela anual/).count(), 0);
            const interruptedRead = new RegExp(String.raw`/127\.0\.0\.1:${port}/api/v2/(?:bootstrap|registros(?:\?[^\s#]+)?|vontades(?:\?[^\s#]+)?|web-auth/refresh|preferences) due to access control checks\.$`);
            assert.deepEqual(errors.filter(message => !(engine === 'webkit' && ([...failedReads].some(diagnostic => message.endsWith(diagnostic)) || interruptedRead.test(message)))), []);
            results.push({ engine, browserVersion: browser.version(), yearFixture: 365, beyondFirstPage: true, literalCorpus: true,
                stablePages: true, oldResponseIgnored: true, boundary100and101: true, archive: true, partialOffline: true,
                indexedDB: true, accountIsolation: true, questionsDoNotSave: true, keyboard: true, htmlAsText: true });
            await context.close();
        } finally {
            await browser?.close();
            if (server.exitCode === null && server.signalCode === null) {
                const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped;
            }
        }
    }
    console.log(JSON.stringify(results, null, 2));
    if (process.env.REVIVE_BROWSER_ARTIFACTS) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_ARTIFACTS, 'diary-search-results.json'), JSON.stringify(results, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
