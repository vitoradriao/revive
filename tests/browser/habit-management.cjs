const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const playwright = require('playwright');
const accountId = '00000000-0000-4000-8000-000000000001';
const habitId = '10000000-0000-4000-8000-000000000001';
const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const entries = page => page.evaluate(userId => new Promise((resolve, reject) => {
    const open = indexedDB.open('revive-account-' + userId);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
        const db = open.result, tx = db.transaction('outbox'), read = tx.objectStore('outbox').getAll();
        let rows; read.onsuccess = () => { rows = read.result; };
        tx.oncomplete = () => { db.close(); resolve(rows); };
    };
}), accountId);
const insertEarlierIntent = page => page.evaluate(({ accountId, habitId }) => navigator.locks.request('revive-sync-' + accountId, () => new Promise((resolve, reject) => {
    const open = indexedDB.open('revive-account-' + accountId);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
        const db = open.result, tx = db.transaction(['outbox', 'meta'], 'readwrite');
        const id = crypto.randomUUID();
        tx.objectStore('outbox').put({ id, userId: accountId, type: 'record.create',
            payload: { vicio_id: habitId, humor: 'bom', data_registro: '2026-10-01', timezone: 'America/Sao_Paulo' },
            sequence: 1, localId: 'local:' + id, status: 'pending', attempts: 0, nextRetryAt: 0, dependsOn: null,
            createdAt: '2026-10-01T12:00:00Z', lastError: null });
        tx.objectStore('meta').put({ key: 'nextSequence', value: 1 });
        tx.oncomplete = () => { db.close(); resolve(id); }; tx.onabort = () => reject(tx.error);
    };
})), { accountId, habitId });
const waitEnabled = locator => locator.evaluate(element => new Promise(resolve => {
    if (!element.disabled) return resolve();
    const observer = new MutationObserver(() => { if (!element.disabled) { observer.disconnect(); resolve(); } });
    observer.observe(element, { attributes: true });
}));

