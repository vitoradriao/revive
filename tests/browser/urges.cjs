const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const playwright = require('playwright');
const accountId = '00000000-0000-4000-8000-000000000001';
const habitId = '10000000-0000-4000-8000-000000000001';
const freePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const until = async check => { const deadline = Date.now() + 35000; while (!await check()) { if (Date.now() > deadline) throw new Error('Estado esperado de vontades não chegou.'); await new Promise(resolve => setTimeout(resolve, 100)); } };
const readStore = (page, name) => page.evaluate(({ accountId, name }) => new Promise((resolve, reject) => {
    const open = indexedDB.open('revive-account-' + accountId);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, tx = db.transaction(name), request = tx.objectStore(name).getAll(); let rows;
        request.onsuccess = () => { rows = request.result; }; tx.oncomplete = () => { db.close(); resolve(rows); }; tx.onabort = () => reject(tx.error); };
}), { accountId, name });
const login = async (page, email = 'a@example.invalid') => {
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
    await page.getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Sair', exact: true }).waitFor();
};
const verifyStorageIsolation = async context => {
    const page = await context.newPage();
    await page.goto(process.env.REVIVE_BROWSER_URL || 'http://127.0.0.1:4177');
    const result = await page.evaluate(async () => {
        const { openAccountDatabase } = await import('/src/offline/account-database.js');
        const { createSyncCoordinator } = await import('/src/offline/sync-coordinator.js');
        const account = crypto.randomUUID(), other = crypto.randomUUID(), habit = crypto.randomUUID(), id = crypto.randomUUID();
        let store = await openAccountDatabase(account);
        const payload = { vicio_id: habit, occurred_at: '2026-10-22T15:30:42.000Z', timezone: 'UTC', intensidade: 10, gatilhos: [] };
        const canonical = { ...payload, id: crypto.randomUUID(), usuario_id: account };
        await store.saveSnapshot({ usuario: { id: account }, vicios: [{ id: habit, ativo: true }], registros: [], recaidas: [], metas: [] });
        await store.savePage('urges', { vicio_id: habit }, { vontades: [], next_cursor: null });
        await store.enqueue('urge.create', payload, { id });
        const nativePut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
            if (this.name === 'mappings') throw new DOMException('Synthetic abort', 'QuotaExceededError');
            return nativePut.apply(this, args);
        };
        let aborted = false;
        try { await store.acknowledge(id, { vontade: canonical }); } catch { aborted = true; }
        finally { IDBObjectStore.prototype.put = nativePut; }
        store.close(); store = await openAccountDatabase(account);
        if (!aborted || (await store.getQueue()).length !== 1 || (await store.getReceipts()).length || (await store.getSnapshot()).data.vontades?.length) throw new Error('Recibo abortado não foi atômico.');
        await store.acknowledge(id, { vontade: canonical });
        if ((await store.getQueue()).length || (await store.getReceipt(id)).response.vontade.id !== canonical.id) throw new Error('Recibo canônico ausente.');
        const { rejectedUrgeDraft } = await import('/src/utils/urges.js');
        const refused = await store.enqueue('urge.create', payload);
        await store.saveUrgeDraft(habit, { eventId: refused.id });
        const rejection = await store.markFailed(refused.id, { status: 404, code: 'VICIO_NAO_ENCONTRADO', outcomeUnknown: false });
        const draft = rejectedUrgeDraft(rejection);
        IDBObjectStore.prototype.put = function (...args) {
            if (this.name === 'receipts') throw new DOMException('Synthetic abort', 'QuotaExceededError');
            return nativePut.apply(this, args);
        };
        let recoveryAborted = false;
        try { await store.recoverUrgeDraft(refused.id, draft); } catch { recoveryAborted = true; }
        finally { IDBObjectStore.prototype.put = nativePut; }
        if (!recoveryAborted || (await store.getUrgeDraft(habit)).eventId !== refused.id || !(await store.getQueue()).some(row => row.id === refused.id)) throw new Error('Recuperação abortada perdeu o conteúdo.');
        await store.recoverUrgeDraft(refused.id, draft);
        if ((await store.getQueue()).length || (await store.getReceipt(refused.id)).kind !== 'replaced' || (await store.getUrgeDraft(habit)).eventId !== draft.eventId) throw new Error('Recuperação não preservou o rascunho e a recusa.');
        const auth = { user: { id: account }, epoch: 'a', token: 'synthetic' };
        const lateId = crypto.randomUUID(); await store.enqueue('urge.create', payload, { id: lateId });
        let resolveWrite, startedWrite;
        const started = new Promise(resolve => { startedWrite = resolve; });
        const coordinator = createSyncCoordinator({ store, session: { getSnapshot: () => auth, ensureToken: async () => {} }, isOnline: () => true,
            request: () => { startedWrite(); return new Promise(resolve => { resolveWrite = resolve; }); } });
        const run = coordinator.run(); await started;
        auth.user = { id: other }; auth.epoch = 'b'; resolveWrite({ vontade: { ...canonical, id: crypto.randomUUID() } }); await run;
        if (await store.getReceipt(lateId) || (await store.getQueue())[0]?.status !== 'sending') throw new Error('Resposta de A foi reconciliada após trocar para B.');
        coordinator.dispose();
        auth.user = { id: account }; auth.epoch = 'a2';
        let resolveRead, startedRead;
        const reading = new Promise(resolve => { startedRead = resolve; });
        const query = createSyncCoordinator({ store, session: { getSnapshot: () => auth }, isOnline: () => true,
            request: () => { startedRead(); return new Promise(resolve => { resolveRead = resolve; }); } });
        const list = query.urges('list', [{ vicio_id: habit, inicio: '2026-10-01', fim: '2026-10-31', timezone: 'UTC' }]);
        await reading; auth.user = { id: other }; auth.epoch = 'b2'; resolveRead({ vontades: [canonical], next_cursor: null });
        let rejected = false; try { await list; } catch (error) { rejected = error.code === 'SESSAO_ALTERADA'; }
        if (!rejected || (await store.getPages()).length !== 1) throw new Error('Página tardia de A foi armazenada.');
        query.dispose(); store.close(); store = await openAccountDatabase(account);
        await store.recoverInterrupted();
        if ((await store.getQueue())[0]?.id !== lateId) throw new Error('Chave interrompida foi perdida.');
        store.close();
        const b = await openAccountDatabase(other);
        if ((await b.getReceipts()).length || (await b.getPages()).length || (await b.getQueue()).length) throw new Error('A contaminou o armazenamento de B.');
        b.close(); return { atomicAbortAndReopen: true, atomicDraftRecovery: true, lateWriteIsolation: true, latePageIsolation: true };
    });
    await page.close(); return result;
};
(async () => {
    const results = [];
    for (const engine of (process.env.REVIVE_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
        const port = await freePort(), base = `http://127.0.0.1:${port}`;
        const network = offline => fetch(base + '/__test/network', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offline }) });
        const server = spawn(process.execPath, [path.join(__dirname, 'session-fixture.cjs')], { env: { ...process.env, REVIVE_BROWSER_API_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
        let browser;
        const errors = [], failedReads = new Set(); let expectedNetworkFailure = false;
        try {
            await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Fixture não iniciou.')), 10000); server.once('error', reject); server.stdout.on('data', chunk => { if (String(chunk).includes('Synthetic session HTTP API')) { clearTimeout(timer); resolve(); } }); });
            browser = await playwright[engine].launch({ headless: true });
            const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
            context.setDefaultTimeout(25000);
            await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
            await context.exposeBinding('__testFailedRead', (_source, value) => {
                const url = new URL(value);
                if (url.origin === base && ['/api/v2/bootstrap', '/api/v2/registros', '/api/v2/vontades'].includes(url.pathname)) failedReads.add('/' + url.host + url.pathname + url.search + ' due to access control checks.');
            });
            await context.addInitScript(() => {
                const nativeFetch = window.fetch;
                window.fetch = async (...args) => {
                    const [input, options] = args, url = new URL(typeof input === 'string' ? input : input.url, location.href).href;
                    try { return await nativeFetch(...args); }
                    catch (error) {
                        if ((options?.method || input?.method || 'GET') === 'GET') {
                            try { await window.__testFailedRead(url); } catch { /* The document may already be closing. */ }
                        }
                        throw error;
                    }
                };
            });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push({ message: error.message, expectedNetworkFailure }));
            context.on('requestfailed', request => {
                const url = new URL(request.url());
                if (request.method() === 'GET' && url.origin === base && ['/api/v2/bootstrap', '/api/v2/vontades', '/api/v2/registros'].includes(url.pathname)) failedReads.add('/' + url.host + url.pathname + url.search + ' due to access control checks.');
            });
            await page.clock.setFixedTime(new Date('2026-10-22T15:30:42Z'));
            await page.goto(base); await login(page);
            await page.waitForFunction(() => !!navigator.serviceWorker.controller && !!localStorage.getItem('revive_offline_account'));
            await page.goto(base + '/vicios/' + habitId);
            const form = page.getByRole('region', { name: 'Registrar vontade', exact: true });
            await until(() => form.getByLabel('Intensidade (0 a 10)').isEnabled());
            const counter = await page.getByRole('heading', { name: 'Dias limpo', exact: true }).locator('..').innerText();
            await form.getByLabel('Intensidade (0 a 10)').focus();
            await page.keyboard.type('0'); await page.keyboard.press('Tab');
            assert.equal(await form.getByLabel('Estresse', { exact: true }).evaluate(element => document.activeElement === element), true);
            await page.keyboard.press('Space');
            await form.getByLabel('Nota (opcional)').fill('Nota sintética');
            const output = process.env.REVIVE_BROWSER_ARTIFACTS;
            if (output) { fs.mkdirSync(output, { recursive: true }); await form.screenshot({ path: path.join(output, `urge-form-${engine}.png`), animations: 'disabled' }); }
            expectedNetworkFailure = true;
            await network(true);
            await form.getByRole('button', { name: 'Salvar vontade', exact: true }).click();
            await until(async () => (await readStore(page, 'outbox')).length === 1);
            const [intent] = await readStore(page, 'outbox');
            assert.equal(intent.type, 'urge.create'); assert.equal(intent.payload.intensidade, 0);
            assert.equal(intent.payload.occurred_at, '2026-10-22T15:30:42.000Z');
            assert.equal(intent.payload.timezone, 'America/Sao_Paulo');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await until(async () => await form.getByLabel('Intensidade (0 a 10)').inputValue() === '0' && await form.getByRole('button', { name: 'Salvar vontade', exact: true }).isDisabled());
            assert.equal((await readStore(page, 'outbox'))[0].id, intent.id);
            assert.equal(await form.getByRole('button', { name: 'Salvar vontade', exact: true }).isDisabled(), true);
            const history = page.getByRole('region', { name: 'Histórico de vontades', exact: true });
            await history.getByText(/Cobertura parcial/).waitFor();
            assert.equal(await history.getByRole('listitem').count(), 1);
            await fetch(base + '/__test/hold-urge-responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
            await page.clock.setFixedTime(new Date('2026-10-22T15:32:42Z'));
            await network(false);
            const waitingSince = Date.now();
            await page.getByRole('button', { name: 'Restaurar sessão', exact: true }).click();
            await until(async () => { const status = await (await fetch(base + '/__test/status')).json(); return status.events.vontades === 1 && (await readStore(page, 'outbox')).some(row => row.id === intent.id && row.status === 'retry'); });
            assert.ok(Date.now() - waitingSince >= 19000, 'A resposta deve permanecer aberta até o timeout real.');
            assert.equal((await readStore(page, 'receipts')).some(row => row.key === intent.id), false);
            // Reopen after the server commit and before receipt reconciliation.
            await page.reload();
            assert.equal((await readStore(page, 'outbox'))[0].id, intent.id);
            await fetch(base + '/__test/hold-urge-responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
            await page.goto(base + '/sincronizacao');
            await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
            await page.getByText('Nenhuma operação aguardando envio.', { exact: true }).waitFor();
            const receipt = (await readStore(page, 'receipts')).find(row => row.key === intent.id);
            assert.equal(receipt.kind, 'confirmed'); assert.equal(receipt.response.vontade.intensidade, 0);
            const status = await (await fetch(base + '/__test/status')).json();
            assert.equal(status.events.vontades, 1); assert.equal(status.events.recaidas, 0); assert.equal(status.events.registros, 0); assert.ok(status.counts.replays >= 1);
            expectedNetworkFailure = false;
            await page.goto(base + '/vicios/' + habitId);
            await form.getByText('Vontade confirmada no servidor. O contador não foi reiniciado.', { exact: true }).waitFor();
            assert.equal(await page.getByRole('heading', { name: 'Dias limpo', exact: true }).locator('..').innerText(), counter);
            await form.getByRole('button', { name: 'Registrar outra vontade', exact: true }).click();
            await form.getByLabel('Intensidade (0 a 10)').fill('10');
            await form.getByLabel('Nota (opcional)').fill('Rascunho sintético preservado');
            await page.getByRole('button', { name: 'Arquivar hábito', exact: true }).click();
            await page.getByRole('button', { name: 'Confirmar arquivamento', exact: true }).click();
            await form.getByText(/Hábito arquivado. Seu rascunho/).waitFor();
            await page.reload();
            await until(async () => await form.getByLabel('Nota (opcional)').inputValue() === 'Rascunho sintético preservado');
            assert.equal(await form.getByRole('button', { name: 'Salvar vontade', exact: true }).isDisabled(), true);
            const rejectedDraft = (await readStore(page, 'meta')).find(row => row.key === 'urgeDraft:' + habitId).value;
            const nativeClient = await playwright.request.newContext();
            const nativeLogin = await nativeClient.post(base + '/api/v2/auth/login', { data: { email: 'a@example.invalid', senha: 'Synthetic!1' } });
            assert.equal(nativeLogin.status(), 200);
            const nativeToken = (await nativeLogin.json()).access_token;
            const refusedPayload = { vicio_id: habitId, occurred_at: rejectedDraft.initial.instant, timezone: rejectedDraft.initial.timezone, intensidade: 10,
                gatilhos: rejectedDraft.triggers, nota: rejectedDraft.note, acao_realizada: null, resultado: null };
            const refusal = await nativeClient.post(base + '/api/v2/vontades', { headers: { Authorization: 'Bearer ' + nativeToken, 'Idempotency-Key': rejectedDraft.eventId }, data: refusedPayload });
            assert.equal(refusal.status(), 404); assert.equal((await refusal.json()).codigo, 'VICIO_NAO_ENCONTRADO');
            await nativeClient.dispose();
            await fetch(base + '/__test/seed-urges', { method: 'POST' });
            await history.getByRole('button', { name: 'Atualizar vontades' }).click();
            await history.getByRole('button', { name: 'Carregar mais vontades' }).click();
            await until(async () => await history.getByRole('listitem').count() === 25);
            assert.equal(await history.getByText('Gatilhos: Outro (trigger_future_1)', { exact: true }).count(), 24);
            const pages = (await readStore(page, 'pages')).filter(row => row.kind === 'urges');
            assert.equal(new Set(pages.flatMap(row => row.data.vontades.map(event => event.id))).size, 25);
            await page.goto(base + '/calendario');
            await page.getByRole('button', { name: 'Carregar mais vontades' }).click();
            const day = page.getByRole('button', { name: '2026-10-22: 0 registros, 25 vontades, 0 recaídas, 0 metas concluídas', exact: true });
            await day.waitFor(); await day.focus(); await page.keyboard.press('Enter');
            assert.equal(await day.getAttribute('aria-pressed'), 'true');
            assert.equal(await day.getByText('Vontade 25').count(), 1);
            if (output) await day.locator('..').locator('..').screenshot({ path: path.join(output, `urge-calendar-${engine}.png`), animations: 'disabled' });
            await network(true); expectedNetworkFailure = true;
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.getByText(/Cobertura parcial:/).waitFor();
            await network(false);
            await page.getByRole('button', { name: 'Restaurar sessão', exact: true }).click();
            await page.evaluate(({ accountId, rejectedDraft, refusedPayload }) => new Promise((resolve, reject) => {
                const open = indexedDB.open('revive-account-' + accountId);
                open.onsuccess = () => {
                    const db = open.result, tx = db.transaction(['meta', 'outbox'], 'readwrite');
                    const meta = tx.objectStore('meta');
                    meta.get('nextSequence').onsuccess = event => {
                        const sequence = Number(event.target.result?.value || 0) + 1;
                        meta.put({ key: 'nextSequence', value: sequence });
                        tx.objectStore('outbox').put({ id: rejectedDraft.eventId, userId: accountId, type: 'urge.create', localId: 'local:' + rejectedDraft.eventId,
                            payload: refusedPayload, sequence, status: 'recovery', attempts: 1, dependsOn: null, nextRetryAt: 0,
                            lastError: { status: 404, code: 'VICIO_NAO_ENCONTRADO', outcomeUnknown: false }, createdAt: new Date().toISOString() });
                    };
                    tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
                };
            }), { accountId, rejectedDraft, refusedPayload });
            await page.goto(base + '/vicios/' + habitId);
            await page.getByRole('button', { name: 'Reativar hábito', exact: true }).click();
            await page.getByRole('button', { name: 'Confirmar reativação', exact: true }).click();
            await page.getByText('Hábito ativo', { exact: true }).waitFor();
            await page.goto(base + '/sincronizacao');
            await page.getByText('Motivo: VICIO_NAO_ENCONTRADO.', { exact: false }).waitFor();
            await page.getByRole('button', { name: 'Recuperar vontade como rascunho', exact: true }).click();
            await until(async () => await form.getByLabel('Nota (opcional)').inputValue() === 'Rascunho sintético preservado' && await form.getByRole('button', { name: 'Salvar vontade', exact: true }).isEnabled());
            assert.equal((await readStore(page, 'outbox')).length, 0);
            assert.equal((await readStore(page, 'receipts')).find(row => row.key === rejectedDraft.eventId).kind, 'replaced');
            await form.getByRole('button', { name: 'Salvar vontade', exact: true }).click();
            await form.getByText('Vontade confirmada no servidor. O contador não foi reiniciado.', { exact: true }).waitFor();
            const recoveredStatus = await (await fetch(base + '/__test/status')).json();
            assert.equal(recoveredStatus.events.vontades, 26); assert.equal(recoveredStatus.events.recaidas, 0);
            await page.getByRole('button', { name: 'Sair', exact: true }).click();
            await login(page, 'b@example.invalid');
            await page.goto(base + '/calendario');
            await page.getByText('Nenhuma vontade neste período nos dados disponíveis.', { exact: true }).waitFor();
            assert.equal(await page.getByText('Nota sintética', { exact: false }).count(), 0);
            // Linux WebKit may omit requestfailed during navigation/reload; accept only known local read diagnostics.
            const interruptedRead = new RegExp(String.raw`/127\.0\.0\.1:${port}/api/v2/(?:bootstrap|(?:registros|vontades)\?[^\s#]+) due to access control checks\.$`);
            const unexpected = errors.filter(error => !(engine === 'webkit' && (
                [...failedReads].some(diagnostic => error.message.trim().endsWith(diagnostic))
                || interruptedRead.test(error.message.trim())
                || error.expectedNetworkFailure && error.message.trim().endsWith(`/127.0.0.1:${port}/api/v2/web-auth/refresh due to access control checks.`)
            )));
            assert.deepEqual(unexpected, []);
            const storage = await verifyStorageIsolation(context);
            results.push({ ...storage, engine, browserVersion: browser.version(), offlineReload: true, lostCommitResponse: true, timeoutAfterCommit: true, sameKeyReplay: true, transactionalReceipt: true,
                counterUnchanged: true, tiedPages: true, unknownTriggers: true, archiveDraft: true, definitiveRejectionRecovery: true, partialCalendar: true, keyboardAndAccessibleNames: true, accountIsolation: true });
            await context.close();
        } finally {
            await browser?.close();
            if (server.exitCode === null && server.signalCode === null) { const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped; }
        }
    }
    console.log(JSON.stringify(results, null, 2));
    if (process.env.REVIVE_BROWSER_ARTIFACTS) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_ARTIFACTS, 'urges-results.json'), JSON.stringify(results, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
