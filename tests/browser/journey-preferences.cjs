const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const playwright = require('playwright');
const first = '10000000-0000-4000-8000-000000000001', second = '10000000-0000-4000-8000-000000000003';
const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const login = async (page, email = 'a@example.invalid') => {
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
    await page.getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
    await page.getByText('Configuração sincronizada disponível.', { exact: true }).waitFor();
};
const region = page => page.getByRole('region', { name: 'Preferências da Jornada', exact: true });
const confirmed = page => region(page).getByText('Preferências confirmadas no servidor.', { exact: true }).waitFor();
const firstMetric = page => page.locator('[data-indicator-id]').first().getAttribute('data-indicator-id');
// Usa transporte bearer da API com sessão separada; não representa homologação da interface mobile.
const peer = (page, patch) => page.evaluate(async patch => {
    const login = await fetch('/api/v2/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@example.invalid', senha: 'Synthetic!1' }) });
    const session = await login.json(), headers = { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' };
    const current = await (await fetch('/api/v2/preferences', { headers })).json();
    const result = await fetch('/api/v2/preferences', { method: 'PATCH', headers, body: JSON.stringify({ revision: current.preferences.revision, ...patch }) });
    if (result.status !== 200) throw new Error('Falha de alteração pelo transporte bearer');
    return (await result.json()).preferences;
}, patch);

