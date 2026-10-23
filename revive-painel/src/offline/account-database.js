import { canRecoverUrge } from '../utils/urges.js';
export const SCHEMA_VERSION = 2;
export const DATABASE_PREFIX = 'revive-account-';
const STORES = ['meta', 'snapshots', 'outbox', 'pages', 'receipts', 'mappings'];
const TYPES = new Set(['record.create', 'record.update', 'urge.create', 'relapse.create', 'goal.create', 'goal.complete']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (code, message) => Object.assign(new Error(message), { code });
const storageError = error => error?.code === 'STORAGE_BLOCKED' ? error : Object.assign(new Error('Não foi possível confirmar a gravação neste navegador. O conteúdo não foi marcado como salvo.'), {
  code: error?.name === 'QuotaExceededError' ? 'STORAGE_QUOTA' : 'STORAGE_UNAVAILABLE', cause: error
});
const stable = value => JSON.stringify(value, (_key, item) => item && !Array.isArray(item) && typeof item === 'object'
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const clone = value => structuredClone(value);
const receiptEntity = (type, response) => {
  const key = type.startsWith('record.') ? 'registro' : type.startsWith('goal.') ? 'meta' : type === 'urge.create' ? 'vontade' : 'recaida';
  const entity = response?.[key];
  if (!entity || !uuid.test(entity.id)) throw fail('RECEIPT_INVALID', 'O servidor não confirmou o evento. A intenção foi preservada.');
  return { key, entity };
};

export function openAccountDatabase(userId, environment = {}) {
  if (!uuid.test(userId)) return Promise.reject(fail('ACCOUNT_INVALID', 'Conta local inválida.'));
  const factory = environment.indexedDB || globalThis.indexedDB;
  return new Promise((resolve, reject) => {
    let request, settled = false, timer;
    const rejectOpen = error => { settled = true; clearTimeout(timer); reject(storageError(error)); };
    try { request = factory.open(DATABASE_PREFIX + userId, SCHEMA_VERSION); }
    catch (error) { rejectOpen(error); return; }
    request.onblocked = () => {
      timer ||= setTimeout(() => rejectOpen(fail('STORAGE_BLOCKED', 'Outra aba está impedindo a atualização. Feche a versão anterior e tente novamente.')), 3000);
    };
    request.onupgradeneeded = event => {
      const db = request.result;
      // Additive only. An aborted upgrade leaves the old version and its pending work intact.
      if (event.oldVersion < 1) for (const name of ['meta', 'snapshots', 'outbox']) db.createObjectStore(name, { keyPath: name === 'outbox' ? 'id' : 'key' });
      if (event.oldVersion < 2) for (const name of ['pages', 'receipts', 'mappings']) db.createObjectStore(name, { keyPath: 'key' });
    };
    request.onerror = () => rejectOpen(request.error);
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) { request.result.close(); return; }
      settled = true;
      resolve(accountStore(request.result, userId, environment.onVersionChange));
    };
  });
}

