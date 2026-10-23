const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const playwright = require('playwright');
const accountId = '00000000-0000-4000-8000-000000000001';
const habitId = '10000000-0000-4000-8000-000000000001';
const freePort = () => new Promise(resolve => {
    const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const readStores = (page, userId = accountId) => page.evaluate(userId => new Promise((resolve, reject) => {
    const open = indexedDB.open('revive-account-' + userId);
    open.onerror = () => reject(new Error('Não foi possível abrir armazenamento sintético'));
    open.onsuccess = () => {
        const db = open.result, names = [...db.objectStoreNames], tx = db.transaction(names), counts = {};
        for (const name of names) tx.objectStore(name).count().onsuccess = event => { counts[name] = event.target.result; };
        tx.oncomplete = () => { db.close(); resolve(counts); };
    };
}), userId);
const seed = page => page.evaluate(({ accountId, habitId }) => navigator.locks.request('revive-sync-' + accountId, () => new Promise((resolve, reject) => {
    const open = indexedDB.open('revive-account-' + accountId);
    open.onerror = () => reject(new Error('Não foi possível abrir armazenamento sintético'));
    open.onsuccess = () => {
        const db = open.result, tx = db.transaction(['outbox', 'meta', 'pages'], 'readwrite'), id = crypto.randomUUID();
        tx.objectStore('outbox').put({ id, userId: accountId, type: 'record.create', payload: { vicio_id: habitId, humor: 'bom', data_registro: '2026-10-23', timezone: 'America/Sao_Paulo' },
            sequence: 1, localId: 'local:' + id, status: 'pending', attempts: 0, nextRetryAt: 0, dependsOn: null, createdAt: new Date().toISOString(), lastError: null });
        tx.objectStore('meta').put({ key: 'nextSequence', value: 1 });
        tx.objectStore('meta').put({ key: 'recordDraft:synthetic', value: { humor: 'bom' } });
        tx.objectStore('pages').put({ key: 'records:synthetic', data: { registros: [] } });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(new Error('Falha na gravação sintética'));
    };
})), { accountId, habitId });
const waitFor = async condition => {
    for (let count = 0; count < 150; count++) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error('Estado esperado não confirmado');
};
(async () => {
    const results = [];
    for (const engine of (process.env.REVIVE_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
        const port = await freePort(), base = `http://127.0.0.1:${port}`;
        const server = spawn(process.execPath, [path.join(__dirname, 'session-fixture.cjs')], { env: { ...process.env, REVIVE_BROWSER_API_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
        let browser;
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Fixture indisponível')), 10000);
                server.stdout.on('data', chunk => { if (String(chunk).includes('Synthetic session HTTP API')) { clearTimeout(timer); resolve(); } }); server.once('error', reject);
            });
            browser = await playwright[engine].launch({ headless: true });
            const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' });
            context.setDefaultTimeout(15000);
            const errors = [], failedReads = new Set();
            const newPage = async () => {
                const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
                page.on('requestfailed', request => {
                    const url = new URL(request.url());
                    if (request.method() === 'GET' && url.origin === base && ['/api/v2/bootstrap', '/api/v2/registros', '/api/v2/vontades', '/api/v2/web-auth/refresh'].includes(url.pathname)) failedReads.add('/' + url.host + url.pathname + url.search + ' due to access control checks.');
                }); return page;
            };
            const control = async (endpoint, body = {}) => {
                const response = await fetch(base + '/__test/' + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                assert.equal(response.status, 204);
            };
            const a = await newPage();
            await a.goto(base + '/recuperar-senha');
            await a.waitForLoadState('networkidle');
            await a.getByRole('heading', { name: 'Recuperar senha' }).waitFor();
            await a.getByLabel('E-mail da conta').fill('a@example.invalid');
            await context.setOffline(true);
            await a.getByRole('button', { name: 'Solicitar código' }).click();
            await a.getByRole('alert').filter({ hasText: 'Sem conexão' }).waitFor();
            await context.setOffline(false);
            for (const mode of ['disabled', 'smtp']) {
                await control('account-mode', { mode });
                await a.reload(); await a.waitForLoadState('networkidle'); await a.getByLabel('E-mail da conta').fill('a@example.invalid');
                await a.getByRole('button', { name: 'Solicitar código' }).click();
                await a.getByRole('status').filter({ hasText: 'Se houver uma conta' }).waitFor();
                await a.getByText(/não confirma a entrega/).waitFor();
                assert.equal(await a.getByRole('button', { name: /Reenviar em/ }).isDisabled(), true);
            }
            await control('account-mode', { mode: 'normal' }); await a.reload(); await a.waitForLoadState('networkidle');
            await a.getByLabel('E-mail da conta').fill('a@example.invalid');
            const requested = a.waitForResponse(response => response.url().endsWith('/password-recovery/request'));
            await a.getByRole('button', { name: 'Solicitar código' }).click();
            const receipt = await (await requested).json();
            const delivery = await (await fetch(base + '/__test/recovery-delivery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: receipt.request_id }) })).json();
            await a.getByLabel('Código de oito dígitos').waitFor();
            assert.equal(await a.getByLabel('Código de oito dígitos').evaluate(element => element === document.activeElement), true);
            const output = process.env.REVIVE_BROWSER_ARTIFACTS;
            if (output) await a.getByRole('region', { name: 'Recuperar senha' }).screenshot({ path: path.join(output, `account-recovery-${engine}.png`), animations: 'disabled' });
            let newPassword = 'Synthetic!Changed2';
            const setSecrets = async code => {
                await a.evaluate(({ code, password }) => {
                    const set = (label, value) => {
                        const input = [...document.querySelectorAll('label')].find(node => node.textContent.startsWith(label)).querySelector('input');
                        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    };
                    set('Código de oito dígitos', code); set('Nova senha', password); set('Confirmar nova senha', password);
                }, { code, password: newPassword });
            };
            const wrong = (delivery.code[0] === '0' ? '1' : '0') + delivery.code.slice(1);
            await setSecrets(wrong); await a.getByRole('button', { name: 'Redefinir senha', exact: true }).click();
            await a.getByRole('alert').filter({ hasText: 'Código inválido' }).waitFor();
            for (const [mode, text] of [['expired', 'Código inválido'], ['limited', 'Muitas tentativas'], ['unavailable', 'Não foi possível redefinir']]) {
                await control('account-mode', { mode }); await setSecrets(delivery.code);
                await a.getByRole('button', { name: 'Redefinir senha', exact: true }).click();
                await a.getByRole('alert').filter({ hasText: text }).waitFor();
            }
            await control('account-mode', { mode: 'normal' }); await setSecrets(delivery.code);
            const persisted = await a.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href }));
            assert.ok(!persisted.includes(newPassword) && !persisted.includes(delivery.code));
            await a.getByRole('button', { name: 'Redefinir senha', exact: true }).click();
            await a.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
            await a.getByRole('status').filter({ hasText: 'Senha redefinida' }).waitFor();
            const replay = await context.request.post(base + '/api/v2/auth/password-recovery/confirm', { data: { email: 'a@example.invalid', request_id: receipt.request_id, codigo: delivery.code, senha: newPassword } });
            assert.equal(replay.status(), 400);
            const login = async (page, email = 'a@example.invalid', password = newPassword) => {
                await page.goto(base + '/login'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Senha', { exact: true }).fill(password);
                await page.getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
                await page.getByRole('button', { name: 'Ver detalhes', exact: true }).waitFor();
                await page.goto(base + '/perfil'); await page.getByRole('button', { name: 'Excluir conta', exact: true }).waitFor();
                await waitFor(async () => (await readStores(page, email === 'b@example.invalid' ? '00000000-0000-4000-8000-000000000002' : accountId)).snapshots > 0);
            };
            const oldLogin = await context.request.post(base + '/api/v2/web-auth/login', { headers: { Origin: base }, data: { email: 'a@example.invalid', senha: 'Synthetic!1' } }); assert.equal(oldLogin.status(), 401);
            await login(a);
            const b = await newPage();
            await b.addInitScript(() => {
                window.holdAuthNotices = false;
                window.addEventListener('storage', event => {
                    if (window.holdAuthNotices && event.key === 'revive_auth_metadata') event.stopImmediatePropagation();
                }, true);
                const NativeChannel = window.BroadcastChannel;
                window.BroadcastChannel = class extends NativeChannel {
                    constructor(name) {
                        super(name);
                        this.addEventListener('message', event => {
                            if (window.holdAuthNotices && name === 'revive-web-auth') event.stopImmediatePropagation();
                        });
                    }
                };
            });
            await b.goto(base + '/perfil'); await b.getByRole('heading', { name: 'Perfil', exact: true }).waitFor();
            await a.getByRole('link', { name: 'Redefinir senha por e-mail' }).click();
            await a.getByLabel('E-mail da conta').fill('a@example.invalid');
            const profileRequest = a.waitForResponse(response => response.url().endsWith('/password-recovery/request'));
            await a.getByRole('button', { name: 'Solicitar código' }).click();
            const profileReceipt = await (await profileRequest).json();
            const profileDelivery = await (await fetch(base + '/__test/recovery-delivery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: profileReceipt.request_id }) })).json();
            await a.getByLabel('Código de oito dígitos').waitFor(); newPassword = 'Synthetic!Profile3';
            await setSecrets(profileDelivery.code); await a.getByRole('button', { name: 'Redefinir senha', exact: true }).click();
            await a.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
            await b.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
            assert.equal((await context.cookies()).filter(cookie => cookie.name === 'revive_refresh').length, 0);
            await login(a); await b.goto(base + '/perfil'); await b.getByRole('heading', { name: 'Perfil', exact: true }).waitFor();

            await control('block-mutations'); await seed(a); await a.reload(); await a.getByRole('heading', { name: 'Perfil', exact: true }).waitFor();
            await a.getByRole('button', { name: 'Sair da conta', exact: true }).click();
            const exit = a.getByRole('dialog', { name: 'Há operações pendentes' }); await exit.waitFor();
            assert.equal(await exit.getByRole('button', { name: 'Cancelar', exact: true }).evaluate(node => node === document.activeElement), true);
            await exit.getByRole('button', { name: 'Cancelar', exact: true }).click(); assert.equal((await readStores(a)).outbox, 1);
            await a.getByRole('button', { name: 'Sair da conta', exact: true }).click(); await exit.getByRole('button', { name: 'Sincronizar e sair' }).click();
            await exit.getByRole('alert').waitFor(); assert.equal((await readStores(a)).outbox, 1);
            if (output) await exit.screenshot({ path: path.join(output, `account-logout-${engine}.png`), animations: 'disabled' });
            // Reset only transport blocking; retry backoff is respected by the coordinator.
            await control('reset-block-mutations');
            await new Promise(resolve => setTimeout(resolve, 2200));
            await exit.getByRole('button', { name: 'Sincronizar e sair' }).click();
            await a.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
            await b.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
            assert.ok(Object.values(await readStores(a)).every(count => count === 0));
            await login(a); await control('block-mutations'); await seed(a); await a.reload(); await a.getByRole('heading', { name: 'Perfil', exact: true }).waitFor();
            await context.route('**/api/v2/web-auth/logout', route => route.abort());
            await a.getByRole('button', { name: 'Sair da conta', exact: true }).click(); await exit.getByRole('button', { name: 'Descartar pendências e sair' }).click();
            await exit.getByRole('alert').waitFor(); assert.equal((await readStores(a)).outbox, 1);
            await context.unroute('**/api/v2/web-auth/logout');
            // Interrupt only the local clear transaction after a real confirmed logout.
            for (const page of [a, b]) await page.evaluate(() => {
                const original = IDBDatabase.prototype.transaction;
                IDBDatabase.prototype.transaction = function (names, mode, ...options) {
                    const tx = original.call(this, names, mode, ...options);
                    if (mode === 'readwrite' && Array.isArray(names) && names.length === this.objectStoreNames.length) queueMicrotask(() => tx.abort());
                    return tx;
                };
            });
            await exit.getByRole('button', { name: 'Descartar pendências e sair' }).click();
            await a.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
            assert.equal((await readStores(a)).outbox, 1);
            assert.equal(await a.evaluate(() => localStorage.getItem('revive_confirmed_cleanup:00000000-0000-4000-8000-000000000001')), 'confirmed');
            await a.getByLabel('Email', { exact: true }).fill('b@example.invalid');
            await a.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
            await a.getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
            await a.getByRole('button', { name: 'Novo hábito', exact: true }).first().waitFor();
            await a.evaluate(() => {
                localStorage.setItem('revive_theme', 'dark');
                history.pushState({}, '', '/sincronizacao'); window.dispatchEvent(new PopStateEvent('popstate'));
            });
            await a.getByText('Nenhuma operação aguardando envio.', { exact: true }).waitFor();
            assert.equal((await readStores(a)).outbox, 1);
            await a.reload(); await a.getByRole('heading', { name: 'Sincronização', exact: true }).waitFor();
            await waitFor(async () => Object.values(await readStores(a)).every(count => count === 0));
            assert.equal(await a.evaluate(() => localStorage.getItem('revive_theme')), 'dark');
            assert.equal(await a.evaluate(() => localStorage.getItem('revive_confirmed_cleanup:00000000-0000-4000-8000-000000000001')), null);
            await a.getByRole('button', { name: 'Sair', exact: true }).click();
            await a.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
            await control('reset-block-mutations'); await login(a); await control('block-mutations'); await seed(a); await a.reload();
            await a.getByRole('heading', { name: 'Perfil', exact: true }).waitFor();
            await a.getByRole('button', { name: 'Excluir conta', exact: true }).click();
            const deletion = a.getByRole('dialog', { name: 'Excluir sua conta permanentemente?' }); await deletion.waitFor();
            assert.equal(await deletion.getByRole('button', { name: 'Cancelar exclusão' }).evaluate(node => node === document.activeElement), true);
            await a.keyboard.press('Tab');
            assert.equal(await deletion.getByRole('button', { name: 'Confirmar exclusão permanente' }).evaluate(node => node === document.activeElement), true);
            await a.keyboard.press('Shift+Tab'); await a.keyboard.press('Escape'); await deletion.waitFor({ state: 'hidden' });
            assert.equal(await a.getByRole('button', { name: 'Excluir conta', exact: true }).evaluate(node => node === document.activeElement), true);
            await a.getByRole('button', { name: 'Excluir conta', exact: true }).click();
            await deletion.getByRole('button', { name: 'Cancelar exclusão' }).click(); assert.equal((await readStores(a)).outbox, 1);
            await control('account-mode', { mode: 'delete-failure' });
            await a.getByRole('button', { name: 'Excluir conta', exact: true }).click();
            await deletion.getByRole('button', { name: 'Confirmar exclusão permanente' }).click();
            await deletion.getByRole('alert').waitFor(); assert.equal((await readStores(a)).outbox, 1);
            if (output) await deletion.screenshot({ path: path.join(output, `account-delete-failure-${engine}.png`), animations: 'disabled' });
            await context.route('**/api/v2/account', async route => { await new Promise(resolve => setTimeout(resolve, 13000)); await route.abort().catch(() => {}); });
            await deletion.getByRole('button', { name: 'Confirmar exclusão permanente' }).click();
            await deletion.getByRole('alert').waitFor(); assert.equal((await readStores(a)).outbox, 1);
            await context.unroute('**/api/v2/account');
            await b.goto(base + '/perfil'); await b.getByRole('heading', { name: 'Perfil', exact: true }).waitFor();
            await b.evaluate(() => { window.holdAuthNotices = true; });
            await control('account-mode', { mode: 'normal' });
            await deletion.getByRole('button', { name: 'Confirmar exclusão permanente' }).click();
            await a.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
            await a.getByRole('status').filter({ hasText: 'Conta excluída' }).waitFor();
            await b.getByRole('heading', { name: 'Perfil', exact: true }).waitFor();
            assert.ok(Object.values(await readStores(a)).every(count => count === 0));
            assert.equal((await context.cookies()).filter(cookie => cookie.name === 'revive_refresh').length, 0);
            assert.equal(await a.evaluate(() => localStorage.getItem('revive_offline_account')), null);
            assert.equal(await a.evaluate(() => localStorage.getItem('revive_theme')), null);
            await login(a, 'b@example.invalid', 'Synthetic!1');
            assert.equal(await a.getByText('Conta A sintética', { exact: true }).count(), 0);
            let staleDeletes = 0;
            b.on('request', request => { if (request.method() === 'DELETE' && new URL(request.url()).pathname === '/api/v2/account') staleDeletes++; });
            await b.getByRole('button', { name: 'Excluir conta', exact: true }).click();
            await b.getByRole('button', { name: 'Confirmar exclusão permanente' }).click();
            await b.getByRole('alert').filter({ hasText: 'A conta mudou' }).waitFor();
            assert.equal(staleDeletes, 0);
            assert.equal((await context.cookies()).filter(cookie => cookie.name === 'revive_refresh').length, 1);
            await b.reload(); await b.getByRole('heading', { name: 'Perfil', exact: true }).waitFor();
            assert.equal(await b.getByText('Conta A sintética', { exact: true }).count(), 0);
            const interruptedRead = new RegExp(String.raw`/127\.0\.0\.1:${port}/api/v2/(?:bootstrap|registros\?[^\s#]+|vontades\?[^\s#]+|web-auth/refresh) due to access control checks\.$`);
            assert.deepEqual(errors.filter(message => !(engine === 'webkit' && ([...failedReads].some(diagnostic => message.trim().endsWith(diagnostic)) || interruptedRead.test(message.trim())))), []);
            results.push({ engine, browserVersion: await browser.version(), keyboard: true, delayedTabNoticeRefused: true, recovery: ['offline', 'neutral SMTP/rollout', 'cooldown', 'invalid', 'expired', 'limited', 'unavailable', 'success', 'replay', 'old password rejected', 'profile reset invalidates both tabs'], logout: ['cancel', 'sync failure preserved', 'sync success', 'discard', 'confirmed cleanup resumed after interrupted IndexedDB transaction'], deletion: ['cancel', 'failure preserved', 'real timeout preserved', 'confirmed cleanup', 'cookie expired'], tabs: 2, indexedDB: 'real', locks: 'real', secretsPersisted: false });
            await context.close();
        } finally {
            await browser?.close();
            if (server.exitCode === null && server.signalCode === null) { const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped; }
        }
    }
    console.log(JSON.stringify(results, null, 2));
    if (process.env.REVIVE_BROWSER_ARTIFACTS) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_ARTIFACTS, 'account-lifecycle-results.json'), JSON.stringify(results, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
