const assert = require('node:assert/strict');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.REVIVE_BROWSER_URL || 'http://127.0.0.1:4177';
(async () => {
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    const browser = await playwright[engine].launch({ headless: true });
    try {
      const context = await browser.newContext();
      await context.route('**/*', route => route.request().resourceType() === 'document' ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }) : route.continue());
      const page = await context.newPage(); await page.goto(base);
      await page.evaluate(async () => {
        const { createOfflineClient } = await import('/src/offline/client.js');
        const A = '00000000-0000-4000-8000-000000000091', B = '00000000-0000-4000-8000-000000000092';
        let state = { user: { id: A }, token: 'synthetic-memory-A', epoch: 'A', authLoading: false };
        const listeners = new Set();
        const session = {
          getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
          ensureToken: async () => state.token,
          logout: async () => { state = { user: null, token: null, epoch: 'logout', authLoading: false }; listeners.forEach(fn => fn()); }
        };
        window.switchClientAccount = () => { state = { user: { id: B }, token: 'synthetic-memory-B', epoch: 'B', authLoading: false }; listeners.forEach(fn => fn()); };
        const held = new Promise(resolve => { window.releaseOldBootstrap = resolve; });
        window.clientRequests = [];
        const snapshot = user => ({ usuario: { id: user, nome: 'Synthetic account' }, vicios: [], registros: [], metas: [], recaidas: [] });
        window.testClient = createOfflineClient({ session, request: async (_path, _options, token) => {
          window.clientRequests.push(token);
          if (token.endsWith('A')) { await held; return snapshot(A); }
          return snapshot(B);
        } });
        window.testClient.start();
      });
      await page.waitForFunction(() => window.clientRequests.length === 1);
      await page.evaluate(() => window.switchClientAccount());
      await page.waitForFunction(() => window.testClient.getSnapshot().snapshot?.data.usuario.id.endsWith('092'));
      const result = await page.evaluate(async () => {
        const { openAccountDatabase } = await import('/src/offline/account-database.js');
        const oldKey = '00000000-0000-4000-8000-000000000091:A';
        let refused = false;
        try { await window.testClient.savePage('records', {}, { registros: [] }, oldKey); } catch (error) { refused = error.code === 'SESSAO_ALTERADA'; }
        window.releaseOldBootstrap();
        await new Promise(resolve => setTimeout(resolve, 100));
        const user = window.testClient.getSnapshot().snapshot.data.usuario.id;
        const a = await openAccountDatabase('00000000-0000-4000-8000-000000000091');
        const oldCache = await a.getSnapshot(); a.close();
        await window.testClient.logout();
        const b = await openAccountDatabase('00000000-0000-4000-8000-000000000092');
        const cleared = await b.getSnapshot(); b.close();
        return { refused, user, oldCache, cleared, pointer: localStorage.getItem('revive_offline_account') };
      });
      assert.equal(result.refused, true);
      assert.ok(result.user.endsWith('092'));
      assert.equal(result.oldCache, null); assert.equal(result.cleared, null); assert.equal(result.pointer, null);
      console.log(engine + ': client generation, delayed bootstrap, page guard and logout cleanup passed');
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
