const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.REVIVE_BROWSER_URL || 'http://127.0.0.1:4177';
const fixture = process.env.REVIVE_BROWSER_FIXTURE || 'http://127.0.0.1:3177';
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';
const habit = '10000000-0000-4000-8000-000000000001';
const stats = async () => (await fetch(fixture + '/__test/status')).json();
const setup = (page, login) => page.evaluate(async ({ A, login }) => {
  const session = (await import('/src/services/session-manager.js')).getSessionManager();
  await session.start();
  if (login) await session.login('a@example.invalid', 'Synthetic!1');
  if (session.getSnapshot().user?.id !== A) throw Error('Fixture session A not restored');
  window.testStore = await (await import('/src/offline/account-database.js')).openAccountDatabase(A);
  window.syncChanges = 0;
  window.testSync = (await import('/src/offline/sync-coordinator.js')).createSyncCoordinator({
    store: window.testStore, session, onChange: () => { window.syncChanges++; }
  });
}, { A, login });
const enqueue = (page, type, payload, options) => page.evaluate(args => window.testSync.enqueue(args.type, args.payload, args.options), { type, payload, options });
const run = page => page.evaluate(() => window.testSync.run().then(result => ({
  synced: result.synced, error: result.error?.code, paused: result.paused, refreshError: result.refreshError?.code
})));
(async () => {
  const results = [];
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    await fetch(fixture + '/__test/reset', { method: 'POST' });
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'revive-sync-'));
    const options = { headless: true, ...(engine === 'chromium' && process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) };
    let context;
    const ids = Object.fromEntries(['create', 'edit', 'goal', 'complete', 'relapse', 'urge', 'conflict', 'closedOwner', 'late'].map(key => [key, randomUUID()]));
    try {
      context = await playwright[engine].launchPersistentContext(profile, options);
      let a = await context.newPage(); await a.goto(base); await setup(a, true);
      const record = { vicio_id: habit, humor: 'bom', data_registro: '2026-10-16', timezone: 'America/Sao_Paulo', observacoes: 'synthetic draft' };
      await enqueue(a, 'record.create', record, { id: ids.create });
      await enqueue(a, 'record.update', { recordId: 'local:' + ids.create, expected_version: null, observacoes: 'synthetic final' }, { id: ids.edit, dependsOn: ids.create });
      let b = await context.newPage(); await b.goto(base); await setup(b, false);
      const parallel = await Promise.all([run(a), run(b)]);
      assert.equal(parallel.reduce((n, result) => n + result.synced, 0), 2);
      let current = await stats(); assert.equal(current.counts.writes, 2); assert.equal(current.events.registros, 1);
      const recordId = await a.evaluate(id => window.testStore.getMapping(id).then(mapping => mapping.entityId), ids.create);
      const snapshot = await a.evaluate(() => window.testStore.getSnapshot());
      assert.equal(snapshot.data.registros[0].observacoes, 'synthetic final');
      assert.equal(snapshot.data.registros[0].revision, 2);

      await enqueue(a, 'goal.create', { vicio_id: habit, descricao_meta: 'Synthetic goal', dias_objetivo: 7 }, { id: ids.goal });
      await fetch(fixture + '/__test/drop-next-response', { method: 'POST' });
      const lost = await run(a); assert.equal(lost.paused, true);
      current = await stats(); assert.equal(current.counts.writes, 3); assert.equal(current.events.metas, 1);
      assert.equal(await a.evaluate(id => window.testStore.getReceipt(id), ids.goal), null);
      assert.equal((await a.evaluate(() => window.testStore.getQueue()))[0].id, ids.goal);
      await context.close();
      context = await playwright[engine].launchPersistentContext(profile, options);
      a = await context.newPage(); await a.goto(base); await setup(a, false);
      assert.equal((await a.evaluate(() => window.testStore.getQueue()))[0].id, ids.goal);
      await a.evaluate(id => window.testStore.retry(id), ids.goal);
      assert.equal((await run(a)).synced, 1);
      current = await stats(); assert.equal(current.events.metas, 1); assert.equal(current.counts.writes, 3); assert.ok(current.counts.replays >= 1);

      await enqueue(a, 'goal.complete', { goalId: 'local:' + ids.goal }, { id: ids.complete, dependsOn: ids.goal });
      await enqueue(a, 'relapse.create', { addictionId: habit, resetarContador: false, occurred_at: '2026-10-16T12:00:00.000Z', timezone: 'America/Sao_Paulo' }, { id: ids.relapse });
      await enqueue(a, 'urge.create', { vicio_id: habit, intensidade: 0, occurred_at: '2026-10-16T12:30:00.000Z', timezone: 'America/Sao_Paulo' }, { id: ids.urge });
      const remaining = await run(a);
      assert.equal(remaining.synced, 3, JSON.stringify(remaining));
      current = await stats(); assert.equal(current.counts.writes, 6); assert.equal(current.events.vontades, 1); assert.equal(current.events.recaidas, 1);
      assert.equal((await a.evaluate(() => window.testStore.getSnapshot())).data.metas[0].concluida, true);

      await enqueue(a, 'record.update', { recordId, expected_version: 1, observacoes: 'preserved synthetic conflict' }, { id: ids.conflict });
      assert.equal((await run(a)).error, 'REVISAO_CONFLITO');
      let queue = await a.evaluate(() => window.testStore.getQueue());
      assert.equal(queue[0].status, 'recovery'); assert.equal(queue[0].payload.observacoes, 'preserved synthetic conflict');
      await context.close(); context = await playwright[engine].launchPersistentContext(profile, options);
      a = await context.newPage(); await a.goto(base); await setup(a, false);
      queue = await a.evaluate(() => window.testStore.getQueue());
      assert.equal(queue[0].status, 'recovery'); assert.equal(queue[0].payload.observacoes, 'preserved synthetic conflict');
      await a.evaluate(id => window.testSync.discard(id), ids.conflict);

      await enqueue(a, 'record.create', record, { id: ids.closedOwner });
      b = await context.newPage(); await b.goto(base); await setup(b, false);
      await a.evaluate(user => { void navigator.locks.request('revive-sync-' + user, () => {
        window.syncLockHeld = true; return new Promise(() => {});
      }); }, A);
      await a.waitForFunction(() => window.syncLockHeld);
      const waiting = run(b); await a.close(); await waiting;
      current = await stats(); assert.equal(current.events.registros, 2); assert.equal(current.counts.writes, 7);

      await enqueue(b, 'record.create', record, { id: ids.late });
      let release, received;
      const gate = new Promise(done => { release = done; }), arrived = new Promise(done => { received = done; });
      await b.route('**/api/v2/registros', async route => {
        const response = await route.fetch(); received(); await gate; await route.fulfill({ response });
      });
      const late = run(b); await arrived;
      const c = await context.newPage(); await c.goto(base);
      await c.evaluate(async () => {
        const manager = (await import('/src/services/session-manager.js')).getSessionManager();
        await manager.start(); await manager.login('b@example.invalid', 'Synthetic!1');
      });
      await b.waitForFunction(async user => (await import('/src/services/session-manager.js')).getSessionManager().getSnapshot().user?.id === user, B);
      const notifications = await b.evaluate(() => window.syncChanges);
      release(); await late; await b.unroute('**/api/v2/registros');
      assert.equal(await b.evaluate(() => window.syncChanges), notifications);
      assert.equal(await b.evaluate(id => window.testStore.getReceipt(id), ids.late), null);
      assert.equal((await b.evaluate(() => window.testStore.getQueue()))[0].id, ids.late);
      const emptyB = await b.evaluate(async user => {
        const store = await (await import('/src/offline/account-database.js')).openAccountDatabase(user);
        const result = { queue: (await store.getQueue()).length, receipt: await store.getReceipt(window.testLateId || 'missing'), snapshot: await store.getSnapshot() };
        store.close(); return result;
      }, B);
      assert.equal(emptyB.queue, 0); assert.equal(emptyB.snapshot, null);
      await b.evaluate(async () => {
        const manager = (await import('/src/services/session-manager.js')).getSessionManager();
        await manager.login('a@example.invalid', 'Synthetic!1');
        window.testSync.dispose(); window.testStore.close();
      });
      await setup(b, false); await run(b);
      current = await stats(); assert.equal(current.events.registros, 3); assert.equal(current.counts.writes, 8);
      assert.equal((await b.evaluate(() => window.testStore.getQueue())).length, 0);
      results.push({ engine, browserVersion: context.browser()?.version(), channel: engine === 'chromium' ? process.env.PLAYWRIGHT_CHANNEL || 'playwright-managed' : 'playwright-managed', passed: ['two tabs serialize sending', 'create and dependent correction', 'six v2 mutation types', 'remote commit with dropped HTTP response and cold restart', 'same-key replay produces one event', 'permanent conflict survives cold restart', 'lock recovers after owner closes', 'A/B change preserves old intent without notifying B', 'A reconciles after reauthentication'], transport: 'real HTTP/shared API handlers; synthetic RPC storage, not PostgreSQL' });
    } finally {
      await context?.close(); await fetch(fixture + '/__test/reset', { method: 'POST' });
      const resolved = path.resolve(profile), root = path.resolve(os.tmpdir()) + path.sep;
      if (!resolved.startsWith(root) || !path.basename(resolved).startsWith('revive-sync-')) throw Error('Refusing unsafe profile cleanup');
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
  if (process.env.REVIVE_BROWSER_EVIDENCE) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_EVIDENCE, 'offline-sync-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
