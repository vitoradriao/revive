const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.REVIVE_BROWSER_URL || 'http://127.0.0.1:4177';
const modulePath = '/src/offline/account-database.js';
const A = '00000000-0000-4000-8000-000000000011', B = '00000000-0000-4000-8000-000000000012';
const results = [];
(async () => {
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'revive-idb-'));
    const options = { headless: true, ...(engine === 'chromium' && process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) };
    let context;
    const ids = { create: randomUUID(), edit: randomUUID(), record: randomUUID(), habit: randomUUID(), denied: randomUUID() };
    try {
      context = await playwright[engine].launchPersistentContext(profile, options);
      let page = await context.newPage(); await page.goto(base);
      const first = await page.evaluate(async ({ modulePath, A, B, ids }) => {
        const api = await import(modulePath);
        const seed = userId => new Promise((resolve, reject) => {
          const req = indexedDB.open(api.DATABASE_PREFIX + userId, 1);
          req.onupgradeneeded = () => {
            for (const name of ['meta', 'snapshots', 'outbox']) req.result.createObjectStore(name, { keyPath: name === 'outbox' ? 'id' : 'key' });
          };
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result, tx = db.transaction(['meta', 'outbox'], 'readwrite');
            tx.objectStore('meta').put({ key: 'nextSequence', value: 1 });
            tx.objectStore('outbox').put({ id: ids.create, userId, type: 'record.create',
              payload: { vicio_id: ids.habit, humor: 'bom', data_registro: '2026-10-16', timezone: 'America/Sao_Paulo' },
              sequence: 1, dependsOn: null, status: 'pending', attempts: 0, nextRetryAt: 0,
              createdAt: '2026-10-16T10:00:00.000Z', localId: 'local:' + ids.create });
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = () => reject(tx.error);
          };
        });
        await seed(A); await seed(B);
        const store = await api.openAccountDatabase(A);
        if ((await store.getQueue())[0]?.id !== ids.create) throw Error('legacy queue lost');
        const record = { id: ids.record, vicio_id: ids.habit, revision: 1, humor: 'bom', data_registro: '2026-10-16', observacoes: 'legacy-long-'.repeat(200) };
        await store.saveSnapshot({ usuario: { id: A, nome: 'Synthetic A', email: 'a@example.invalid' }, server_time: '2026-10-16T12:00:00.000Z',
          vicios: [], registros: [record], recaidas: [], metas: [], mensagem: null });
        await store.savePage('records', { inicio: '2026-10-01', fim: '2026-10-16', cursor: null },
          { registros: [record], next_cursor: 'synthetic-more-pages' });
        await store.enqueue('record.update', { recordId: 'local:' + ids.create, expected_version: null, observacoes: 'correction' }, { id: ids.edit, dependsOn: ids.create });
        let failed = false, once = true;
        const nativePut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          const request = nativePut.apply(this, args);
          if (this.name === 'receipts' && once) { once = false; queueMicrotask(() => this.transaction.abort()); }
          return request;
        };
        try { await store.acknowledge(ids.create, { registro: record }); }
        catch (error) { failed = error.code === 'STORAGE_UNAVAILABLE'; }
        finally { IDBObjectStore.prototype.put = nativePut; }
        if (!failed || await store.getReceipt(ids.create) || await store.getMapping(ids.create) || (await store.getQueue()).length !== 2) throw Error('aborted receipt changed local state');
        await store.acknowledge(ids.create, { registro: record });
        const edit = (await store.getQueue())[0];
        if (edit.id !== ids.edit || edit.payload.recordId !== ids.record || edit.payload.expected_version !== 1 || edit.dependsOn) throw Error('dependent correction not bound');
        if ((await store.getPage('records', { fim: '2026-10-16', cursor: null, inicio: '2026-10-01' })).data.next_cursor !== 'synthetic-more-pages') throw Error('cached page/cursor lost');
        let unavailable = false;
        try { await api.openAccountDatabase(A, { indexedDB: { open() { throw new DOMException('Denied', 'SecurityError'); } } }); }
        catch (error) { unavailable = error.code === 'STORAGE_UNAVAILABLE'; }
        if (!unavailable) throw Error('unavailable storage reported success');
        let upgradeAborted = false;
        try {
          await api.openAccountDatabase(B, { indexedDB: { open(...args) {
            const req = indexedDB.open(...args);
            req.addEventListener('upgradeneeded', () => queueMicrotask(() => req.transaction.abort()));
            return req;
          } } });
        } catch (error) { upgradeAborted = error.code === 'STORAGE_UNAVAILABLE'; }
        if (!upgradeAborted) throw Error('upgrade abort not reported');
        const old = await new Promise((resolve, reject) => {
          const req = indexedDB.open(api.DATABASE_PREFIX + B, 1);
          req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        });
        if (old.version !== 1 || old.objectStoreNames.contains('receipts')) throw Error('failed migration changed old version');
        old.close();
        const other = await api.openAccountDatabase(B);
        if (await other.getSnapshot() || await other.getReceipt(ids.create)) throw Error('A data reached B');
        if ((await other.getQueue())[0].userId !== B) throw Error('B legacy queue lost');
        other.close();
        let protectedPending = false;
        try { await store.clearAccount(); } catch (error) { protectedPending = error.code === 'PENDING_INTENTS'; }
        if (!protectedPending || (await store.getQueue()).length !== 1 || !await store.getReceipt(ids.create)) throw Error('account cleanup erased pending work');
        store.close();
        const D = '00000000-0000-4000-8000-000000000014';
        const diary = await api.openAccountDatabase(D);
        const draft = { base: record, values: { humor: 'neutro', observacoes: record.observacoes } };
        await diary.saveRecordDraft('synthetic-draft', draft);
        const conflict = await diary.enqueue('record.update', { recordId: ids.record, expected_version: 1, humor: 'neutro' });
        await diary.markFailed(conflict.id, { code: 'REVISAO_CONFLITO', status: 409 });
        let replacementAborted = false;
        IDBObjectStore.prototype.put = function (...args) {
          const result = nativePut.apply(this, args);
          if (this.name === 'receipts') queueMicrotask(() => this.transaction.abort());
          return result;
        };
        try { await diary.replaceRecordEdit(conflict.id, { recordId: ids.record, expected_version: 2, humor: 'neutro' }); }
        catch (error) { replacementAborted = error.code === 'STORAGE_UNAVAILABLE'; }
        finally { IDBObjectStore.prototype.put = nativePut; }
        if (!replacementAborted || (await diary.getQueue())[0].id !== conflict.id || await diary.getReceipt(conflict.id)) throw Error('conflict replacement was not atomic');
        const replacement = await diary.replaceRecordEdit(conflict.id, { recordId: ids.record, expected_version: 2, humor: 'neutro' });
        if (replacement.id === conflict.id || (await diary.getReceipt(conflict.id)).kind !== 'replaced') throw Error('conflict reused intent key');
        diary.close();
        const reopenedDiary = await api.openAccountDatabase(D);
        if ((await reopenedDiary.getQueue())[0].id !== replacement.id || (await reopenedDiary.getRecordDraft('synthetic-draft')).values.observacoes !== record.observacoes) throw Error('diary recovery lost text');
        reopenedDiary.close();
        const E = '00000000-0000-4000-8000-000000000015';
        const privateStore = await api.openAccountDatabase(E);
        await privateStore.saveSnapshot({ usuario: { id: E }, vicios: [{ id: ids.habit, motivo_pessoal: 'synthetic-private-marker' }], registros: [], metas: [], recaidas: [] });
        await privateStore.saveHabitDraft('deleted', { habitId: ids.habit, values: { personalReason: 'synthetic-private-marker' } });
        await privateStore.saveHabitDraft('kept', { habitId: 'other', values: { personalReason: 'synthetic-other' } });
        await privateStore.enqueue('record.create', { vicio_id: 'other' }, { id: crypto.randomUUID() });
        await privateStore.removeHabit(ids.habit);
        if (await privateStore.getHabitDraft('deleted') || (await privateStore.getSnapshot()).data.vicios.length || !await privateStore.getHabitDraft('kept') || (await privateStore.getQueue()).length !== 1) throw Error('habit removal did not isolate private content');
        privateStore.close();
        const C = '00000000-0000-4000-8000-000000000013';
        await seed(C);
        const oldConnection = await new Promise((resolve, reject) => {
          const req = indexedDB.open(api.DATABASE_PREFIX + C, 1);
          req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        });
        let blocked = false;
        try { await api.openAccountDatabase(C); } catch (error) { blocked = error.code === 'STORAGE_BLOCKED'; }
        if (!blocked) throw Error('blocked upgrade reported success');
        oldConnection.close();
        let versionChanged = false;
        const recovered = await api.openAccountDatabase(C, { onVersionChange: () => { versionChanged = true; } });
        if ((await recovered.getQueue())[0].id !== ids.create) throw Error('blocked upgrade lost queue');
        const future = await new Promise((resolve, reject) => {
          const req = indexedDB.open(api.DATABASE_PREFIX + C, 3);
          req.onupgradeneeded = () => req.result.createObjectStore('future', { keyPath: 'key' });
          req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        });
        future.close();
        let oldClosed = false;
        try { await recovered.getQueue(); } catch (error) { oldClosed = error.code === 'STORAGE_VERSION_CHANGED'; }
        if (!versionChanged || !oldClosed) throw Error('old connection still accepts work after upgrade');
        return { personalReasonRemovalIsolated: true, conflictReplacementAtomic: true, diaryDraftReopened: true, preservedLegacy: true, receiptAtomic: true, dependencyBound: true, pagePreserved: true, accountIsolation: true, abortedUpgradePreserved: true, unavailableStorageRejected: true, pendingCleanupRejected: true, blockedUpgradePreserved: true, oldConnectionClosed: true };
      }, { modulePath, A, B, ids });
      assert.equal(Object.values(first).every(Boolean), true);
      await context.close(); context = await playwright[engine].launchPersistentContext(profile, options);
      page = await context.newPage(); await page.goto(base);
      const reopened = await page.evaluate(async ({ modulePath, A, ids }) => {
        const api = await import(modulePath), store = await api.openAccountDatabase(A);
        const queue = await store.getQueue(), snapshot = await store.getSnapshot(), receipt = await store.getReceipt(ids.create), mapping = await store.getMapping(ids.create);
        const ok = queue.length === 1 && queue[0].id === ids.edit && queue[0].payload.recordId === ids.record &&
          snapshot.data.registros[0].observacoes.length === 'legacy-long-'.length * 200 && receipt.kind === 'confirmed' && mapping.entityId === ids.record;
        store.close(); return ok;
      }, { modulePath, A, ids });
      assert.equal(reopened, true, engine + ' cold restart');
      let quota = 'not tested on this engine';
      if (engine === 'chromium') {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Storage.overrideQuotaForOrigin', { origin: base, quotaSize: 1024 });
        try {
          const result = await page.evaluate(async ({ modulePath, A, ids }) => {
            const store = await (await import(modulePath)).openAccountDatabase(A);
            let code;
            try { await store.enqueue('record.create', { vicio_id: ids.habit, humor: 'bom', observacoes: 'x'.repeat(1024 * 1024), data_registro: '2026-10-16' }, { id: ids.denied }); }
            catch (error) { code = error.code; }
            const absent = !(await store.getQueue()).some(item => item.id === ids.denied);
            store.close(); return { code, absent };
          }, { modulePath, A, ids });
          assert.equal(result.code, 'STORAGE_QUOTA'); assert.equal(result.absent, true);
          quota = 'real Chromium quota failure rejected without saved intent';
        } finally { await cdp.send('Storage.overrideQuotaForOrigin', { origin: base }); await cdp.detach(); }
      }
      results.push({ engine, browserVersion: context.browser()?.version(), channel: engine === 'chromium' ? process.env.PLAYWRIGHT_CHANNEL || 'playwright-managed' : 'playwright-managed', ...first, coldRestart: reopened, quota });
    } finally {
      await context?.close();
      const resolved = path.resolve(profile), root = path.resolve(os.tmpdir()) + path.sep;
      if (!resolved.startsWith(root) || !path.basename(resolved).startsWith('revive-idb-')) throw Error('Refusing unsafe test-profile cleanup');
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
  const result = { passed: results, scope: 'Real IndexedDB and native transactions; unavailable-factory branch injected separately. No production accounts or server synchronization covered here.' };
  if (process.env.REVIVE_BROWSER_EVIDENCE) fs.writeFileSync(path.join(process.env.REVIVE_BROWSER_EVIDENCE, 'offline-storage-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
