const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const A = '00000000-0000-4000-8000-000000000001';
const habit = '10000000-0000-4000-8000-000000000001';
const port = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); }); });
const launchFixture = async number => {
  const child = spawn(process.execPath, [path.join(__dirname, 'session-fixture.cjs')], { env: { ...process.env, REVIVE_BROWSER_API_PORT: String(number) }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Fixture timeout')), 10000); child.once('error', reject); child.stdout.on('data', data => { if (String(data).includes('Synthetic session HTTP API')) { clearTimeout(timer); resolve(); } }); });
  return child;
};
const stop = async child => { if (child?.exitCode === null && child?.signalCode === null) { const done = new Promise(resolve => child.once('exit', resolve)); child.kill(); await done; } };
const queue = page => page.evaluate(user => new Promise((resolve, reject) => {
  const req = indexedDB.open('revive-account-' + user);
  req.onerror = () => reject(req.error);
  req.onsuccess = () => { const db = req.result, tx = db.transaction('outbox'); const read = tx.objectStore('outbox').getAll(); read.onsuccess = () => resolve(read.result); tx.oncomplete = () => db.close(); };
}), A);
const login = async (page, email = 'a@example.invalid') => {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('Synthetic!1');
  await page.locator('form').getByRole('button', { name: 'Entrar e continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Sair', exact: true }).waitFor();
};
(async () => {
  const results = [];
  for (const engine of (process.env.REVIVE_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'revive-offline-ui-'));
    const number = await port(), base = 'http://127.0.0.1:' + number;
    const options = { headless: true, viewport: { width: 1280, height: 900 }, locale: 'pt-BR' };
    let context, fixture;
    const errors = [], networkDiagnostics = [];
    let networkDown = false;
    const observeError = error => {
      const expected = ['registros', 'bootstrap', 'web-auth/refresh', 'web-auth/logout'].some(endpoint => error.message.endsWith('/127.0.0.1:' + number + '/api/v2/' + endpoint + ' due to access control checks.'));
      if (engine === 'webkit' && networkDown && expected) networkDiagnostics.push(error.message);
      else errors.push(error.message);
    };
    try {
      fixture = await launchFixture(number);
      context = await playwright[engine].launchPersistentContext(profile, options);
      let page = await context.newPage(); page.on('pageerror', observeError);
      await page.goto(base); await login(page);
      await page.waitForFunction(() => !!localStorage.getItem('revive_offline_account'));
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      await page.goto(base + '/vicios/' + habit);
      await page.getByRole('heading', { name: 'Novo registro diário' }).waitFor();
      // Block only API access; public files are cached by the real production service worker.
      networkDown = true;
      await stop(fixture); fixture = null;
      await page.getByRole('button', { name: 'Selecione seu humor...' }).click();
      await page.getByRole('button', { name: /Bom/ }).click();
      await page.getByPlaceholder('Observações...').fill('synthetic offline persisted UI');
      await page.evaluate(() => {
        window.originalOutboxAdd = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function (...args) {
          if (this.name === 'outbox') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
          return window.originalOutboxAdd.apply(this, args);
        };
      });
      await page.getByRole('button', { name: 'Salvar registro', exact: true }).click();
      await page.getByText('Nao foi possivel criar o registro diario.', { exact: true }).waitFor();
      assert.equal(await page.getByPlaceholder('Observações...').inputValue(), 'synthetic offline persisted UI');
      assert.equal((await queue(page)).length, 0);
      await page.evaluate(() => { IDBObjectStore.prototype.add = window.originalOutboxAdd; delete window.originalOutboxAdd; });
      await page.getByRole('button', { name: 'Salvar registro', exact: true }).click();
      await page.getByText('1 pendência(s).', { exact: false }).first().waitFor();
      const saved = await queue(page); assert.equal(saved.length, 1);
      const intentId = saved[0].id;
      await page.getByRole('button', { name: 'Sair', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Cancelar');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('dialog')), true);
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      assert.equal((await queue(page)).length, 1);
      await page.getByRole('button', { name: 'Sair', exact: true }).click();
      await page.getByRole('button', { name: 'Sincronizar e sair', exact: true }).click();
      await page.getByRole('dialog').getByRole('alert').waitFor();
      assert.equal((await queue(page)).length, 1);
      await page.getByRole('button', { name: 'Descartar pendências e sair', exact: true }).click();
      await page.getByRole('dialog').getByRole('alert').waitFor();
      assert.equal((await queue(page)).length, 1);
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

      await stop(fixture); fixture = null;
      await context.close();
      context = await playwright[engine].launchPersistentContext(profile, options);
      page = await context.newPage(); page.on('pageerror', observeError);
      await page.goto(base + '/sincronizacao');
      await page.getByRole('heading', { name: 'Sincronização', exact: true }).waitFor({ timeout: 30000 });
      await page.getByText('Modo local:', { exact: false }).waitFor();
      assert.equal((await queue(page))[0].id, intentId);
      await page.getByText('Consultar conteúdo local privado').click();
      await page.getByText('synthetic offline persisted UI', { exact: false }).waitFor();
      if (process.env.REVIVE_BROWSER_ARTIFACTS) {
        fs.mkdirSync(process.env.REVIVE_BROWSER_ARTIFACTS, { recursive: true });
        await page.screenshot({ path: path.join(process.env.REVIVE_BROWSER_ARTIFACTS, 'offline-ui-' + engine + '.png'), fullPage: true });
      }
      // Restart the fixture on the same origin. The persisted intent keeps its UUID.
      fixture = await launchFixture(number); networkDown = false;
      await page.getByRole('button', { name: 'Restaurar sessão', exact: true }).click();
      // Fixture restart has no server sessions: confirmed 401 must lock the local data.
      await page.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
      await login(page);
      await page.goto(base + '/sincronizacao');
      await page.getByRole('button', { name: 'Sincronizar agora', exact: true }).click();
      await page.getByText('0 pendência(s).', { exact: false }).first().waitFor();
      const stats = await (await fetch(base + '/__test/status')).json();
      assert.equal(stats.events.registros, 1); assert.equal(stats.counts.writes, 1);
      await page.goto(base + '/vicios/' + habit);
      await fetch(base + '/__test/block-mutations', { method: 'POST' });
      await page.getByRole('button', { name: 'Selecione seu humor...' }).click();
      await page.getByRole('button', { name: /Bom/ }).click();
      await page.getByPlaceholder('Observações...').fill('synthetic explicit discard');
      await page.getByRole('button', { name: 'Salvar registro', exact: true }).click();
      await page.getByText('1 pendência(s).', { exact: false }).first().waitFor();
      await page.getByRole('button', { name: 'Sair', exact: true }).click();
      await page.getByRole('button', { name: 'Descartar pendências e sair', exact: true }).click();
      await page.getByRole('heading', { name: 'Bem-vindo de volta', exact: true }).waitFor();
      assert.equal((await queue(page)).length, 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('revive_offline_account')), null);
      await login(page, 'b@example.invalid');
      await page.goto(base + '/sincronizacao');
      await page.getByRole('heading', { name: 'Sincronização', exact: true }).waitFor();
      await page.getByText('Conta B sintética', { exact: true }).waitFor();
      await page.getByText('0 pendência(s).', { exact: false }).first().waitFor();
      assert.equal(await page.getByText('synthetic offline persisted UI', { exact: false }).count(), 0);
      assert.equal(await page.locator('pre').count(), 0);
      assert.deepEqual(errors, []);
      results.push({ engine, expectedWebKitNetworkDiagnostics: networkDiagnostics.length, offlineReopen: true, durableId: true, failedLogoutPreserves: true, storageFailureKeepsDraft: true, explicitCancel: true, explicitDiscard: true, confirmed401Locks: true, singleRemoteEvent: true, accountIsolation: true });
      console.log(engine + ': offline UI passed');
    } catch (error) {
      console.error('UI state:', await context?.pages().at(-1)?.locator('body').innerText());
      console.error('Page errors:', errors);
      throw error;
    } finally {
      await context?.close(); await stop(fixture);
      const resolved = path.resolve(profile);
      if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('revive-offline-ui-')) fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
  if (process.env.REVIVE_BROWSER_ARTIFACTS) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_ARTIFACTS, 'offline-ui-results.json'), JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