function accountStore(db, userId, onVersionChange) {
  let closed = false;
  const close = () => { closed = true; db.close(); };
  db.onversionchange = () => { close(); onVersionChange?.(); };
  const own = entity => {
    if (entity?.usuario_id && entity.usuario_id !== userId) throw fail('ACCOUNT_CHANGED', 'A conta da resposta não corresponde ao armazenamento aberto.');
  };
  const run = (names, mode, work) => new Promise((resolve, reject) => {
    if (closed) { reject(fail('STORAGE_VERSION_CHANGED', 'O armazenamento foi atualizado em outra aba. Reabra a página.')); return; }
    let tx, result, semanticError;
    try {
      try { tx = mode === 'readwrite' ? db.transaction(names, mode, { durability: 'strict' }) : db.transaction(names, mode); }
      catch (error) { if (!(error instanceof TypeError)) throw error; tx = db.transaction(names, mode); }
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(semanticError || storageError(tx.error));
      tx.onerror = () => {}; // The native abort is the final failure signal; never report an individual request as committed.
      const set = value => { result = value; };
      const abort = error => { semanticError = error; tx.abort(); };
      const returned = work(tx, set, abort);
      if (returned?.then) throw new Error('Transaction work must stay synchronous.');
    } catch (error) {
      semanticError = error;
      if (tx) { try { tx.abort(); } catch { reject(error); } }
      else reject(storageError(error));
    }
  });
  const read = (store, key) => run([store], 'readonly', (tx, set) => {
    tx.objectStore(store).get(key).onsuccess = event => set(event.target.result || null);
  });
  const all = store => run([store], 'readonly', (tx, set) => {
    tx.objectStore(store).getAll().onsuccess = event => set(event.target.result);
  });
  const changeEntry = (id, change) => run(['outbox'], 'readwrite', (tx, set, abort) => {
    const store = tx.objectStore('outbox');
    store.get(id).onsuccess = event => {
      try {
        const current = event.target.result;
        if (!current || current.userId !== userId) throw fail('INTENT_CHANGED', 'A intenção já mudou. Atualize a tela.');
        const next = change(clone(current));
        store.put(next); set(next);
      } catch (error) { abort(error); }
    };
  });
  const bind = (intent, mapping) => {
    const next = clone(intent);
    if (intent.type === 'record.update') {
      next.payload.recordId = mapping.entityId;
      next.payload.expected_version = mapping.revision;
    } else if (intent.type === 'goal.complete') next.payload.goalId = mapping.entityId;
    else throw fail('DEPENDENCY_INVALID', 'Esta operação não aceita uma criação dependente.');
    next.dependsOn = null;
    return next;
  };
  const validate = (type, payload, id) => {
    if (!TYPES.has(type) || !payload || typeof payload !== 'object' || Array.isArray(payload) || !uuid.test(id)) {
      throw fail('INTENT_INVALID', 'Intenção local inválida.');
    }
    if (payload.usuario_id || payload.access_token || payload.refresh_token) throw fail('INTENT_INVALID', 'Campos de sessão não pertencem a uma intenção.');
  };
  const saveSnapshot = snapshot => {
    if (snapshot?.usuario?.id !== userId) return Promise.reject(fail('ACCOUNT_CHANGED', 'Snapshot de outra conta recusado.'));
    const safe = { usuario: { id: userId, nome: snapshot.usuario.nome, email: snapshot.usuario.email }, server_time: snapshot.server_time, mensagem: snapshot.mensagem || null };
    try {
      for (const key of ['vicios', 'registros', 'recaidas', 'metas', 'conquistas', 'vontades']) {
        if (key === 'conquistas' && snapshot[key] === undefined) continue;
        const rows = snapshot[key] || [];
        if (!Array.isArray(rows)) throw fail('SNAPSHOT_INVALID', 'Resposta local inválida.');
        rows.forEach(own); safe[key] = clone(rows);
      }
    } catch (error) { return Promise.reject(error); }
    return run(['meta', 'snapshots'], 'readwrite', (tx, set) => {
      const row = { key: 'bootstrap', userId, payloadVersion: 1, data: safe, updatedAt: new Date().toISOString(), staleAfterMutation: false };
      tx.objectStore('snapshots').put(row);
      tx.objectStore('meta').put({ key: 'identity', value: safe.usuario });
      set(row);
    });
  };
  const enqueue = (type, payload, { id = crypto.randomUUID(), dependsOn = null } = {}) => {
    try { validate(type, payload, id); }
    catch (error) { return Promise.reject(error); }
    return run(['meta', 'outbox', 'receipts', 'mappings'], 'readwrite', (tx, set, abort) => {
      const outbox = tx.objectStore('outbox'), meta = tx.objectStore('meta');
      outbox.get(id).onsuccess = event => {
        const existing = event.target.result;
        if (existing) {
          if (existing.type !== type || stable(existing.payload) !== stable(payload) || existing.dependsOn !== dependsOn) abort(fail('INTENT_KEY_REUSED', 'Esta intenção já tem outro conteúdo.'));
          else set(existing);
          return;
        }
        tx.objectStore('receipts').get(id).onsuccess = receipt => {
          if (receipt.target.result) { abort(fail('INTENT_CONFIRMED', 'Esta inten��ão já foi confirmada.')); return; }
          meta.get('nextSequence').onsuccess = sequence => {
            const order = Number(sequence.target.result?.value || 0) + 1;
            let entry = { id, userId, type, payload: clone(payload), dependsOn, sequence: order, localId: 'local:' + id,
              status: 'pending', attempts: 0, nextRetryAt: 0, createdAt: new Date().toISOString(), lastError: null };
            const persist = () => {
              try { meta.put({ key: 'nextSequence', value: order }); outbox.add(entry); set(entry); }
              catch (error) { abort(storageError(error)); }
            };
            if (!dependsOn) { persist(); return; }
            tx.objectStore('mappings').get(dependsOn).onsuccess = mapping => {
              if (mapping.target.result) {
                try { entry = bind(entry, mapping.target.result); persist(); } catch (error) { abort(error); }
                return;
              }
              outbox.get(dependsOn).onsuccess = parent => {
                const source = parent.target.result;
                const compatible = type === 'record.update' && ['record.create', 'record.update'].includes(source?.type) ||
                  type === 'goal.complete' && source?.type === 'goal.create';
                if (!compatible || source.userId !== userId || source.id === id) { abort(fail('DEPENDENCY_INVALID', 'A criação ou correção anterior não foi encontrada.')); return; }
                persist();
              };
            };
          };
        };
      };
    });
  };
  const acknowledge = (id, response) => {
    let receipt; // The operation type comes from the persisted intent, never the response.
    return run(['outbox', 'receipts', 'mappings', 'snapshots', 'pages'], 'readwrite', (tx, set, abort) => {
      const outbox = tx.objectStore('outbox');
      outbox.get(id).onsuccess = event => {
        try {
          const entry = event.target.result;
          if (!entry || entry.userId !== userId) throw fail('INTENT_CHANGED', 'A intenção já mudou.');
          receipt = receiptEntity(entry.type, response); own(receipt.entity);
          if (entry.type === 'record.update' && receipt.entity.id !== entry.payload.recordId ||
            entry.type === 'goal.complete' && receipt.entity.id !== entry.payload.goalId ||
            entry.payload.vicio_id && receipt.entity.vicio_id !== entry.payload.vicio_id ||
            entry.type === 'relapse.create' && receipt.entity.vicio_id !== entry.payload.addictionId) throw fail('RECEIPT_INVALID', 'O recibo não corresponde à intenção.');
          const mapping = { key: id, entityId: receipt.entity.id, revision: receipt.entity.revision || 1 };
          tx.objectStore('receipts').put({ key: id, userId, type: entry.type, payloadVersion: 1, kind: 'confirmed', ...(['goal.create', 'goal.complete', 'relapse.create'].includes(entry.type) ? { intentPayload: clone(entry.payload) } : {}), response: { [receipt.key]: clone(receipt.entity) }, confirmedAt: new Date().toISOString() });
          tx.objectStore('mappings').put(mapping);
          outbox.getAll().onsuccess = queued => {
            try {
              for (const child of queued.target.result.filter(item => item.dependsOn === id)) {
                if (child.attempts) throw fail('DEPENDENCY_INVALID', 'Uma dependência já enviada precisa ser revisada.');
                outbox.put(bind(child, mapping));
              }
              outbox.delete(id); set(mapping);
            } catch (error) { abort(error); }
          };
          const collection = { registro: 'registros', meta: 'metas', vontade: 'vontades', recaida: 'recaidas' }[receipt.key];
          tx.objectStore('snapshots').get('bootstrap').onsuccess = snapshot => {
            const row = snapshot.target.result;
            if (!row) return;
            const rows = row.data[collection] || [];
            row.data[collection] = [...rows.filter(item => item.id !== receipt.entity.id), clone(receipt.entity)];
            row.staleAfterMutation = true;
            tx.objectStore('snapshots').put(row);
          };
          tx.objectStore('pages').getAll().onsuccess = pages => {
            for (const page of pages.target.result) {
              if (!Array.isArray(page.data[collection])) continue;
              page.data[collection] = page.data[collection].map(item => item.id === receipt.entity.id ? clone(receipt.entity) : item);
              page.staleAfterMutation = true;
              tx.objectStore('pages').put(page);
            }
          };
        } catch (error) { abort(error); }
      };
    });
  };
  const savePage = (kind, filters, data) => {
    const collection = kind === 'records' ? 'registros' : kind === 'urges' ? 'vontades' : null;
    if (!collection || !Array.isArray(data?.[collection])) return Promise.reject(fail('PAGE_INVALID', 'Página inválida.'));
    try { data[collection].forEach(own); } catch (error) { return Promise.reject(error); }
    const row = { key: kind + ':' + stable(filters), userId, kind, filters: clone(filters),
      data: { [collection]: clone(data[collection]), next_cursor: data.next_cursor ?? null, cobertura: data.cobertura, atualizado_em: data.atualizado_em },
      updatedAt: new Date().toISOString(), payloadVersion: 1 };
    return run(['pages'], 'readwrite', (tx, set) => { tx.objectStore('pages').put(row); set(row); });
  };
  const replaceRecordEdit = (id, payload) => run(['outbox', 'receipts'], 'readwrite', (tx, set, abort) => {
    const outbox = tx.objectStore('outbox');
    outbox.getAll().onsuccess = event => {
      try {
        const entries = event.target.result, prior = entries.find(item => item.id === id);
        if (prior?.type !== 'record.update' || prior.status !== 'recovery' || prior.lastError?.code !== 'REVISAO_CONFLITO' ||
            prior.payload.recordId !== payload.recordId || entries.some(item => item.dependsOn === id)) {
          throw fail('CONFLICT_CHANGED', 'A correção mudou. Reabra o registro antes de reaplicar.');
        }
        const nextId = crypto.randomUUID();
        const next = { ...prior, id: nextId, localId: 'local:' + nextId, payload: clone(payload), status: 'pending',
          attempts: 0, nextRetryAt: 0, lastError: null, createdAt: new Date().toISOString() };
        tx.objectStore('receipts').put({ key: id, userId, kind: 'replaced', intent: prior, replacedBy: nextId, replacedAt: next.createdAt });
        outbox.delete(id); outbox.add(next); set(next);
      } catch (error) { abort(error); }
    };
  });
  const discard = id => run(['outbox', 'receipts'], 'readwrite', (tx, set, abort) => {
    const outbox = tx.objectStore('outbox');
    outbox.getAll().onsuccess = event => {
      const entries = event.target.result, entry = entries.find(item => item.id === id);
      if (!entry) { set(false); return; }
      if (entry.status === 'sending' || entries.some(item => item.dependsOn === id)) { abort(fail('INTENT_BUSY', 'Resolva as correções dependentes ou aguarde o envio antes de descartar.')); return; }
      tx.objectStore('receipts').put({ key: id, userId, kind: 'discarded', intent: entry, discardedAt: new Date().toISOString() });
      outbox.delete(id); set(true);
    };
  });
  return {
    removeHabit: id => run(['snapshots', 'pages'], 'readwrite', tx => {
      for (const name of ['snapshots', 'pages']) {
        const rows = tx.objectStore(name);
        rows.getAll().onsuccess = event => {
          for (const row of event.target.result) {
            for (const collection of ['vicios', 'registros', 'metas', 'recaidas', 'vontades', 'conquistas']) {
              if (Array.isArray(row.data?.[collection])) row.data[collection] = row.data[collection].filter(item => collection === 'vicios' ? item.id !== id : item.vicio_id !== id);
            }
            rows.put(row);
          }
        };
      }
    }),
    removeGoal: id => run(['snapshots', 'pages'], 'readwrite', tx => {
      for (const name of ['snapshots', 'pages']) {
        const rows = tx.objectStore(name);
        rows.getAll().onsuccess = event => {
          for (const row of event.target.result) {
            if (Array.isArray(row.data?.metas)) {
              row.data.metas = row.data.metas.filter(goal => goal.id !== id);
              rows.put(row);
            }
          }
        };
      }
    }),
    getHabitDraft: async id => (await read('meta', 'habitDraft:' + id))?.value || null,
    saveHabitDraft: (id, value) => run(['meta'], 'readwrite', (tx, set) => {
      tx.objectStore('meta').put({ key: 'habitDraft:' + id, value: clone(value) });
      set(value);
    }),
    getUrgeDraft: async id => (await read('meta', 'urgeDraft:' + id))?.value || null,
    saveUrgeDraft: (id, value) => run(['meta'], 'readwrite', (tx, set) => {
      tx.objectStore('meta').put({ key: 'urgeDraft:' + id, value: clone(value) }); set(value);
    }),
    getRecordDraft: async id => (await read('meta', 'recordDraft:' + id))?.value || null,
    saveRecordDraft: (id, value) => run(['meta'], 'readwrite', (tx, set) => {
      tx.objectStore('meta').put({ key: 'recordDraft:' + id, value: clone(value) }); set(value);
    }),
    recoverUrgeDraft: (id, draft) => run(['outbox', 'receipts', 'meta'], 'readwrite', (tx, set, abort) => {
      const outbox = tx.objectStore('outbox');
      outbox.get(id).onsuccess = event => {
        try {
          const prior = event.target.result;
          if (!canRecoverUrge(prior)) throw fail('RECOVERY_CHANGED', 'A recusa mudou. Atualize a Sincronização.');
          tx.objectStore('meta').put({ key: 'urgeDraft:' + prior.payload.vicio_id, value: clone(draft) });
          tx.objectStore('receipts').put({ key: id, userId, type: prior.type, payloadVersion: 1, kind: 'replaced', intent: prior, replacedByDraft: draft.eventId, replacedAt: new Date().toISOString() });
          outbox.delete(id); set(prior.payload.vicio_id);
        } catch (error) { abort(error); }
      };
    }),
    userId, close, saveSnapshot, savePage, enqueue, acknowledge, discard, replaceRecordEdit,
    getSnapshot: () => read('snapshots', 'bootstrap'), getIdentity: () => read('meta', 'identity'),
    getPage: (kind, filters) => read('pages', kind + ':' + stable(filters)),
    getPages: () => all('pages'), getReceipt: id => read('receipts', id), getReceipts: () => all('receipts'),
    getMapping: id => read('mappings', id),
    getQueue: async () => (await all('outbox')).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)),
    markSending: id => changeEntry(id, item => ({ ...item, status: 'sending', attempts: item.attempts + 1, lastError: null })),
    markFailed: (id, error) => changeEntry(id, item => {
      const localPermanent = ['RECEIPT_INVALID', 'INTENT_INVALID', 'DEPENDENCY_INVALID', 'ACCOUNT_CHANGED', 'SESSAO_ALTERADA', 'STORAGE_VERSION_CHANGED'].includes(error.code);
      const retryable = !localPermanent && (!error.status || [408, 425, 429].includes(error.status) || error.status >= 500);
      return { ...item, status: retryable ? 'retry' : 'recovery', nextRetryAt: retryable ? Date.now() + Math.min(300000, 1000 * 2 ** Math.min(item.attempts, 8)) : 0,
        lastError: { code: error.code || 'NETWORK_UNCONFIRMED', status: error.status || null, outcomeUnknown: !!error.outcomeUnknown } };
    }),
    retry: id => changeEntry(id, item => {
      if (item.status === 'sending') throw fail('INTENT_BUSY', 'A intenção está em envio.');
      return { ...item, status: 'pending', nextRetryAt: 0 };
    }),
    recoverInterrupted: () => run(['outbox'], 'readwrite', tx => {
      const store = tx.objectStore('outbox');
      store.getAll().onsuccess = event => { for (const item of event.target.result) if (item.status === 'sending') store.put({ ...item, status: 'retry', nextRetryAt: 0, lastError: { code: 'INTERRUPTED', outcomeUnknown: true } }); };
    }),
    discardAll: () => run(['outbox', 'receipts'], 'readwrite', tx => {
      const outbox = tx.objectStore('outbox');
      outbox.getAll().onsuccess = event => {
        for (const intent of event.target.result) tx.objectStore('receipts').put({ key: intent.id, userId, kind: 'discarded', intent, discardedAt: new Date().toISOString() });
        outbox.clear();
      };
    }),
    clearAccount: ({ discardPending = false } = {}) => run(STORES, 'readwrite', (tx, _set, abort) => {
      tx.objectStore('outbox').getAll().onsuccess = event => {
        if (event.target.result.length && !discardPending) { abort(fail('PENDING_INTENTS', 'Há intenções pendentes. Sincronize ou escolha explicitamente descartá-las.')); return; }
        for (const name of STORES) tx.objectStore(name).clear();
      };
    })
  };
}
