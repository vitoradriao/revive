const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.REVIVE_BROWSER_URL || 'http://127.0.0.1:4177';
const fixture = process.env.REVIVE_BROWSER_FIXTURE || 'http://127.0.0.1:3177';
const accountA = '00000000-0000-4000-8000-000000000001';
const accountB = '00000000-0000-4000-8000-000000000002';
const managerModule = '/src/services/session-manager.js';
const snapshot = page => page.evaluate(async name => (await import(name)).getSessionManager().getSnapshot(), managerModule);
const waitUser = (page, expected) => page.waitForFunction(async ({ name, expected }) =>
  (await import(name)).getSessionManager().getSnapshot().user?.id === expected, { name: managerModule, expected });
const stats = async () => (await fetch(fixture + '/__test/status')).json();

(async () => {
  await fetch(fixture + '/__test/reset', { method: 'POST' });
  const browser = await playwright.chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
  const errors = [], tokenUrls = [];
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/access_token=|refresh_token=|Bearer%20/i.test(request.url())) tokenUrls.push(request.url()); });
  });
  try {
    const a = await context.newPage();
    await a.goto(base);
    await a.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
    const login = async (page, email) => {
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
      const completed = page.waitForResponse(response => response.url().endsWith('/api/v2/web-auth/login') && response.request().method() === 'POST');
      await page.locator('form').getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
      await (await completed).finished();
    };
    await login(a, 'a@example.invalid'); await waitUser(a, accountA);
    const cookie = (await context.cookies()).find(item => item.name === 'revive_refresh');
    assert.ok(cookie?.httpOnly); assert.equal(cookie.sameSite, 'Lax'); assert.equal(cookie.path, '/api/v2/web-auth');
    const stored = await a.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    assert.equal(Object.keys(stored.session).length, 0);
    assert.ok(!JSON.stringify(stored).includes(cookie.value));
    assert.ok(!JSON.stringify(stored).includes((await snapshot(a)).token));
    assert.equal(await a.evaluate(() => localStorage.getItem('revive_token')), null);

    const b = await context.newPage(); await b.goto(base); await waitUser(b, accountA);
    const before = await stats(), previousToken = (await snapshot(a)).token;
    await Promise.all([a, b].map(page => page.evaluate(async ({ name, previousToken }) =>
      (await import(name)).getSessionManager().ensureToken(previousToken), { name: managerModule, previousToken })));
    const after = await stats();
    assert.equal(after.counts.refresh - before.counts.refresh, 1);
    assert.equal(after.activeSessions, 1);
    assert.equal((await snapshot(a)).token, (await snapshot(b)).token);
    await Promise.all([a, b].map(page => page.evaluate(async name => {
      const manager = (await import(name)).getSessionManager();
      await Promise.all(Array.from({ length: 6 }, () => manager.authenticatedRequest('/me', {}, manager.getSnapshot().token)));
    }, managerModule)));

    // The browser's cookie-backed session restores after reload without a persistent JS token.
    await b.reload(); await waitUser(b, accountA);
    await a.getByRole('button', { name: 'Sair', exact: true }).click();
    await a.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor(); await b.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
    assert.equal((await context.cookies()).filter(item => item.name === 'revive_refresh').length, 0);
    assert.equal((await stats()).activeSessions, 0);

    await login(a, 'a@example.invalid'); await waitUser(a, accountA); await b.reload(); await waitUser(b, accountA);
    await a.evaluate(() => {
      void navigator.locks.request('revive-web-auth', () => {
        window.testLockAcquired = true;
        return new Promise(() => {});
      });
    });
    await a.waitForFunction(() => window.testLockAcquired);
    const closedOwnerToken = (await snapshot(b)).token;
    const queued = b.evaluate(async ({ name, token }) => {
      await (await import(name)).getSessionManager().ensureToken(token);
    }, { name: managerModule, token: closedOwnerToken });
    await a.close();
    await queued;
    assert.ok((await snapshot(b)).token);
    assert.equal((await stats()).activeSessions, 1);

    const networkToken = (await snapshot(b)).token;
    await context.route('**/api/v2/web-auth/refresh', route => route.abort('failed'));
    const failed = await b.evaluate(async ({ name, token }) => {
      try { await (await import(name)).getSessionManager().ensureToken(token); return null; }
      catch (error) { return { code: error.code, status: error.status }; }
    }, { name: managerModule, token: networkToken });
    assert.equal(failed.code, 'REDE_INDISPONIVEL');
    assert.equal((await snapshot(b)).user.id, accountA);
    await context.unroute('**/api/v2/web-auth/refresh');
    await b.evaluate(async ({ name, token }) => (await import(name)).getSessionManager().ensureToken(token),
      { name: managerModule, token: networkToken });

    const c = await context.newPage(); await c.goto(base); await waitUser(c, accountA);
    await b.getByRole('button', { name: 'Novo hábito', exact: true }).first().click();
    await b.getByLabel('Nome do hábito', { exact: true }).fill('synthetic-private-draft-A');
    const draftToken = (await snapshot(b)).token;
    await b.evaluate(async ({ name, token }) => (await import(name)).getSessionManager().ensureToken(token),
      { name: managerModule, token: draftToken });
    assert.equal(await b.getByLabel('Nome do hábito', { exact: true }).inputValue(), 'synthetic-private-draft-A');
    let release, received;
    const gate = new Promise(done => { release = done; });
    const arrived = new Promise(done => { received = done; });
    await b.route('**/api/me', async route => {
      const response = await route.fetch();
      received(); await gate; await route.fulfill({ response });
    });
    const lateResult = b.evaluate(async name => {
      const manager = (await import(name)).getSessionManager();
      try { await manager.authenticatedRequest('/me', {}, manager.getSnapshot().token); return 'leaked'; }
      catch (error) { return error.code; }
    }, managerModule);
    await arrived;
    await c.evaluate(async name => (await import(name)).getSessionManager().login('b@example.invalid', 'Synthetic!1'), managerModule);
    await waitUser(c, accountB); await waitUser(b, accountB);
    release(); assert.equal(await lateResult, 'SESSAO_ALTERADA'); await b.unroute('**/api/me');
    assert.equal(await b.getByLabel('Nome do hábito', { exact: true }).count(), 0);
    await b.getByRole('button', { name: 'Novo hábito', exact: true }).first().click();
    assert.equal(await b.getByLabel('Nome do hábito', { exact: true }).inputValue(), '');
    await b.getByRole('button', { name: 'Fechar', exact: true }).click();

    const csrf = await context.request.post(base + '/api/v2/web-auth/refresh', {
      headers: { Origin: 'https://hostile.example.invalid' }, data: {}
    });
    assert.equal(csrf.status(), 403);
    assert.equal((await stats()).activeSessions, 1);

    await fetch(fixture + '/__test/revoke', { method: 'POST' });
    const revoked = await b.evaluate(async name => {
      const manager = (await import(name)).getSessionManager();
      try { await manager.authenticatedRequest('/me', {}, manager.getSnapshot().token); return false; }
      catch (error) { return error.status === 401 || error.code === 'SESSAO_ALTERADA'; }
    }, managerModule);
    assert.equal(revoked, true);
    await b.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor(); await c.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
    assert.equal((await context.cookies()).filter(item => item.name === 'revive_refresh').length, 0);
    assert.deepEqual(errors, []); assert.deepEqual(tokenUrls, []);
    const result = {
      browser: await browser.version(), http: 'real shared session handlers, synthetic DB fixture', origin: base,
      passed: ['HttpOnly cookie and no JS credential persistence', 'two tabs and one concurrent rotation',
        'concurrent authenticated requests', 'reload restoration', 'cross-tab logout and revocation',
        'lock recovery after closing owner', 'network failure preserves account', 'account-B login rejects delayed A response',
        'draft survives refresh and is removed on account switch', 'cross-origin request refused', 'server revocation clears both tabs', 'no page errors or tokens in URLs'],
      limitations: ['PostgreSQL is verified separately; this browser fixture uses synthetic storage.', 'No production accounts used.']
    };
    if (process.env.REVIVE_BROWSER_EVIDENCE) {
      fs.mkdirSync(process.env.REVIVE_BROWSER_EVIDENCE, { recursive: true });
      fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_EVIDENCE, 'web-sessions-results.json'), JSON.stringify(result, null, 2));
    }
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); await fetch(fixture + '/__test/reset', { method: 'POST' }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