(async () => {
    const results = [];
    for (const engine of (process.env.REVIVE_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
        const port = await freePort(), base = `http://127.0.0.1:${port}`;
        const server = spawn(process.execPath, [path.join(__dirname, 'session-fixture.cjs')], { env: { ...process.env, REVIVE_BROWSER_API_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
        let browser;
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Tempo de abertura excedido')), 10000);
                server.once('error', reject);
                server.stdout.on('data', chunk => { if (String(chunk).includes('Synthetic session HTTP API')) { clearTimeout(timer); resolve(); } });
                server.once('exit', code => { clearTimeout(timer); reject(new Error('Fixture encerrou: ' + code)); });
            });
            await fetch(base + '/__test/seed-preferences', { method: 'POST' });
            browser = await playwright[engine].launch({ headless: true });
            const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, locale: 'pt-BR', serviceWorkers: 'block' });
            context.setDefaultTimeout(15000);
            const errors = [], failedReads = new Set();
            const track = page => {
                page.on('pageerror', error => errors.push(error.message));
                page.on('requestfailed', request => {
                    const url = new URL(request.url());
                    if (request.method() === 'GET' && url.origin === base && ['/api/v2/bootstrap', '/api/v2/registros', '/api/v2/vontades', '/api/v2/web-auth/refresh', '/api/v2/preferences'].includes(url.pathname)) failedReads.add('/' + url.host + url.pathname + url.search + ' due to access control checks.');
                });
            };
            const a = await context.newPage(); track(a); await a.goto(base); await login(a);
            assert.equal(await a.getByLabel(/^Hábito do check-in/).inputValue(), first);
            const b = await context.newPage(); track(b); await b.goto(base);
            await b.getByText('Configuração sincronizada disponível.', { exact: true }).waitFor();
            await region(b).getByRole('button', { name: 'Descer Maior sequência atual entre hábitos ativos', exact: true }).click();
            const down = region(a).getByRole('button', { name: 'Descer Maior sequência atual entre hábitos ativos', exact: true });
            await down.focus(); await a.keyboard.press('Enter');
            assert.equal(await down.evaluate(element => element === document.activeElement), true);
            await region(a).getByText(/posição 2 de 4/).waitFor();
            await a.getByLabel(/^Hábito principal/).selectOption(second);
            await region(a).getByRole('button', { name: 'Salvar preferências', exact: true }).click(); await confirmed(a);
            assert.equal(await firstMetric(a), 'historical_record');
            assert.equal(await a.getByLabel(/^Hábito do check-in/).inputValue(), second);
            // Segunda aba envia a revisão antiga sem perder sua ordem local.
            await region(b).getByRole('button', { name: 'Salvar preferências', exact: true }).click();
            await region(b).getByRole('alert').waitFor();
            assert.equal(await region(b).getByRole('button', { name: 'Salvar preferências', exact: true }).isDisabled(), true);
            await b.reload(); await region(b).getByRole('region', { name: 'Revisar preferências' }).waitFor();
            await region(b).getByRole('button', { name: 'Consultar preferências atuais', exact: true }).click();
            await region(b).getByRole('button', { name: 'Manter escolhas locais e revisar com esta versão', exact: true }).click();
            await region(b).getByRole('button', { name: 'Salvar preferências', exact: true }).click(); await confirmed(b);
            // Seleção manual tem precedência sobre mudanças de outra sessão.
            await a.getByLabel(/^Hábito do check-in/).selectOption(second);
            const updated = await peer(a, { primary_habit_id: first, indicator_order: ['future_metric', 'accumulated_savings'], intro: { version: 2, state: 'dismissed' } });
            assert.equal(updated.intro.version, 2);
            await region(a).getByRole('button', { name: 'Consultar preferências atuais', exact: true }).click();
            await region(a).getByText('Versão atual consultada. Revise as escolhas antes de reaplicar.', { exact: true }).waitFor();
            assert.equal(await firstMetric(a), 'accumulated_savings');
            assert.equal(await a.getByLabel(/^Hábito do check-in/).inputValue(), second);
            assert.equal(await a.locator('[data-indicator-id]').count(), 4);
            // Uma edição comum conserva os IDs desconhecidos e o estado da introdução.
            await a.getByLabel(/^Hábito principal/).selectOption(second);
            await region(a).getByRole('button', { name: 'Salvar preferências', exact: true }).click(); await confirmed(a);
            const retained = await peer(a, { primary_habit_id: first });
            assert.equal(retained.indicator_order.includes('future_metric'), true); assert.equal(retained.intro.version, 2);
            // Arquivo do principal usa fallback; escolha manual continua ativa.
            await a.evaluate(async habitId => {
                const login = await fetch('/api/v2/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@example.invalid', senha: 'Synthetic!1' }) });
                const { access_token } = await login.json();
                const response = await fetch('/api/v2/vicios/' + habitId, { method: 'PATCH', headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 1, ativo: false }) });
                if (response.status !== 200) throw new Error('Arquivo sintético falhou');
            }, first);
            await a.evaluate(() => window.dispatchEvent(new Event('focus')));
            await a.getByText(/O hábito principal está indisponível ou arquivado/).waitFor();
            await a.getByText(/^Hábito: Segundo hábito sintético/).waitFor();
            await context.setOffline(true);
            await region(a).getByText(/Offline: última configuração sincronizada/).waitFor();
            assert.equal(await firstMetric(a), 'accumulated_savings');
            assert.equal(await region(a).getByRole('button', { name: 'Salvar preferências', exact: true }).isDisabled(), true);
            await context.setOffline(false);
            await a.getByLabel(/^Hábito principal/).selectOption('');
            await region(a).getByRole('button', { name: 'Restaurar ordem padrão', exact: true }).click();
            await region(a).getByRole('button', { name: 'Salvar preferências', exact: true }).click(); await confirmed(a);
            assert.equal(await firstMetric(a), 'current_streak');
            const output = process.env.REVIVE_BROWSER_ARTIFACTS;
            if (output) { fs.mkdirSync(output, { recursive: true }); await region(a).screenshot({ path: path.join(output, `journey-preferences-${engine}.png`), animations: 'disabled' }); }
            await a.goto(base + '/perfil'); await a.getByRole('button', { name: 'Sair da conta', exact: true }).click();
            await login(a, 'b@example.invalid');
            assert.equal(await a.getByLabel(/^Hábito principal/).inputValue(), '');
            assert.equal(await firstMetric(a), 'current_streak');
            assert.equal((await a.locator('body').textContent()).includes('Segundo hábito sintético'), false);
            const interruptedRead = new RegExp(String.raw`/127\.0\.0\.1:${port}/api/v2/(?:bootstrap|registros(?:\?[^\s#]+)?|vontades(?:\?[^\s#]+)?|web-auth/refresh|preferences) due to access control checks\.$`);
            assert.deepEqual(errors.filter(message => !(engine === 'webkit' && ([...failedReads].some(diagnostic => message.trim().endsWith(diagnostic)) || interruptedRead.test(message.trim())))), []);
            results.push({ engine, browserVersion: await browser.version(), keyboardOrder: true, focusPreserved: true, ariaLive: true, defaultPrimary: true, manualSelection: true, twoTabConflict: true, draftAfterReload: true, explicitReview: true, futureIds: true, bearerPeer: true, archivedFallback: true, offlineSnapshot: true, restore: true, accountIsolation: true, indexedDB: 'real', locks: 'real', mobileUI: 'fora do escopo' });
            await context.close();
        } finally {
            await browser?.close();
            if (server.exitCode === null && server.signalCode === null) { const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped; }
        }
    }
    console.log(JSON.stringify(results, null, 2));
    if (process.env.REVIVE_BROWSER_ARTIFACTS) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_ARTIFACTS, 'journey-preferences-results.json'), JSON.stringify(results, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
