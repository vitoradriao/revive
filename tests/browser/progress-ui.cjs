const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const playwright = require('playwright');
const { progressFixture } = require('../fixtures/progress.cjs');

const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const number = server.address().port; server.close(() => resolve(number)); });
});
const login = async (page, email) => {
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
    await page.locator('form').getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Sair', exact: true }).waitFor();
};

(async () => {
    const results = [];
    for (const engine of (process.env.REVIVE_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
        const number = await freePort();
        const base = `http://127.0.0.1:${number}`;
        const server = spawn(process.execPath, [path.join(__dirname, 'session-fixture.cjs')], {
            env: { ...process.env, REVIVE_BROWSER_API_PORT: String(number) }, stdio: ['ignore', 'pipe', 'pipe'],
        });
        let browser;
        const errors = [];
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Tempo de abertura excedido')), 10000);
                server.once('error', reject);
                server.stdout.on('data', chunk => { if (String(chunk).includes('Synthetic session HTTP API')) { clearTimeout(timer); resolve(); } });
            });
            browser = await playwright[engine].launch({ headless: true,
                ...(process.env.REVIVE_BROWSER_EXECUTABLE ? { executablePath: process.env.REVIVE_BROWSER_EXECUTABLE } : {}),
            });
            const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'pt-BR', acceptDownloads: true, serviceWorkers: 'block' });
            context.setDefaultTimeout(20000);
            await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
            const page = await context.newPage();
            let offlineSince = null;
            const failedReads = new Set();
            page.on('requestfailed', request => {
                const url = new URL(request.url());
                if (url.origin === base && ((request.method() === 'GET' && ['/api/v2/bootstrap', '/api/v2/registros', '/api/v2/vontades', '/api/v2/web-auth/refresh', '/api/v2/preferences'].includes(url.pathname)) || url.pathname === '/api/v2/registros/search')) {
                    failedReads.add('/' + url.host + url.pathname + url.search + ' due to access control checks.');
                }
            });
            page.on('pageerror', error => errors.push({ message: error.message, offline: offlineSince !== null }));
            await page.clock.setFixedTime(new Date('2026-02-02T12:00:00Z'));
            let mode = {};
            await context.route('**/api/v2/bootstrap', async route => {
                const response = await route.fetch();
                if (!response.ok()) return route.fulfill({ response });
                const original = await response.json();
                const data = progressFixture(mode);
                data.usuario = original.usuario;
                if (original.usuario.email.startsWith('b@')) {
                    for (const key of ['vicios', 'registros', 'recaidas', 'metas', 'conquistas']) data[key] = [];
                }
                return route.fulfill({ response, json: data });
            });
            await page.goto(base);
            await login(page, 'a@example.invalid');
            await page.getByText('Maior sequência atual entre hábitos ativos', { exact: true }).waitFor();
            await page.getByText('2 dias', { exact: true }).first().waitFor();
            assert.match(await page.getByRole('status').filter({ hasText: 'Cópia parcial' }).textContent(), /Cópia parcial/);
            const output = process.env.REVIVE_BROWSER_ARTIFACTS;
            if (output) fs.mkdirSync(output, { recursive: true });
            for (const [route, name] of [['/', 'dashboard'], ['/analytics', 'analytics'], ['/conquistas', 'conquistas'], ['/relatorios', 'relatorios'], ['/perfil', 'perfil']]) {
                await page.goto(base + route);
                await page.getByRole('status').filter({ hasText: 'Cópia parcial' }).waitFor();
                if (name === 'conquistas') await page.getByText('Conquista permanente', { exact: true }).first().waitFor();
                else {
                    await page.getByText('30 dias', { exact: true }).first().waitFor();
                    await page.getByText(/320,00/).first().waitFor();
                }
                // Finalize finite transitions before capturing; paused animations may never resolve finished.
                await page.evaluate(() => document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).forEach(animation => animation.finish()));
                if (output) await page.screenshot({ path: path.join(output, `progresso-${name}-${engine}.png`), fullPage: true, animations: 'disabled' });
            }
            const downloadPromise = page.waitForEvent('download');
            await page.getByText('Exportar dados', { exact: true }).click();
            const download = await downloadPromise;
            const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
            assert.equal(exported.coverage, 'partial');
            assert.equal(exported.conquistas.some(award => award.categoria === 'streak' && award.valor_alvo === 30), true);
            mode = { archived: true };
            await page.goto(base + '/relatorios');
            await page.getByText('Hábito sintético (Arquivado)', { exact: true }).waitFor();
            assert.match(await page.getByText('Hábitos ativos disponíveis (snapshot)', { exact: true }).locator('..').textContent(), /0/);
            mode = { legacy: true };
            await page.goto(base + '/conquistas');
            await page.getByText(/Histórico legado/).waitFor();
            await page.getByText('Indisponível', { exact: true }).first().waitFor();
            assert.equal(await page.getByText('Conquista permanente', { exact: true }).count(), 0);
            mode = {};
            await page.getByRole('button', { name: 'Sair', exact: true }).click();
            await login(page, 'b@example.invalid');
            await page.goto(base + '/relatorios');
            await page.getByText('Nenhum hábito disponível nesta cópia.', { exact: true }).waitFor();
            assert.equal(await page.getByText('30 dias', { exact: true }).count(), 0);
            await page.getByRole('button', { name: 'Sair', exact: true }).click();
            await login(page, 'a@example.invalid');
            await page.goto(base);
            const heatmap = page.getByRole('region', { name: 'Presença nos últimos 28 dias' });
            await heatmap.getByText('Consultar atividade em texto', { exact: true }).click();
            await heatmap.getByText('2026-02-01: 2 registro(s) de check-in; com recaída registrada.', { exact: true }).waitFor();
            await context.setOffline(true);
            offlineSince = Date.now();
            const checkin = page.getByRole('region', { name: 'Check-in rápido', exact: true });
            await checkin.getByText('Já existe registro para este hábito hoje.', { exact: true }).waitFor();
            assert.equal(await checkin.getByRole('button', { name: 'Bom', exact: true }).isDisabled(), true);
            await checkin.getByRole('button', { name: 'Adicionar outro registro hoje', exact: true }).click();
            await checkin.getByRole('button', { name: 'Bom', exact: true }).click();
            await page.getByRole('button', { name: 'Salvar check-in', exact: true }).click();
            const notice = page.getByRole('status').filter({ hasText: 'Cópia parcial' });
            await notice.getByText('1 pendência(s) local(is), fora dos indicadores e conquistas consolidados.', { exact: true }).waitFor();
            assert.match(await notice.textContent(), /Offline/);
            assert.equal(await heatmap.getByText('2/28 dias com check-in. Uma recaída não remove a presença.', { exact: true }).count(), 1);
            if (output) await page.screenshot({ path: path.join(output, `progresso-offline-${engine}.png`), fullPage: true, animations: 'disabled' });
            // O WebKit no Linux relata como controle de acesso leituras interrompidas por navegação, troca de conta
            // ou rede desligada; só são aceitas mensagens de leituras GET que de fato falharam nesta página.
            const unexpected = errors.filter(error => !(engine === 'webkit' && (
                [...failedReads].some(diagnostic => error.message.trim().endsWith(diagnostic))
                || /\/api\/v2\/(?:bootstrap|registros(?:\?[^\s#]+)?|registros\/search|vontades(?:\?[^\s#]+)?|web-auth\/refresh|preferences) due to access control checks\.$/.test(error.message.trim())
            ))).map(error => error.message);
            assert.deepEqual(unexpected, []);
            results.push({ engine, passed: true, scenarios: ['five-pages', 'reset-record', 'permanent-awards', 'archive', 'legacy', 'partial-export', 'account-switch', 'offline-pending', 'accessible-heatmap'] });
        } finally {
            await browser?.close();
            if (server.exitCode === null) { const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped; }
        }
    }
    console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
