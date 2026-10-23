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
const reasonLabel = 'Motivo pessoal (opcional)';
const confirmed = page => page.getByText('Alteração confirmada. Histórico, metas e conquistas foram preservados.', { exact: true }).waitFor();
const enabled = locator => locator.evaluate(element => new Promise(resolve => {
    if (!element.disabled) return resolve();
    const observer = new MutationObserver(() => { if (!element.disabled) { observer.disconnect(); resolve(); } });
    observer.observe(element, { attributes: true });
}));
const cachedReason = page => page.evaluate(userId => new Promise((resolve, reject) => {
    const open = indexedDB.open('revive-account-' + userId);
    open.onerror = () => reject(new Error('Banco sintético indisponível'));
    open.onsuccess = () => {
        const db = open.result, tx = db.transaction('snapshots'), read = tx.objectStore('snapshots').get('bootstrap');
        let value; read.onsuccess = () => { value = read.result?.data.vicios[0]?.motivo_pessoal; };
        tx.oncomplete = () => { db.close(); resolve(value); };
    };
}), accountId);

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
            // As duas abas abriram a revisão inicial. Conteúdo sintético nunca vai para evidências.
            const marker = 'synthetic-private-marker';
            await a.getByLabel(reasonLabel).fill('😀'.repeat(1001));
            await enabled(a.getByRole('button', { name: 'Salvar alterações', exact: true }));
            await a.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
            await a.getByRole('alert').filter({ hasText: '1000' }).waitFor();
            assert.equal([...(await a.getByLabel(reasonLabel).inputValue())].length, 1001);
            assert.equal((await (await fetch(base + '/__test/status')).json()).counts.writes, 0);
            await a.getByLabel(reasonLabel).fill('😀'.repeat(1000));
            await enabled(a.getByRole('button', { name: 'Salvar alterações', exact: true }));
            await a.getByRole('button', { name: 'Salvar alterações', exact: true }).click(); await confirmed(a);
            assert.equal([...(await cachedReason(a))].length, 1000);
            await b.getByLabel(reasonLabel).fill(marker);
            await enabled(b.getByRole('button', { name: 'Salvar alterações', exact: true }));
            await b.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
            await b.getByRole('region', { name: 'Revisão da edição' }).waitFor();
            await b.reload();
            await b.getByRole('region', { name: 'Revisão da edição' }).waitFor();
            assert.equal((await b.getByLabel(reasonLabel).inputValue()) === marker, true);
            assert.equal(await b.getByRole('button', { name: 'Salvar alterações', exact: true }).isDisabled(), true);
            await b.getByRole('button', { name: 'Manter rascunho e revisar com esta versão' }).click();
            await enabled(b.getByRole('button', { name: 'Salvar alterações', exact: true }));
            await b.getByRole('button', { name: 'Salvar alterações', exact: true }).click(); await confirmed(b);
            assert.equal((await cachedReason(b)) === marker, true);
            // O JSON de Perfil usa uma projeção, mesmo com motivo sincronizado em memória.
            await b.goto(base + '/perfil');
            const downloading = b.waitForEvent('download');
            await b.getByRole('button', { name: /Exportar dados/ }).click();
            const download = await downloading, stream = await download.createReadStream(), chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const exported = Buffer.concat(chunks).toString('utf8');
            assert.equal(exported.includes(marker), false);
            assert.equal(exported.includes('motivo_pessoal'), false);
            // O bootstrap sem capacidade explícita protege a exportação bruta do cliente antigo.
            const defaultDto = await b.evaluate(async () => {
                const login = await fetch('/api/v2/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@example.invalid', senha: 'Synthetic!1' }) });
                const session = await login.json();
                return (await fetch('/api/v2/bootstrap', { headers: { Authorization: 'Bearer ' + session.access_token } })).json();
            });
            assert.equal(JSON.stringify(defaultDto).includes(marker), false);
            await b.goto(base + '/vicios/' + habitId);
            await b.getByRole('button', { name: 'Arquivar hábito', exact: true }).click();
            await b.getByRole('button', { name: 'Confirmar arquivamento' }).click(); await confirmed(b);
            await b.getByText('Arquivado: histórico preservado. Reative para novos eventos.', { exact: true }).waitFor();
            await b.getByLabel(reasonLabel).fill(marker + '-archived');
            await enabled(b.getByRole('button', { name: 'Salvar alterações', exact: true }));
            await b.getByRole('button', { name: 'Salvar alterações', exact: true }).click(); await confirmed(b);
            await context.setOffline(true);
            await b.getByRole('button', { name: 'Jornada', exact: true }).click();
            await b.getByLabel('Exibir hábitos').selectOption('archived');
            await b.getByRole('button', { name: 'Ver detalhes', exact: true }).click();
            await b.getByLabel('Motivo pessoal sincronizado').waitFor();
            assert.equal((await b.getByLabel('Motivo pessoal sincronizado').textContent()).includes(marker + '-archived'), true);
            assert.equal(await b.getByRole('button', { name: 'Salvar alterações', exact: true }).isDisabled(), true);
            await context.setOffline(false);
            await b.getByRole('button', { name: 'Limpar motivo pessoal', exact: true }).click();
            await enabled(b.getByRole('button', { name: 'Salvar alterações', exact: true }));
            await b.getByRole('button', { name: 'Salvar alterações', exact: true }).click(); await confirmed(b);
            assert.equal(await cachedReason(b), null);
            await b.getByText('Nenhum motivo pessoal salvo.', { exact: true }).waitFor();
            const output = process.env.REVIVE_BROWSER_ARTIFACTS;
            if (output) {
                fs.mkdirSync(output, { recursive: true });
                // Captura somente após remoção: nenhum texto de motivo ou rascunho.
                await b.getByRole('region', { name: 'Gerenciar hábito' }).screenshot({ path: path.join(output, `personal-reason-empty-${engine}.png`), animations: 'disabled' });
            }
            // Outra conta na mesma sessão nunca recebe conteúdo ou rascunho da anterior.
            await b.goto(base + '/perfil');
            await b.getByRole('button', { name: 'Sair da conta', exact: true }).click();
            await b.getByLabel('Email', { exact: true }).fill('b@example.invalid');
            await b.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
            await b.getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
            await b.getByRole('button', { name: 'Ver detalhes', exact: true }).click();
            await b.getByLabel(reasonLabel).waitFor();
            assert.equal(await b.getByLabel(reasonLabel).inputValue(), '');
            assert.equal((await b.locator('body').textContent()).includes(marker), false);
            const interruptedRead = new RegExp(String.raw`/127\.0\.0\.1:${port}/api/v2/(?:bootstrap|registros(?:\?[^\s#]+)?|registros/search|vontades(?:\?[^\s#]+)?|web-auth/refresh|preferences) due to access control checks\.$`);
            assert.deepEqual(errors.filter(message => !(engine === 'webkit'
                && ([...failedReads].some(diagnostic => message.trim().endsWith(diagnostic))
                    || interruptedRead.test(message.trim())))), []);
            results.push({ engine, browserVersion: await browser.version(), unicodeLimit: true, noTruncation: true,
                conflictAfterReload: true, explicitReapply: true, archivedEdit: true, offlineSnapshot: true,
                removal: true, defaultExportPrivate: true, legacyDtoPrivate: true, accountIsolation: true,
                indexedDB: 'real', locks: 'real', reasonInEvidence: false });
            await context.close();
        } finally {
            await browser?.close();
            if (server.exitCode === null && server.signalCode === null) {
                const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped;
            }
        }
    }
    console.log(JSON.stringify(results, null, 2));
    if (process.env.REVIVE_BROWSER_ARTIFACTS) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_ARTIFACTS, 'personal-reason-results.json'), JSON.stringify(results, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
