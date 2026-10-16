const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const net = require('node:net');
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
async function startFixture(port, revision = '') {
  const child = spawn(process.execPath, [path.join(__dirname, 'session-fixture.cjs')], {
    env: { ...process.env, REVIVE_BROWSER_API_PORT: String(port), REVIVE_BROWSER_SHELL_REVISION: revision }, stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Fixture start timed out')), 10000);
    child.on('error', reject);
    child.on('exit', code => { clearTimeout(timeout); reject(new Error('Fixture exited: ' + code)); });
    child.stdout.on('data', chunk => { if (String(chunk).includes('Synthetic session HTTP API')) { clearTimeout(timeout); resolve(); } });
  });
  return child;
}
async function stopFixture(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill(); await stopped;
}
(async () => {
  const results = [];
  for (const engine of (process.env.REVIVE_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'revive-shell-'));
    const options = { headless: true, ...(engine === 'chromium' && process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) };
    let context, fixture, page;
    const base = 'http://127.0.0.1:' + await freePort();
    try {
      fixture = await startFixture(Number(new URL(base).port));
      context = await playwright[engine].launchPersistentContext(profile, options);
      page = await context.newPage(); await page.goto(base);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
      await page.evaluate(() => new Promise((resolve, reject) => {
        const req = indexedDB.open('revive-account-00000000-0000-4000-8000-000000000099', 1);
        req.onupgradeneeded = () => { for (const name of ['meta','snapshots','outbox']) req.result.createObjectStore(name, { keyPath: name === 'outbox' ? 'id' : 'key' }); };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result, tx = db.transaction(['outbox'], 'readwrite');
          tx.objectStore('outbox').put({ id: 'pending-shell-upgrade', payload: { observacoes: 'synthetic preserved draft' } });
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
        };
      }));
      await stopFixture(fixture);
      fixture = await startFixture(Number(new URL(base).port), 'updated');
      await page.evaluate(async () => {
        window.shellControllerChanged = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => { window.shellControllerChanged = true; }, { once: true });
        await (await navigator.serviceWorker.getRegistration()).update();
      });
      await page.waitForFunction(() => window.shellControllerChanged, null, { timeout: 20000 });
      const cached = await page.evaluate(async () => {
        const login = await fetch('/api/v2/web-auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@example.invalid', senha: 'Synthetic!1' }) });
        if (login.status !== 200) throw Error('Synthetic login failed');
        const session = await login.json();
        const probe = await fetch('/api/private-probe', { headers: { Authorization: 'Bearer ' + session.access_token } });
        if ((await probe.json()).privateMarker !== 'synthetic-private-only') throw Error('Private fixture probe failed');
        const urls = [];
        for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) urls.push(new URL(request.url).pathname);
        return urls;
      });
      assert.ok(cached.includes('/index.html')); assert.ok(cached.includes('/asset-manifest.json'));
      assert.ok(cached.some(url => /^\/assets\/.*\.js$/.test(url)));
      assert.ok(cached.some(url => /^\/assets\/.*\.css$/.test(url)));
      assert.ok(cached.every(url => !url.startsWith('/api')));
      // Turning off only the page network may leave service-worker requests online.
      // Stop this test's own server as well: the private request must really be unavailable.
      await stopFixture(fixture); fixture = null;
      if (engine !== 'webkit') await context.setOffline(true);
      await page.reload();
      await page.getByRole('alert').filter({ hasText: 'Não foi possível restaurar sua sessão' }).waitFor();
      const version = context.browser()?.version();
      await context.close(); context = await playwright[engine].launchPersistentContext(profile, options);
      if (engine !== 'webkit') await context.setOffline(true);
      page = await context.newPage(); await page.goto(base);
      await page.getByRole('alert').filter({ hasText: 'Não foi possível restaurar sua sessão' }).waitFor();
      const privateCached = await page.evaluate(async () => {
        for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) if (new URL(request.url).pathname.startsWith('/api')) return true;
        return false;
      });
      assert.equal(privateCached, false);
      const pendingPreserved = await page.evaluate(() => new Promise((resolve, reject) => {
        const req = indexedDB.open('revive-account-00000000-0000-4000-8000-000000000099');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result, tx = db.transaction(['outbox'], 'readonly'), read = tx.objectStore('outbox').get('pending-shell-upgrade');
          let ok;
          read.onsuccess = () => { ok = read.result?.payload.observacoes === 'synthetic preserved draft'; };
          tx.oncomplete = () => { db.close(); resolve(ok); };
        };
      }));
      assert.equal(pendingPreserved, true);
      results.push({ engine, browserVersion: version, networkTest: engine === 'webkit' ? 'own HTTP server stopped; WebKit offline protocol avoided' : 'own HTTP server stopped and context offline', coldReopenOffline: true, pendingPreservedAcrossWorkerUpdate: pendingPreserved, publicFiles: cached.length, privateResponsesCached: false,
        scope: 'Public production build reopens offline; private account UI/fallback is a separate pending integration.' });
    } catch (error) {
      console.error('Offline shell failure in ' + engine, await page?.locator('body').innerText().catch(() => 'unavailable'));
      throw error;
    } finally {
      await context?.close(); await stopFixture(fixture);
      const resolved = path.resolve(profile), root = path.resolve(os.tmpdir()) + path.sep;
      if (!resolved.startsWith(root) || !path.basename(resolved).startsWith('revive-shell-')) throw Error('Refusing unsafe profile cleanup');
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
  if (process.env.REVIVE_BROWSER_EVIDENCE) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_EVIDENCE, 'offline-shell-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
