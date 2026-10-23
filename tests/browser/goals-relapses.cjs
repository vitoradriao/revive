const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const { spawn } = require('node:child_process');
const playwright = require('playwright');
const accountId = '00000000-0000-4000-8000-000000000001', habitId = '10000000-0000-4000-8000-000000000001';
const freePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const until = async check => {
    const deadline = Date.now() + 25000;
    while (!await check()) { if (Date.now() > deadline) throw new Error('Estado esperado de metas/recaídas não chegou.'); await new Promise(resolve => setTimeout(resolve, 100)); }
};
const readStore = (page, name, userId = accountId) => page.evaluate(({ name, userId }) => new Promise((resolve, reject) => {
    const open = indexedDB.open('revive-account-' + userId);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
        const db = open.result, tx = db.transaction(name), request = tx.objectStore(name).getAll();
        let rows; request.onsuccess = () => { rows = request.result; };
        tx.oncomplete = () => { db.close(); resolve(rows); }; tx.onabort = () => reject(tx.error);
    };
}), { name, userId });
const login = async (page, email = 'a@example.invalid') => {
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
    await page.getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Sair', exact: true }).waitFor();
};
(async () => {
    const results = [];
    for (const engine of (process.env.REVIVE_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
        const port = await freePort(), base = `http://127.0.0.1:${port}`;
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'revive-goals-'));
        const server = spawn(process.execPath, [path.join(__dirname, 'session-fixture.cjs')], { env: { ...process.env, REVIVE_BROWSER_API_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
        let context, page;
        const errors = [], failedReads = new Set(), requests = [];
        let expectedNetworkFailure = false;
        const control = async (name, input = {}) => {
            const response = await fetch(base + '/__test/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
            assert.equal(response.status, 204);
        };
        const stats = async () => (await fetch(base + '/__test/status')).json();
        const observe = target => {
            target.on('pageerror', error => errors.push({ message: error.message, expectedNetworkFailure }));
            target.on('request', request => {
                const url = new URL(request.url());
                if (url.origin === base && request.method() !== 'GET' && (/^\/api\/v2\/metas/.test(url.pathname) || url.pathname.endsWith('/recaida'))) requests.push({ path: url.pathname, key: request.headers()['idempotency-key'], body: request.postData() });
            });
        };
        const open = async () => {
            context = await playwright[engine].launchPersistentContext(profile, { headless: true, viewport: { width: 1280, height: 1000 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
            context.setDefaultTimeout(25000);
            await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
            context.on('requestfailed', request => {
                const url = new URL(request.url());
                if (url.origin === base && ((request.method() === 'GET' && ['/api/v2/bootstrap', '/api/v2/registros', '/api/v2/vontades', '/api/v2/web-auth/refresh'].includes(url.pathname)) || url.pathname === '/api/v2/registros/search')) failedReads.add('/' + url.host + url.pathname + url.search + ' due to access control checks.');
            });
            page = await context.newPage(); observe(page);
        };
        const shot = async name => {
            if (!process.env.REVIVE_BROWSER_ARTIFACTS) return;
            fs.mkdirSync(process.env.REVIVE_BROWSER_ARTIFACTS, { recursive: true });
            const regions = {
                offline: page.getByRole('group', { name: 'Meta: Meta offline sintética', exact: true }),
                confirmed: page.locator('details').filter({ hasText: 'Metas concluídas (1)' }),
                'delete-failed': page.getByRole('dialog', { name: 'Excluir meta definitivamente?' }),
                conflict: page.getByRole('region', { name: 'Registros de recaída' })
            };
            await (regions[name] || page).screenshot({ path: path.join(process.env.REVIVE_BROWSER_ARTIFACTS, `goals-${name}-${engine}.png`), animations: 'disabled' });
        };
        try {
            console.log(engine + ': início');
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Fixture não iniciou.')), 10000);
                server.once('error', reject); server.stdout.on('data', chunk => { if (String(chunk).includes('Synthetic session HTTP API')) { clearTimeout(timer); resolve(); } });
            });
            await control('seed-goals'); await open(); await page.goto(base); await login(page);
            await page.waitForFunction(() => !!navigator.serviceWorker.controller && !!localStorage.getItem('revive_offline_account'));
            await page.goto(base + '/metas');
            const archived = page.getByRole('group', { name: 'Meta: Meta legada arquivada', exact: true });
            await archived.getByText('50%', { exact: true }).waitFor();
            await page.getByRole('button', { name: 'Nova meta', exact: true }).click();
            await page.getByRole('button', { name: 'Selecione um hábito', exact: true }).click();
            assert.equal(await page.getByRole('option', { name: 'Hábito arquivado sintético', exact: true }).count(), 0);
            await page.getByRole('option', { name: 'Hábito sintético', exact: true }).click();
            await page.getByLabel('Descrição da meta', { exact: true }).fill('Meta offline sintética');
            await page.getByLabel('Dias objetivo', { exact: true }).fill('30');
            expectedNetworkFailure = true; await control('network', { offline: true });
            await page.getByRole('button', { name: 'Adicionar meta', exact: true }).evaluate(button => { button.click(); button.click(); });
            await until(async () => (await readStore(page, 'outbox')).length === 1);
            console.log(engine + ': criação offline');
            const [creation] = await readStore(page, 'outbox');
            assert.equal(creation.type, 'goal.create'); assert.equal(creation.payload.dias_abstinencia_inicio, undefined);
            const local = page.getByRole('group', { name: 'Meta: Meta offline sintética', exact: true });
            await local.getByText(/Base será confirmada/).waitFor();
            await local.getByRole('button', { name: 'Marcar como concluída' }).evaluate(button => { button.click(); button.click(); });
            await until(async () => (await readStore(page, 'outbox')).length === 2);
            console.log(engine + ': conclusão dependente');
            const child = (await readStore(page, 'outbox')).find(row => row.type === 'goal.complete');
            assert.equal(child.dependsOn, creation.id); assert.equal(await local.getByRole('button', { name: 'Excluir meta', exact: true }).isDisabled(), true);
            await shot('offline');
            await context.close(); await open(); await page.goto(base + '/metas');
            await page.getByRole('group', { name: 'Meta: Meta offline sintética', exact: true }).waitFor();
            assert.equal((await readStore(page, 'outbox')).length, 2);
            console.log(engine + ': reabertura offline');
            await control('goal-transport', { mode: 'drop' }); await control('network', { offline: false });
            await page.getByRole('button', { name: 'Restaurar sessão', exact: true }).click();
            await until(async () => (await stats()).events.metas === 2);
            await until(async () => (await readStore(page, 'outbox')).some(row => row.status === 'retry'));
            await control('goal-transport', { mode: 'normal' }); expectedNetworkFailure = false;
            await page.goto(base + '/sincronizacao');
            await page.getByRole('button', { name: 'Tentar novamente', exact: true }).first().click();
            await until(async () => (await readStore(page, 'outbox')).length === 0);
            console.log(engine + ': recibos');
            const receipts = await readStore(page, 'receipts');
            assert.equal(receipts.find(row => row.key === creation.id).kind, 'confirmed');
            assert.equal(receipts.find(row => row.key === child.id).kind, 'confirmed');
            assert.equal(receipts.find(row => row.key === creation.id).intentPayload.dias_objetivo, 30);
            const creationCalls = requests.filter(row => row.key === creation.id);
            assert.ok(creationCalls.length >= 2); assert.equal(new Set(creationCalls.map(row => row.body)).size, 1);
            assert.equal((await stats()).events.metas, 2);
            await page.goto(base + '/metas');
            await page.getByText('Metas concluídas (1)', { exact: true }).click();
            await page.getByText('Meta offline sintética', { exact: true }).waitFor();
            await shot('confirmed');
            await control('fail-goal-delete', { enabled: true });
            await page.getByRole('button', { name: 'Excluir meta concluída', exact: true }).click();
            const deletion = page.getByRole('dialog', { name: 'Excluir meta definitivamente?' });
            await deletion.waitFor(); assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Cancelar');
            await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Confirmar exclusão');
            await deletion.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
            await deletion.getByRole('alert').waitFor(); assert.equal((await stats()).events.metas, 2);
            assert.equal((await readStore(page, 'outbox')).length, 0); await shot('delete-failed');
            await deletion.getByRole('button', { name: 'Cancelar', exact: true }).click();
            await control('fail-goal-delete', { enabled: false });
            await page.getByRole('button', { name: 'Excluir meta concluída', exact: true }).click();
            await deletion.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
            await until(async () => (await stats()).events.metas === 1);
            await until(async () => !(await readStore(page, 'snapshots'))[0].data.metas.some(row => row.id === receipts.find(item => item.key === creation.id).response.meta.id));
            console.log(engine + ': recaída');
            await page.goto(base + '/vicios/' + habitId);
            await page.getByRole('button', { name: 'Registrar Recaída', exact: true }).click();
            let dialog = page.getByRole('dialog', { name: 'Registrar recaída' });
            assert.equal(await dialog.getByRole('button', { name: 'Salvar recaída' }).isDisabled(), true);
            await dialog.getByRole('radio', { name: /Não, manter/ }).check();
            await dialog.getByLabel('Data da recaída').fill('2026-10-22');
            await dialog.getByLabel('Horário da recaída').fill('22:30');
            await dialog.getByLabel('Fuso da recaída').fill('America/Sao_Paulo');
            await dialog.getByRole('button', { name: 'Salvar recaída' }).click();
            await until(async () => (await stats()).events.recaidas === 1 && (await readStore(page, 'outbox')).length === 0);
            assert.equal((await readStore(page, 'snapshots'))[0].data.vicios.find(row => row.id === habitId).progresso.sequencia_atual_dias, 32);
            const nonReset = requests.find(row => row.path.endsWith('/recaida'));
            assert.equal(JSON.parse(nonReset.body).resetarContador, false); assert.equal(JSON.parse(nonReset.body).occurred_at, '2026-10-23T01:30:00.000Z');
            // O transporte retém uma resposta já commitada até o timeout real de 20 s.
            await control('goal-transport', { mode: 'hold' });
            await page.getByRole('button', { name: 'Registrar Recaída', exact: true }).click();
            dialog = page.getByRole('dialog', { name: 'Registrar recaída' });
            await dialog.getByRole('radio', { name: /Sim, iniciar/ }).check();
            await dialog.getByRole('button', { name: 'Salvar recaída' }).click();
            await until(async () => (await stats()).events.recaidas === 2);
            const pendingReset = (await readStore(page, 'outbox'))[0];
            assert.equal(pendingReset.payload.resetarContador, true);
            assert.equal((await readStore(page, 'snapshots'))[0].data.vicios.find(row => row.id === habitId).progresso.sequencia_atual_dias, 32);
            await until(async () => (await readStore(page, 'outbox')).some(row => row.status === 'retry'));
            await control('goal-transport', { mode: 'normal' });
            await page.goto(base + '/sincronizacao'); await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
            await until(async () => (await readStore(page, 'outbox')).length === 0);
            const afterReset = (await readStore(page, 'snapshots'))[0].data.vicios.find(row => row.id === habitId).progresso;
            assert.equal(afterReset.sequencia_atual_dias, 0); assert.equal(afterReset.recorde_dias, 32); assert.ok(afterReset.marcos.length);
            const resetReceipt = (await readStore(page, 'receipts')).find(row => row.key === pendingReset.id);
            assert.equal(resetReceipt.intentPayload.timezone, pendingReset.payload.timezone);
            assert.equal(resetReceipt.intentPayload.occurred_at, pendingReset.payload.occurred_at);
            const resetCalls = requests.filter(row => row.key === pendingReset.id);
            assert.equal(resetCalls.length, 2); assert.equal(resetCalls[0].body, resetCalls[1].body);
            assert.equal((await stats()).events.recaidas, 2);
            await page.goto(base + '/vicios/' + habitId);
            await page.getByRole('button', { name: 'Registrar Recaída', exact: true }).click();
            await control('archive-goal-habit', { archived: true });
            const other = await context.newPage(); observe(other); await other.goto(base + '/vicios/' + habitId);
            assert.equal((await stats()).goalHabitActive, false);
            await other.getByRole('button', { name: 'Consultar estado remoto', exact: true }).click();
            await until(async () => (await readStore(other, 'snapshots'))[0].data.vicios.find(row => row.id === habitId).ativo === false);
            await dialog.getByRole('radio', { name: /Não, manter/ }).check();
            await dialog.getByRole('button', { name: 'Salvar recaída' }).click();
            await dialog.getByRole('alert').waitFor();
            assert.equal((await readStore(page, 'outbox')).length, 0);
            await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
            await control('archive-goal-habit', { archived: false });
            await other.getByRole('button', { name: 'Consultar estado remoto', exact: true }).click();
            await other.getByText('Hábito ativo', { exact: true }).waitFor();
            await page.getByRole('button', { name: 'Registrar Recaída', exact: true }).click();
            await dialog.getByRole('radio', { name: /Não, manter/ }).check();
            await control('archive-goal-habit', { archived: true });
            await dialog.getByRole('button', { name: 'Salvar recaída' }).click();
            await dialog.waitFor({ state: 'hidden' });
            await until(async () => (await readStore(page, 'outbox')).some(row => row.status === 'recovery'));
            assert.equal((await stats()).events.recaidas, 2);
            await page.getByRole('region', { name: 'Registros de recaída' }).getByText(/Falha ou conflito/).waitFor(); await shot('conflict');
            await control('archive-goal-habit', { archived: false });
            await page.goto(base + '/sincronizacao'); await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
            await until(async () => (await readStore(page, 'outbox')).length === 0);
            // Nova intenção sem sessão válida permanece em disco até autenticação explícita.
            await page.goto(base + '/metas');
            await page.getByRole('group', { name: 'Meta: Meta legada arquivada', exact: true }).waitFor();
            console.log(engine + ': sessão expirada');
            await control('revoke-on-goal-write');
            await page.getByRole('group', { name: 'Meta: Meta legada arquivada', exact: true }).getByRole('button', { name: 'Marcar como concluída' }).click();
            await page.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
            assert.equal((await readStore(page, 'outbox')).length, 1);
            await login(page);
            await until(async () => (await readStore(page, 'outbox')).length === 0);
            await control('goal-transport', { mode: 'hold' });
            await page.goto(base + '/vicios/' + habitId);
            await page.getByRole('button', { name: 'Registrar Recaída', exact: true }).click();
            await dialog.getByRole('radio', { name: /Não, manter/ }).check();
            await dialog.getByRole('button', { name: 'Salvar recaída' }).click();
            await until(async () => (await stats()).events.recaidas === 4);
            const late = (await readStore(page, 'outbox'))[0];
            // Uma invalidação de outra aba interrompe A, seguida de login real em B.
            await other.evaluate(() => localStorage.setItem('revive_auth_metadata', JSON.stringify({ epoch: crypto.randomUUID(), revision: 0 })));
            await page.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor(); await login(page, 'b@example.invalid');
            await control('goal-transport', { mode: 'normal' });
            await page.goto(base + '/metas'); await page.getByText('Nenhuma meta ativa', { exact: true }).waitFor();
            assert.equal(await page.getByText('Meta legada arquivada', { exact: true }).count(), 0);
            assert.ok((await readStore(page, 'outbox')).some(row => row.id === late.id));
            assert.equal((await readStore(page, 'receipts')).some(row => row.key === late.id), false);
            await shot('account-b');
            const interruptedRead = new RegExp(String.raw`/127\.0\.0\.1:${port}/api/v2/(?:bootstrap|registros(?:\?[^\s#]+)?|registros/search|vontades(?:\?[^\s#]+)?|web-auth/refresh|preferences) due to access control checks\.$`);
            const unexpected = errors.filter(error => !(engine === 'webkit' && ([...failedReads].some(diagnostic => error.message.trim().endsWith(diagnostic)) || interruptedRead.test(error.message.trim()) || error.expectedNetworkFailure && error.message.trim().endsWith(`/127.0.0.1:${port}/api/v2/web-auth/refresh due to access control checks.`))));
            assert.deepEqual(unexpected, []);
            results.push({ engine, browserVersion: context.browser().version(), offlineRestart: true, dependentCompletion: true, doubleAction: true, lostCommitResponse: true, timeoutAfterCommit: true,
                stableKeyPayloadMoment: true, transactionalReceipts: true, archiveVisibility: true, archiveDuringForm: true,
                explicitResetAndTimezone: true, noOptimisticReset: true, recordAndAwardsPreserved: true, failedDeletionPreserved: true,
                confirmedDeletion: true, expiredSessionPreserved: true, accountIsolation: true, keyboardFocus: true });
        } finally {
            await context?.close(); fs.rmSync(profile, { recursive: true, force: true });
            if (server.exitCode === null && server.signalCode === null) { const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped; }
        }
    }
    console.log(JSON.stringify(results, null, 2));
    if (process.env.REVIVE_BROWSER_ARTIFACTS) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_ARTIFACTS, 'goals-relapses-results.json'), JSON.stringify(results, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
