const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const playwright = require('playwright');
const accountId = '00000000-0000-4000-8000-000000000001';
const region = page => page.getByRole('region', { name: 'Primeiros passos', exact: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const until = async task => {
    const deadline = Date.now() + 20000;
    while (!(await task())) {
        if (Date.now() > deadline) throw new Error('Condição sintética não atingida');
        await new Promise(resolve => setTimeout(resolve, 100));
    }
};
const enabled = locator => until(() => locator.isEnabled());
const login = async (page, base, email = 'a@example.invalid') => {
    await page.goto(base);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
    await button(page, 'Entrar e continuar').click();
    await page.getByText('Configuração sincronizada disponível.', { exact: true }).waitFor();
};
const start = async page => {
    await enabled(button(page, 'Começar introdução'));
    await button(page, 'Começar introdução').focus(); await page.keyboard.press('Enter');
    await enabled(button(page, 'Cadastrar primeiro hábito'));
};
const fillHabit = async page => {
    await button(page, 'Cadastrar primeiro hábito').click();
    assert.equal(await page.getByLabel('Nome do hábito', { exact: true }).evaluate(element => element === document.activeElement), true);
    await page.getByLabel('Nome do hábito', { exact: true }).fill('Hábito de teste');
};
const localRows = (page, store) => page.evaluate(({ accountId, store }) => new Promise((resolve, reject) => {
    const open = indexedDB.open('revive-account-' + accountId);
    open.onerror = () => reject(new Error('Armazenamento sintético indisponível'));
    open.onsuccess = () => {
        const db = open.result, tx = db.transaction(store), read = tx.objectStore(store).getAll();
        read.onsuccess = () => resolve(read.result); tx.oncomplete = () => db.close();
    };
}), { accountId, store });
const peer = (page, patch) => page.evaluate(async patch => {
    const login = await fetch('/api/v2/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@example.invalid', senha: 'Synthetic!1' }) });
    const session = await login.json(), headers = { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' };
    const current = (await (await fetch('/api/v2/preferences', { headers })).json()).preferences;
    if (!patch) return current;
    const response = await fetch('/api/v2/preferences', { method: 'PATCH', headers, body: JSON.stringify({ revision: current.revision, ...patch }) });
    if (response.status !== 200) throw new Error('Falha sintética de preferences');
    return (await response.json()).preferences;
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
            const post = (url, body) => fetch(base + '/__test/' + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
            const stats = async () => (await fetch(base + '/__test/status')).json();
            const errors = [], failedReads = new Set();
            browser = await playwright[engine].launch({ headless: true });
            const newContext = () => browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'pt-BR', serviceWorkers: 'block' });
            const newPage = async context => {
                const page = await context.newPage(); page.setDefaultTimeout(15000);
                page.on('pageerror', error => errors.push(error.message));
                page.on('requestfailed', request => {
                    const url = new URL(request.url());
                    if (url.origin === base && request.method() === 'GET' && ['/api/v2/bootstrap', '/api/v2/registros', '/api/v2/vontades', '/api/v2/web-auth/refresh', '/api/v2/preferences'].includes(url.pathname)) {
                        failedReads.add('/' + url.host + url.pathname + url.search + ' due to access control checks.');
                    }
                });
                return page;
            };
            // Pular tudo não cria dados e o Perfil revê sem apagar a dispensa remota.
            await post('seed-introduction');
            let context = await newContext(), a = await newPage(context);
            await login(a, base); await enabled(button(a, 'Pular introdução e ir à Jornada'));
            if (process.env.REVIVE_BROWSER_ARTIFACTS) {
                fs.mkdirSync(process.env.REVIVE_BROWSER_ARTIFACTS, { recursive: true });
                await region(a).screenshot({ path: path.join(process.env.REVIVE_BROWSER_ARTIFACTS, `first-habit-introduction-start-${engine}.png`), animations: 'disabled' });
            }
            await button(a, 'Pular introdução e ir à Jornada').click(); await region(a).waitFor({ state: 'detached' });
            assert.equal((await peer(a)).intro.state, 'dismissed');
            await a.reload(); await a.getByText('Configuração sincronizada disponível.', { exact: true }).waitFor();
            assert.equal(await region(a).count(), 0);
            await a.goto(base + '/perfil'); await button(a, 'Rever introdução').click();
            await region(a).getByText(/Estado salvo preservado/).waitFor();
            assert.equal((await peer(a)).intro.state, 'dismissed'); assert.equal((await stats()).introductionStats.habitCreates, 0);
            await context.close();

            // Cadastro existente, motivo pulado e check-in sem digitar texto.
            await post('seed-introduction');
            context = await newContext(); a = await newPage(context);
            await login(a, base); await start(a); await fillHabit(a);
            await a.keyboard.press('Escape'); await a.getByRole('dialog').waitFor({ state: 'detached' });
            await fillHabit(a);
            const b = await newPage(context); await b.goto(base); await fillHabit(b);
            await button(a, 'Salvar hábito').click();
            await button(a, 'Pular motivo').waitFor();
            await button(b, 'Salvar hábito').click(); await b.getByRole('dialog').getByRole('alert').waitFor();
            await b.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
            assert.equal((await stats()).introductionStats.habitCreates, 1);
            await button(a, 'Pular motivo').click(); await button(a, 'Concluir introdução').waitFor();
            const remote = await peer(a); assert.equal(remote.intro.step, 'checkin'); assert.ok(remote.intro.habit_id);
            await b.goto(base); await button(b, 'Concluir introdução').waitFor();
            assert.equal(await button(b, 'Cadastrar primeiro hábito').count(), 0);
            await context.setOffline(true);
            await region(a).getByText(/Offline: etapas remotas/).waitFor();
            assert.equal(await button(a, 'Concluir introdução').isDisabled(), true);
            const checkin = a.getByRole('region', { name: 'Check-in rápido', exact: true });
            await enabled(checkin.getByRole('button', { name: 'Bom', exact: true }));
            await checkin.getByRole('button', { name: 'Bom', exact: true }).click();
            await checkin.getByRole('button', { name: 'Salvar check-in', exact: true }).click();
            await checkin.getByText(/Salvo neste navegador · confirmação pendente/).waitFor();
            const queued = (await localRows(a, 'outbox')).filter(row => row.type === 'record.create');
            assert.equal(queued.length, 1); assert.equal(queued[0].payload.humor.length > 0, true);
            assert.equal(queued[0].payload.observacoes || '', '');
            const intentId = queued[0].id;
            await post('drop-record-responses', { enabled: true }); await context.setOffline(false);
            await until(async () => (await stats()).events.registros === 1);
            await a.reload(); await button(a, 'Concluir introdução').waitFor();
            await a.getByRole('region', { name: 'Check-in rápido', exact: true }).getByText('Já existe registro para este hábito hoje.', { exact: true }).waitFor();
            assert.equal(await a.getByRole('region', { name: 'Check-in rápido', exact: true }).getByRole('button', { name: 'Salvar check-in', exact: true }).isDisabled(), true);
            assert.equal((await localRows(a, 'outbox')).some(row => row.id === intentId), true);
            await post('drop-record-responses', { enabled: false });
            // Conflito por outra sessão requer consulta; o ID do hábito e a intenção não mudam.
            await peer(a, { indicator_order: ['accumulated_savings'] });
            await button(a, 'Concluir introdução').click(); await region(a).getByRole('alert').waitFor();
            assert.equal(await button(a, 'Concluir introdução').isDisabled(), true);
            await button(a, 'Consultar etapas atuais').click(); await enabled(button(a, 'Concluir introdução'));
            await a.setViewportSize({ width: 320, height: 900 });
            await a.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
            await button(a, 'Ir para check-in rápido').focus(); await a.keyboard.press('Enter');
            assert.equal(await a.locator('#introduction-checkin').evaluate(element => element === document.activeElement), true);
            assert.equal(await region(a).evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
            const output = process.env.REVIVE_BROWSER_ARTIFACTS;
            if (output) {
                fs.mkdirSync(output, { recursive: true });
                await region(a).screenshot({ path: path.join(output, `first-habit-introduction-small-${engine}.png`), animations: 'disabled' });
            }
            await button(a, 'Concluir introdução').click(); await region(a).waitFor({ state: 'detached' });
            assert.equal((await peer(a)).intro.state, 'completed'); assert.equal((await stats()).events.registros, 1);
            assert.equal((await stats()).introductionStats.habitCreates, 1);
            await context.close();

            // Resposta perdida de cadastro: reload adota o existente. Falha do motivo repete apenas o motivo.
            await post('seed-introduction'); await post('introduction-transport', { mode: 'dropHabit' });
            context = await newContext(); a = await newPage(context);
            await login(a, base); await start(a); await fillHabit(a); await button(a, 'Salvar hábito').click();
            await a.getByText('O envio anterior não foi confirmado e pode ter sido salvo. Consulte seus hábitos antes de decidir repetir.', { exact: true }).waitFor();
            await button(a, 'Fechar').click(); await a.reload();
            await button(a, 'Continuar com Hábito de teste').click();
            await a.getByLabel('Motivo pessoal (opcional)', { exact: true }).waitFor();
            await post('introduction-transport', { mode: 'failReason' });
            const privateMarker = 'synthetic-private-introduction';
            await a.getByLabel('Motivo pessoal (opcional)', { exact: true }).fill(privateMarker);
            await enabled(button(a, 'Salvar motivo')); await button(a, 'Salvar motivo').click();
            await a.getByRole('region', { name: 'Revisão da edição', exact: true }).waitFor();
            await a.reload(); await a.getByRole('region', { name: 'Revisão da edição', exact: true }).waitFor();
            assert.equal(await a.getByLabel('Motivo pessoal (opcional)', { exact: true }).inputValue(), privateMarker);
            await post('introduction-transport', { mode: 'normal' });
            await button(a, 'Consultar estado remoto').click();
            await button(a, 'Manter rascunho e revisar com esta versão').click();
            await enabled(button(a, 'Salvar motivo')); await button(a, 'Salvar motivo').click();
            await button(a, 'Concluir introdução').waitFor();
            assert.equal((await stats()).introductionStats.habitCreates, 1); assert.equal((await stats()).introductionStats.reasonWrites, 1);
            const resumed = (await peer(a)).intro; assert.equal(resumed.step, 'checkin'); assert.equal(resumed.habit_id.length, 36);
            // Troca durante a etapa destrói o estado da conta A; conta histórica B não recebe introdução.
            await a.goto(base + '/perfil'); await button(a, 'Sair da conta').click();
            await a.getByLabel('Email', { exact: true }).waitFor(); await login(a, base, 'b@example.invalid');
            assert.equal(await region(a).count(), 0); assert.equal((await a.locator('body').textContent()).includes(privateMarker), false);
            await a.getByLabel('Exibir hábitos').selectOption('archived');
            await button(a, 'Ver detalhes').waitFor();
            const interruptedRead = new RegExp(String.raw`/127\.0\.0\.1:${port}/api/v2/(?:bootstrap|registros(?:\?[^\s#]+)?|vontades(?:\?[^\s#]+)?|web-auth/refresh|preferences) due to access control checks\.$`);
            assert.deepEqual(errors.filter(message => !(engine === 'webkit' && ([...failedReads].some(diagnostic => message.trim().endsWith(diagnostic)) || interruptedRead.test(message.trim())))), []);
            results.push({ engine, browserVersion: await browser.version(), skipAndProfile: true, textFreeCheckin: true, preservedIntentId: true,
                lostHabitResponse: true, reasonFailureReload: true, noDuplicateHabit: true, noDuplicateRecord: true, twoTabs: true, staleCreationForm: true,
                preferencesConflict: true, bearerPeer: true, accountIsolation: true, historicalAccount: true, keyboard: true,
                fontScale: '200%', viewport: '320x900', focus: true, ariaLive: true, indexedDB: 'real', locks: 'real', privateContentInEvidence: false,
                mobileUI: 'fora do escopo' });
            await context.close();
        } finally {
            await browser?.close();
            if (server.exitCode === null && server.signalCode === null) { const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped; }
        }
    }
    console.log(JSON.stringify(results, null, 2));
    if (process.env.REVIVE_BROWSER_ARTIFACTS) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_ARTIFACTS, 'first-habit-introduction-results.json'), JSON.stringify(results, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
