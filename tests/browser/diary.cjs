const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const playwright = require('playwright');
const accountId = '00000000-0000-4000-8000-000000000001';
const habitId = '10000000-0000-4000-8000-000000000001';
const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
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
        if (Date.now() >= deadline) throw new Error('Estado esperado do diário não chegou.');
        await new Promise(resolve => setTimeout(resolve, 100));
    }
};
const login = async (page, email = 'a@example.invalid') => {
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
    await page.getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Sair', exact: true }).waitFor();
};
const closeEditor = page => page.getByRole('button', { name: 'Fechar detalhe', exact: true }).click();
(async () => {
    const results = [];
    for (const engine of (process.env.REVIVE_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
        const port = await freePort(), base = `http://127.0.0.1:${port}`;
        const server = spawn(process.execPath, [path.join(__dirname, 'session-fixture.cjs')], {
            env: { ...process.env, REVIVE_BROWSER_API_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
        });
        let browser, mobile;
        const errors = [];
        let expectedNetworkFailure = false;
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
            // Functional captures use system fonts and do not depend on the external font CDN.
            await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
            const page = await context.newPage();
            page.on('pageerror', error => errors.push({ message: error.message, expectedNetworkFailure }));
            await page.clock.setFixedTime(new Date('2026-10-23T02:59:00Z'));
            await page.goto(base); await login(page);
            await page.waitForFunction(() => !!navigator.serviceWorker.controller && !!localStorage.getItem('revive_offline_account'));
            const quick = page.getByRole('region', { name: 'Check-in rápido', exact: true });
            await quick.getByLabel('Humor', { exact: true }).fill('bom');
            await quick.getByRole('button', { name: 'Adicionar reflexão opcional' }).click();
            await quick.getByLabel('Observações', { exact: true }).fill('Criação sintética');
            await page.clock.setFixedTime(new Date('2026-10-23T03:01:00Z'));
            expectedNetworkFailure = true;
            await fetch(base + '/__test/network', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offline: true }) });
            await quick.getByRole('button', { name: 'Salvar check-in' }).click();
            await until(async () => (await readStore(page, 'outbox')).length === 1);
            const [creation] = await readStore(page, 'outbox');
            assert.equal(creation.payload.data_registro, '2026-10-23');
            assert.equal(await quick.getByRole('button', { name: 'Salvar check-in' }).isDisabled(), true);
            await quick.getByRole('button', { name: 'Consultar registros de hoje' }).click();
            await quick.getByRole('button', { name: 'Abrir registro de 23/10/2026' }).click();
            const editor = page.getByRole('region', { name: 'Corrigir registro', exact: true });
            await editor.getByLabel('Observações', { exact: true }).waitFor();
            await page.keyboard.press('Tab');
            assert.equal(await editor.getByLabel('Humor', { exact: true }).evaluate(element => document.activeElement === element), true);
            await editor.getByLabel('Observações', { exact: true }).fill('Correção sintética final');
            await editor.getByRole('button', { name: 'Salvar correção' }).click();
            await until(async () => (await readStore(page, 'outbox')).length === 2);
            const edit = (await readStore(page, 'outbox')).find(row => row.type === 'record.update');
            assert.equal(edit.dependsOn, creation.id);
            const documentMarker = await page.evaluate(() => { window.diaryDocumentMarker = crypto.randomUUID(); return window.diaryDocumentMarker; });
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForFunction(marker => window.diaryDocumentMarker !== marker, documentMarker);
            await quick.getByRole('button', { name: 'Consultar registros de hoje' }).click();
            await quick.getByText('Correção sintética final', { exact: true }).waitFor();
            assert.equal((await readStore(page, 'outbox')).find(row => row.type === 'record.update').id, edit.id);
            // Keep dropping committed creation responses until explicit recovery. This also
            // covers browsers that transparently retry a closed connection or bypass routes via a worker.
            await fetch(base + '/__test/drop-record-responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
            const offlineStatus = await (await fetch(base + '/__test/status')).json();
            assert.equal(offlineStatus.events.registros, 0);
            assert.equal(offlineStatus.counts.writes, 0);
            // Reconnection passes the persisted backoff without changing the intent's civil day.
            await page.clock.setFixedTime(new Date('2026-10-23T03:02:00Z'));
            await fetch(base + '/__test/network', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offline: false }) });
            await page.getByRole('button', { name: 'Restaurar sessão', exact: true }).click();
            await until(async () => {
                const status = await (await fetch(base + '/__test/status')).json();
                return status.counts.writes === 1 && (await readStore(page, 'outbox')).some(row => row.id === creation.id && row.status === 'retry');
            });
            assert.equal((await readStore(page, 'receipts')).some(row => row.key === creation.id), false);
            const interrupted = await (await fetch(base + '/__test/status')).json();
            assert.equal(interrupted.events.registros, 1);
            assert.equal(interrupted.counts.writes, 1);
            assert.equal((await readStore(page, 'outbox')).find(row => row.id === edit.id).dependsOn, creation.id);
            await fetch(base + '/__test/drop-record-responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
            await page.goto(base + '/sincronizacao');
            await page.getByRole('button', { name: 'Tentar novamente', exact: true }).first().click();
            await page.getByText('Nenhuma operação aguardando envio.', { exact: true }).waitFor();
            expectedNetworkFailure = false;
            const receipts = await readStore(page, 'receipts');
            const canonical = receipts.find(row => row.key === edit.id).response.registro;
            assert.equal(canonical.observacoes, 'Correção sintética final'); assert.equal(canonical.revision, 2);
            assert.equal(receipts.find(row => row.key === creation.id).response.registro.id, canonical.id);
            const status = await (await fetch(base + '/__test/status')).json();
            assert.equal(status.events.registros, 1); assert.ok(status.counts.replays >= 1);

            // A separate native-session client races with the web editor through the same PATCH contract.
            mobile = await playwright.request.newContext();
            const authResponse = await mobile.post(base + '/api/v2/auth/login', { data: { email: 'a@example.invalid', senha: 'Synthetic!1' } });
            assert.equal(authResponse.status(), 200);
            const { access_token: accessToken } = await authResponse.json();
            const headers = { Authorization: 'Bearer ' + accessToken };
            await page.goto(base + '/vicios/' + habitId);
            const diary = page.getByRole('region', { name: 'Diário por período', exact: true });
            await diary.getByRole('button', { name: 'Abrir registro de 23/10/2026' }).click();
            await editor.getByLabel('Humor', { exact: true }).fill('neutro');
            const mobilePatch = await mobile.patch(base + '/api/v2/registros/' + canonical.id, {
                headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: { expected_version: 2, conquistas: 'Conquista sintética remota' }
            });
            assert.equal(mobilePatch.status(), 200);
            await editor.getByRole('button', { name: 'Salvar correção' }).click();
            await editor.getByText('Conflito: seu texto está preservado neste navegador.', { exact: true }).waitFor();
            const failedId = (await readStore(page, 'outbox'))[0].id;
            await page.reload();
            await diary.getByRole('button', { name: 'Abrir registro de 23/10/2026' }).click();
            assert.equal(await editor.getByLabel('Humor', { exact: true }).inputValue(), 'neutro');
            await editor.getByRole('button', { name: 'Consultar versão remota sem apagar meu texto' }).click();
            await editor.getByRole('region', { name: 'Comparação local e remota' }).waitFor();
            const output = process.env.REVIVE_BROWSER_ARTIFACTS;
            if (output) {
                fs.mkdirSync(output, { recursive: true });
                await editor.screenshot({ path: path.join(output, `diary-conflict-${engine}.png`), animations: 'disabled' });
            }
            await editor.getByRole('button', { name: 'Reaplicar minha correção nesta versão' }).click();
            await until(async () => !(await readStore(page, 'outbox')).length);
            assert.equal((await readStore(page, 'receipts')).find(row => row.key === failedId).kind, 'replaced');
            const remote = await (await mobile.get(base + '/api/v2/registros/' + canonical.id, { headers })).json();
            assert.equal(remote.registro.humor, 'neutro'); assert.equal(remote.registro.conquistas, 'Conquista sintética remota');
            await closeEditor(page);

            await fetch(base + '/__test/seed-diary', { method: 'POST' });
            await diary.getByRole('button', { name: 'Atualizar diário' }).click();
            await diary.getByRole('button', { name: 'Carregar mais registros' }).click();
            await until(async () => await diary.getByRole('listitem').count() === 24);
            const legacyItem = diary.getByRole('listitem').filter({ hasText: 'Legado sintético.' });
            await legacyItem.getByRole('button').click();
            assert.equal((await editor.getByLabel('Observações', { exact: true }).inputValue()).length, 'Legado sintético. '.repeat(100).length);
            await editor.getByLabel('Humor', { exact: true }).fill('excelente');
            await editor.getByRole('button', { name: 'Salvar correção' }).click();
            await editor.getByRole('status').filter({ hasText: /Correção (salva|confirmada)/ }).waitFor();
            await until(async () => !(await readStore(page, 'outbox')).length);
            await closeEditor(page);
            const legacyId = '20000000-0000-4000-8000-000000000023';
            const legacy = await (await mobile.get(base + '/api/v2/registros/' + legacyId, { headers })).json();
            assert.equal(legacy.registro.observacoes.length, 'Legado sintético. '.repeat(100).length);
            await page.getByRole('button', { name: 'Arquivar hábito', exact: true }).click();
            await page.getByRole('button', { name: 'Confirmar arquivamento', exact: true }).click();
            await page.getByText('Arquivado: histórico preservado. Reative para novos eventos.', { exact: true }).waitFor();
            await page.reload();
            await page.getByRole('button', { name: 'Reativar hábito', exact: true }).waitFor();
            assert.equal(await page.getByRole('button', { name: 'Salvar registro', exact: true }).isDisabled(), true);
            await diary.getByRole('button', { name: 'Carregar mais registros' }).click();
            await until(async () => await diary.getByRole('listitem').count() === 24);
            if (output) await diary.screenshot({ path: path.join(output, `diary-archive-${engine}.png`), animations: 'disabled' });
            await page.getByRole('button', { name: 'Sair', exact: true }).click();
            await login(page, 'b@example.invalid');
            assert.equal(await page.getByText('Correção sintética final', { exact: true }).count(), 0);
            // Linux WebKit may report failed offline fetches through pageerror; unrelated script failures still fail.
            const unexpected = errors.filter(error => !(engine === 'webkit' && error.expectedNetworkFailure && /\/api\/v2\/(bootstrap|registros|web-auth\/refresh).*due to access control checks\.$/.test(error.message)));
            assert.deepEqual(unexpected, []);
            results.push({ engine, browserVersion: browser.version(), midnight: true, offlineCreateUpdateReload: true, lostResponseReplay: true, canonicalId: true,
                nativeSessionConflict: true, localAfterReload: true, explicitReapply: true, pagination: true, legacy: true, archived: true, keyboard: true, accountIsolation: true });
            await context.close();
        } finally {
            await mobile?.dispose(); await browser?.close();
            if (server.exitCode === null && server.signalCode === null) {
                const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped;
            }
        }
    }
    console.log(JSON.stringify(results, null, 2));
    if (process.env.REVIVE_BROWSER_ARTIFACTS) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_ARTIFACTS, 'diary-results.json'), JSON.stringify(results, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