(async () => {
    const results = [];
    for (const engine of (process.env.REVIVE_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
        const port = await freePort(), base = `http://127.0.0.1:${port}`;
        const server = spawn(process.execPath, [path.join(__dirname, 'session-fixture.cjs')], {
            env: { ...process.env, REVIVE_BROWSER_API_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
        });
        let browser;
        const errors = [];
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Tempo de abertura excedido')), 10000);
                server.once('error', reject);
                server.stdout.on('data', chunk => { if (String(chunk).includes('Synthetic session HTTP API')) { clearTimeout(timer); resolve(); } });
            });
            browser = await playwright[engine].launch({ headless: true });
            const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'pt-BR', serviceWorkers: 'block' });
            context.setDefaultTimeout(15000);
            const failedReads = new Set();
            const trackFailedReads = page => page.on('requestfailed', request => {
                const url = new URL(request.url());
                if (url.origin === base && ((request.method() === 'GET' && ['/api/v2/bootstrap', '/api/v2/registros', '/api/v2/vontades', '/api/v2/web-auth/refresh'].includes(url.pathname)) || url.pathname === '/api/v2/registros/search')) {
                    failedReads.add('/' + url.host + url.pathname + url.search + ' due to access control checks.');
                }
            });
            const a = await context.newPage(); trackFailedReads(a); a.on('pageerror', error => errors.push(error.message));
            await a.goto(base);
            await a.getByLabel('Email', { exact: true }).fill('a@example.invalid');
            await a.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
            await a.getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
            await a.getByRole('button', { name: 'Ver detalhes', exact: true }).click();
            await a.getByRole('heading', { name: 'Gerenciar hábito' }).waitFor();
            const b = await context.newPage(); trackFailedReads(b); b.on('pageerror', error => errors.push(error.message));
            await b.goto(base + '/vicios/' + habitId);
            await b.getByRole('heading', { name: 'Gerenciar hábito' }).waitFor();
            await a.getByLabel('Nome do hábito', { exact: true }).fill('Nome da primeira aba');
            await b.getByLabel('Nome do hábito', { exact: true }).fill('Rascunho da segunda aba');
            await a.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
            await a.getByText('Alteração confirmada. Histórico, metas e conquistas foram preservados.', { exact: true }).waitFor();
            await b.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
            await b.getByRole('region', { name: 'Revisão da edição' }).waitFor();
            assert.equal(await b.getByLabel('Nome do hábito', { exact: true }).inputValue(), 'Rascunho da segunda aba');
            await b.reload();
            await b.getByRole('region', { name: 'Revisão da edição' }).waitFor();
            assert.equal(await b.getByLabel('Nome do hábito', { exact: true }).inputValue(), 'Rascunho da segunda aba');
            assert.equal(await b.getByRole('button', { name: 'Salvar alterações', exact: true }).isDisabled(), true);
            const output = process.env.REVIVE_BROWSER_ARTIFACTS;
            if (output) {
                fs.mkdirSync(output, { recursive: true });
                await b.getByRole('region', { name: 'Gerenciar hábito' }).screenshot({ path: path.join(output, `habit-conflict-${engine}.png`), animations: 'disabled' });
            }
            await b.getByRole('button', { name: 'Manter rascunho e revisar com esta versão' }).click();
            await b.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
            await b.getByText('Alteração confirmada. Histórico, metas e conquistas foram preservados.', { exact: true }).waitFor();
            await b.getByRole('button', { name: 'Arquivar hábito', exact: true }).click();
            const dialog = b.getByRole('dialog', { name: 'Arquivar hábito?' });
            await dialog.waitFor();
            assert.equal(await b.evaluate(() => document.activeElement?.textContent), 'Cancelar');
            await b.keyboard.press('Shift+Tab');
            assert.equal(await b.evaluate(() => document.activeElement?.textContent), 'Confirmar arquivamento');
            await b.keyboard.press('Tab');
            assert.equal(await b.evaluate(() => document.activeElement?.textContent), 'Cancelar');
            await dialog.getByRole('button', { name: 'Confirmar arquivamento' }).click();
            await b.getByText('Arquivado: histórico preservado. Reative para novos eventos.', { exact: true }).waitFor();
            assert.equal(await b.getByRole('button', { name: 'Salvar registro', exact: true }).isDisabled(), true);
            if (output) await b.getByRole('region', { name: 'Gerenciar hábito' }).screenshot({ path: path.join(output, `habit-archived-${engine}.png`), animations: 'disabled' });
            // Intenção anterior chega do armazenamento offline após o arquivo remoto.
            const intentId = await insertEarlierIntent(b);
            await b.reload();
            await b.getByRole('button', { name: 'Reativar hábito', exact: true }).waitFor();
            await b.getByRole('link', { name: 'Resolver operações pendentes' }).click();
            await b.getByText('Motivo: HABITO_ARQUIVADO.', { exact: false }).waitFor();
            assert.equal((await entries(b))[0].id, intentId);
            await b.getByRole('button', { name: 'Jornada', exact: true }).click();
            await b.getByLabel('Exibir hábitos').selectOption('archived');
            await b.getByRole('button', { name: 'Ver detalhes', exact: true }).click();
            await waitEnabled(b.getByRole('button', { name: 'Reativar hábito', exact: true }));
            await b.getByRole('button', { name: 'Reativar hábito', exact: true }).click();
            await b.getByRole('button', { name: 'Confirmar reativação' }).click();
            await b.getByText('Hábito ativo', { exact: true }).waitFor();
            assert.equal((await entries(b))[0].id, intentId);
            if (output) await b.getByRole('region', { name: 'Gerenciar hábito' }).screenshot({ path: path.join(output, `habit-reactivated-${engine}.png`), animations: 'disabled' });
            await b.getByRole('link', { name: 'Resolver operações pendentes' }).click();
            await b.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
            await b.getByText('Nenhuma operação aguardando envio.', { exact: true }).waitFor();
            assert.equal((await entries(b)).length, 0);
            const status = await (await fetch(base + '/__test/status')).json();
            assert.equal(status.events.registros, 1);
            // O WebKit no Linux relata como controle de acesso leituras GET interrompidas por navegação ou reload;
            // requestfailed pode não chegar. O fallback limita o diagnóstico às leituras da origem local desta suíte.
            const interruptedRead = new RegExp(String.raw`/127\.0\.0\.1:${port}/api/v2/(?:bootstrap|registros(?:\?[^\s#]+)?|registros/search|vontades(?:\?[^\s#]+)?|web-auth/refresh|preferences) due to access control checks\.$`);
            assert.deepEqual(errors.filter(message => !(engine === 'webkit'
                && ([...failedReads].some(diagnostic => message.trim().endsWith(diagnostic))
                    || interruptedRead.test(message.trim())))), []);
            results.push({ engine, concurrency: true, draftAfterReload: true, archive: true, reactivation: true, recoveredEvent: true, focus: true });
            await context.close();
        } finally {
            await browser?.close();
            if (server.exitCode === null && server.signalCode === null) {
                const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped;
            }
        }
    }
    console.log(JSON.stringify(results, null, 2));
    if (process.env.REVIVE_BROWSER_ARTIFACTS) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_ARTIFACTS, 'habit-management-results.json'), JSON.stringify(results, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
