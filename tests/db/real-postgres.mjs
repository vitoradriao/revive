import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import pg from 'pg';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { verifyPasswordRecovery } from './password-recovery.mjs';
import { verifyDiaryRecords } from './diary-records.mjs';
import { verifyHabitEdits } from './habit-edit.mjs';
import { verifyGoalsRelapses } from './goals-relapses.mjs';
import { verifyWebSessions } from './web-sessions.mjs';

const require = createRequire(import.meta.url);
const jwtSecret = 'revive-ci-only-jwt-secret-at-least-32-characters';
const databaseUrl = process.env.REVIVE_TEST_DATABASE_URL || 'postgres://postgres:revive_ci_only@127.0.0.1:55432/revive_fixture';
const postgrestUrl = new URL(process.env.REVIVE_TEST_POSTGREST_URL || 'http://127.0.0.1:55433');

function bodyAt(response, status, label) {
  if (response.status !== status) {
    throw new Error(`${label}: expected HTTP ${status}, received ${response.status} (${response.body?.codigo || response.body?.erro || 'unknown'})`);
  }
  return response.body;
}

async function startProxy() {
  const server = http.createServer((incoming, outgoing) => {
    const path = incoming.url.replace(/^\/rest\/v1(?=\/|\?|$)/, '');
    const target = new URL(path || '/', postgrestUrl);
    const upstream = http.request(target, {
      method: incoming.method,
      headers: { ...incoming.headers, host: postgrestUrl.host },
    }, response => {
      outgoing.writeHead(response.statusCode, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => { outgoing.writeHead(502); outgoing.end(); });
    incoming.pipe(upstream);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function verifyConnections(a, b) {
  assert.notEqual(a.processID, b.processID);
  await a.query('begin');
  try {
    await a.query('select pg_advisory_xact_lock(120006)');
    const blocked = await b.query('select pg_try_advisory_xact_lock(120006) as acquired');
    assert.equal(blocked.rows[0].acquired, false);
  } finally {
    await a.query('rollback');
  }
  const released = await b.query('select pg_try_advisory_xact_lock(120006) as acquired');
  assert.equal(released.rows[0].acquired, true);
  await b.query('select pg_advisory_unlock(120006)');

  const id = randomUUID();
  await a.query('begin');
  try {
    await a.query('insert into public.usuarios (id, nome, email, senha_hash) values ($1,$2,$3,$4)',
      [id, 'Synthetic transaction', `${id}@example.invalid`, 'synthetic-hash']);
    assert.equal((await b.query('select id from public.usuarios where id=$1', [id])).rowCount, 0);
    await a.query('commit');
  } catch (error) {
    await a.query('rollback');
    throw error;
  }
  assert.equal((await b.query('select id from public.usuarios where id=$1', [id])).rowCount, 1);
  await b.query('delete from public.usuarios where id=$1', [id]);
}

async function verifyApi(app, sql, second) {
  await verifyWebSessions(app, sql, process.env.JWT_SECRET, second);
  await verifyHabitEdits(app, sql, process.env.JWT_SECRET);
  await verifyDiaryRecords(app, sql, process.env.JWT_SECRET);
  const suffix = randomUUID();
  const password = 'Senha!12345';
  const users = [];
  for (const label of ['a', 'b', 'c']) {
    const email = `ci-${label}-${suffix}@example.invalid`;
    const registered = await request(app).post('/api/auth/cadastro')
      .send({ nome: `Synthetic ${label}`, email, senha: password });
    const body = bodyAt(registered, 201, `register ${label}`);
    users.push({ id: body.usuario.id, email, legacyToken: body.token });
  }
  const [a, b, c] = users;
  for (const user of users) {
    const login = await request(app).post('/api/v2/auth/login').send({ email: user.email, senha: password });
    const session = bodyAt(login, 200, 'mobile login');
    user.mobileToken = session.access_token;
    user.refreshToken = session.refresh_token;
    assert.ok(user.mobileToken);
  }

  const habit = await request(app).post('/api/vicios')
    .set('Authorization', `Bearer ${a.legacyToken}`)
    .send({ nome_vicio: 'Synthetic habit', data_inicio: '2026-09-01T00:00:00Z' });
  const habitId = bodyAt(habit, 201, 'create habit').vicio.id;

  const dayMs = 86_400_000;
  const progressHabitId = randomUUID();
  const progressStartedAt = new Date(Date.now() - 33 * dayMs).toISOString();
  await sql.query(`insert into public.vicios
    (id, usuario_id, nome_vicio, data_inicio, valor_economizado_por_dia)
    values ($1,$2,'Synthetic progress', $3, 12.50)`, [progressHabitId, a.id, progressStartedAt]);
  const beforeReset = bodyAt(await request(app).get('/api/v2/bootstrap')
    .set('Authorization', `Bearer ${a.mobileToken}`), 200, 'progress before reset');
  assert.equal(beforeReset.vicios.find(item => item.id === progressHabitId).progresso.sequencia_atual_dias, 33);
  const firstResetAt = new Date(Date.now() - 2 * dayMs - 3_000);
  const resetAtPayload = { occurred_at: firstResetAt.toISOString(), motivo: 'synthetic reset', resetarContador: true };
  bodyAt(await request(app).post(`/api/v2/vicios/${progressHabitId}/recaida`)
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', randomUUID()).send(resetAtPayload),
  201, 'first explicit reset');
  bodyAt(await request(app).post(`/api/v2/vicios/${progressHabitId}/recaida`)
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', randomUUID())
    .send({ ...resetAtPayload, occurred_at: new Date(firstResetAt.getTime() + 1_000).toISOString() }),
  201, 'second reset on same day');
  const nonResetAt = new Date().toISOString();
  bodyAt(await request(app).post(`/api/v2/vicios/${progressHabitId}/recaida`)
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', randomUUID())
    .send({ occurred_at: nonResetAt, motivo: 'synthetic reflection', resetarContador: false }),
  201, 'reflection without a reset');
  const afterReset = bodyAt(await request(app).get('/api/v2/bootstrap')
    .set('Authorization', `Bearer ${a.mobileToken}`), 200, 'progress after reset');
  const resetProgress = afterReset.vicios.find(item => item.id === progressHabitId).progresso;
  assert.equal(resetProgress.sequencia_atual_dias, 2);
  assert.ok(resetProgress.recorde_dias >= 30);
  assert.ok(resetProgress.marcos.some(award => award.categoria === 'streak' && award.valor_alvo === 30),
    'a persisted 30-day milestone survives later resets');
  assert.ok(afterReset.conquistas.some(award => award.vicio_id === null
    && award.categoria === 'streak' && Number(award.valor_alvo) === 30),
  'the account-level permanent milestone is returned by v2');
  const progressRows = await sql.query(`select started_at, ended_at from public.progresso_periodos
    where vicio_id=$1 order by started_at, id`, [progressHabitId]);
  assert.equal(progressRows.rowCount, 3, 'the non-reset reflection does not create a period');
  for (let index = 0; index < progressRows.rows.length - 1; index += 1) {
    assert.equal(new Date(progressRows.rows[index].ended_at).toISOString(),
      new Date(progressRows.rows[index + 1].started_at).toISOString(), 'periods meet without overlap or gaps');
  }

  const retroHabitId = randomUUID();
  await sql.query(`insert into public.vicios
    (id, usuario_id, nome_vicio, data_inicio, valor_economizado_por_dia)
    values ($1,$2,'Synthetic retroactive progress', $3, 0)`,
  [retroHabitId, a.id, new Date(Date.now() - 50 * dayMs).toISOString()]);
  for (const daysAgo of [20, 35]) {
    bodyAt(await request(app).post(`/api/v2/vicios/${retroHabitId}/recaida`)
      .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', randomUUID())
      .send({ occurred_at: new Date(Date.now() - daysAgo * dayMs).toISOString(), resetarContador: true }),
    201, `retroactive reset at ${daysAgo} days`);
  }
  const retroSnapshot = bodyAt(await request(app).get('/api/v2/bootstrap')
    .set('Authorization', `Bearer ${a.mobileToken}`), 200, 'retroactive progress');
  const retroProgress = retroSnapshot.vicios.find(item => item.id === retroHabitId).progresso;
  assert.equal(retroProgress.sequencia_atual_dias, 20);
  assert.equal(retroProgress.recorde_dias, 20);
  const retroRows = await sql.query(`select started_at, ended_at from public.progresso_periodos
    where vicio_id=$1 order by started_at, id`, [retroHabitId]);
  assert.equal(retroRows.rowCount, 3);
  for (let index = 0; index < retroRows.rows.length - 1; index += 1) {
    assert.equal(new Date(retroRows.rows[index].ended_at).toISOString(),
      new Date(retroRows.rows[index + 1].started_at).toISOString(), 'retroactive events rebuild stable non-overlapping periods');
  }

  bodyAt(await request(app).get(`/api/vicios/${habitId}`)
    .set('Authorization', `Bearer ${a.legacyToken}`), 200, 'owner reads habit');
  bodyAt(await request(app).get(`/api/vicios/${habitId}`)
    .set('Authorization', `Bearer ${b.legacyToken}`), 404, 'other user cannot read habit');

  const bootstrap = bodyAt(await request(app).get('/api/v2/bootstrap')
    .set('Authorization', `Bearer ${b.mobileToken}`), 200, 'other user bootstrap');
  assert.equal(bootstrap.vicios.length, 0);

  const rotation = await Promise.all([1, 2].map(() => request(app).post('/api/v2/auth/refresh')
    .send({ refresh_token: c.refreshToken })));
  assert.deepEqual(rotation.map(result => result.status).sort(), [200, 401]);
  const activeFamily = await sql.query(`select count(*) from public.app_sessions
    where usuario_id=$1 and revoked_at is null`, [c.id]);
  assert.equal(Number(activeFamily.rows[0].count), 0,
    'concurrent reuse is detected and revokes the rotated family');
  bodyAt(await request(app).get('/api/v2/bootstrap')
    .set('Authorization', `Bearer ${c.mobileToken}`), 401, 'rotated family access token revoked');

  const logoutSession = bodyAt(await request(app).post('/api/v2/auth/login')
    .send({ email: c.email, senha: password }), 200, 'second mobile login');
  bodyAt(await request(app).post('/api/v2/auth/logout')
    .set('Authorization', `Bearer ${logoutSession.access_token}`), 204, 'mobile logout');
  bodyAt(await request(app).get('/api/v2/bootstrap')
    .set('Authorization', `Bearer ${logoutSession.access_token}`), 401, 'logged out access token revoked');

  const passwordSession = bodyAt(await request(app).post('/api/v2/auth/login')
    .send({ email: c.email, senha: password }), 200, 'password-change mobile login');
  await sql.query('update public.usuarios set senha_hash=$2 where id=$1', [c.id, 'synthetic-replaced-password-hash']);
  bodyAt(await request(app).get('/api/v2/bootstrap')
    .set('Authorization', `Bearer ${passwordSession.access_token}`), 401, 'password change revokes access token');

  bodyAt(await request(app).post('/api/v2/registros')
    .set('Authorization', `Bearer ${b.mobileToken}`)
    .set('Idempotency-Key', randomUUID())
    .send({ vicio_id: habitId, data_registro: '2026-09-01' }), 404, 'foreign record denied');
  const recordKey = randomUUID();
  const recordPayload = { vicio_id: habitId, data_registro: '2026-09-01', humor: 'synthetic' };
  const concurrentRecords = await Promise.all(Array.from({ length: 5 }, () => request(app).post('/api/v2/registros')
    .set('Authorization', `Bearer ${a.mobileToken}`)
    .set('Idempotency-Key', recordKey)
    .send(recordPayload)));
  for (const response of concurrentRecords) bodyAt(response, 201, 'concurrent idempotent record');
  assert.equal(new Set(concurrentRecords.map(response => response.body.registro.id)).size, 1,
    'concurrent retries return the first committed record');
  const reorderedReplay = await request(app).post('/api/v2/registros')
    .set('Authorization', `Bearer ${a.mobileToken}`)
    .set('Idempotency-Key', recordKey)
    .send({ humor: 'synthetic', data_registro: '2026-09-01', vicio_id: habitId });
  bodyAt(reorderedReplay, 201, 'stable-hash replay');
  assert.equal(reorderedReplay.body.registro.id, concurrentRecords[0].body.registro.id);
  const contentConflict = await request(app).post('/api/v2/registros')
    .set('Authorization', `Bearer ${a.mobileToken}`)
    .set('Idempotency-Key', recordKey)
    .send({ ...recordPayload, humor: 'different' });
  bodyAt(contentConflict, 409, 'idempotency content conflict');
  assert.equal(contentConflict.body.codigo, 'IDEMPOTENCY_CONFLITO');
  const receipt = await sql.query('select expires_at::text from public.api_idempotency where usuario_id=$1 and idempotency_key=$2', [a.id, recordKey]);
  assert.equal(receipt.rows[0].expires_at.startsWith('infinity'), true, 'receipt is not allowed to expire while queued events may replay');

  await sql.query(`create function public.test_fail_mobile_record_insert() returns trigger language plpgsql as $$
    begin
      if new.observacoes = 'synthetic-trigger-failure' then raise exception 'synthetic transaction failure'; end if;
      return new;
    end $$`);
  await sql.query(`create trigger test_fail_mobile_record_insert after insert on public.registros_diarios
    for each row execute function public.test_fail_mobile_record_insert()`);
  const rollbackKey = randomUUID();
  const rollbackPayload = { vicio_id: habitId, data_registro: '2026-09-03', observacoes: 'synthetic-trigger-failure' };
  const failedWrite = await request(app).post('/api/v2/registros')
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', rollbackKey).send(rollbackPayload);
  bodyAt(failedWrite, 500, 'injected failure after idempotency reservation');
  const rolledBack = await sql.query(`select
    (select count(*) from public.registros_diarios where vicio_id=$1 and data_registro='2026-09-03') as records,
    (select count(*) from public.api_idempotency where usuario_id=$2 and idempotency_key=$3) as receipts`, [habitId, a.id, rollbackKey]);
  assert.equal(Number(rolledBack.rows[0].records), 0, 'business write must roll back');
  assert.equal(Number(rolledBack.rows[0].receipts), 0, 'idempotency reservation must roll back with business write');
  await sql.query('drop trigger test_fail_mobile_record_insert on public.registros_diarios');
  await sql.query('drop function public.test_fail_mobile_record_insert()');
  bodyAt(await request(app).post('/api/v2/registros')
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', rollbackKey).send(rollbackPayload), 201,
  'retry after complete rollback');

  const goalKey = randomUUID();
  const goalPayload = { vicio_id: habitId, descricao_meta: 'Synthetic goal', dias_objetivo: 7 };
  const goal = bodyAt(await request(app).post('/api/v2/metas')
    .set('Authorization', `Bearer ${a.mobileToken}`)
    .set('Idempotency-Key', goalKey).send(goalPayload), 201, 'goal');
  const goalReplay = bodyAt(await request(app).post('/api/v2/metas')
    .set('Authorization', `Bearer ${a.mobileToken}`)
    .set('Idempotency-Key', goalKey).send(goalPayload), 201, 'goal replay');
  assert.equal(goalReplay.meta.id, goal.meta.id, 'goal replay returns the first goal');
  const completionKey = randomUUID();
  const completions = await Promise.all(Array.from({ length: 2 }, () => request(app).patch(`/api/v2/metas/${goal.meta.id}`)
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', completionKey).send({ concluida: true })));
  for (const response of completions) bodyAt(response, 200, 'idempotent goal completion');
  assert.equal(completions[0].body.meta.id, completions[1].body.meta.id);
  const relapseKey = randomUUID();
  const relapsePayload = { occurred_at: '2026-09-02T00:00:00Z', motivo: 'synthetic', resetarContador: false };
  const relapse = bodyAt(await request(app).post(`/api/v2/vicios/${habitId}/recaida`)
    .set('Authorization', `Bearer ${a.mobileToken}`)
    .set('Idempotency-Key', relapseKey).send(relapsePayload), 201, 'relapse');
  const relapseReplay = bodyAt(await request(app).post(`/api/v2/vicios/${habitId}/recaida`)
    .set('Authorization', `Bearer ${a.mobileToken}`)
    .set('Idempotency-Key', relapseKey).send(relapsePayload), 201, 'relapse replay');
  assert.equal(relapseReplay.recaida.id, relapse.recaida.id, 'relapse replay returns the first event');

  const localDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const urgeTime = new Date(Date.now() - 60_000).toISOString();
  const urgeKey = randomUUID();
  const urgePayload = {
    vicio_id: habitId, occurred_at: urgeTime, timezone: 'America/Sao_Paulo',
    intensidade: 4, gatilhos: ['estresse', 'trigger_future_1'], nota: 'synthetic urge note',
  };
  const concurrentUrges = await Promise.all(Array.from({ length: 5 }, () => request(app).post('/api/v2/vontades')
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', urgeKey).send(urgePayload)));
  for (const response of concurrentUrges) bodyAt(response, 201, 'concurrent idempotent urge');
  assert.equal(new Set(concurrentUrges.map(response => response.body.vontade.id)).size, 1,
    'concurrent urge retries return one event');
  const urgeReplay = bodyAt(await request(app).post('/api/v2/vontades')
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', urgeKey)
    .send({ gatilhos: urgePayload.gatilhos, intensidade: urgePayload.intensidade, timezone: urgePayload.timezone,
      occurred_at: urgePayload.occurred_at, vicio_id: urgePayload.vicio_id, nota: urgePayload.nota }),
  201, 'reordered urge replay');
  assert.equal(urgeReplay.vontade.id, concurrentUrges[0].body.vontade.id);
  const urgeConflict = await request(app).post('/api/v2/vontades')
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', urgeKey)
    .send({ ...urgePayload, intensidade: 5 });
  bodyAt(urgeConflict, 409, 'urge key payload conflict');

  const secondUrge = bodyAt(await request(app).post('/api/v2/vontades')
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', randomUUID())
    .send({ ...urgePayload, gatilhos: ['trigger_future_1'], nota: null }),
  201, 'distinct event in the same minute');
  assert.notEqual(secondUrge.vontade.id, urgeReplay.vontade.id);
  assert.deepEqual(urgeReplay.vontade.gatilhos, ['estresse', 'trigger_future_1'],
    'unknown stable codes are retained for forward compatibility');

  const foreignUrge = await request(app).post('/api/v2/vontades')
    .set('Authorization', `Bearer ${b.mobileToken}`).set('Idempotency-Key', randomUUID()).send(urgePayload);
  bodyAt(foreignUrge, 404, 'foreign urge habit denied');
  const invalidUrge = await request(app).post('/api/v2/vontades')
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', randomUUID())
    .send({ ...urgePayload, intensidade: 11 });
  bodyAt(invalidUrge, 422, 'invalid urge intensity');
  const missingIntensity = await first.query(`select * from public.execute_mobile_urge_mutation(
    $1, $2, 'synthetic-hash', 'synthetic-legacy-hash', 'urge.create', $3::jsonb, 'synthetic-request')`,
  [a.id, randomUUID(), JSON.stringify({
    vicio_id: habitId, occurred_at: urgeTime, timezone: 'America/Sao_Paulo', gatilhos: [],
  })]);
  assert.equal(missingIntensity.rows[0].status_code, 422,
    'database validates a missing numeric field without leaking a constraint error');
  const futureUrge = await request(app).post('/api/v2/vontades')
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', randomUUID())
    .send({ ...urgePayload, occurred_at: new Date(Date.now() + 10 * 60_000).toISOString() });
  bodyAt(futureUrge, 422, 'future urge rejected');

  const urgeQuery = `/api/v2/vontades?vicio_id=${habitId}&inicio=${localDay}&fim=${localDay}`
    + '&timezone=America%2FSao_Paulo&limit=1';
  const urgePageOne = bodyAt(await request(app).get(urgeQuery)
    .set('Authorization', `Bearer ${a.mobileToken}`), 200, 'urge page one');
  assert.equal(urgePageOne.cobertura.total, 2);
  assert.equal(urgePageOne.cobertura.tem_mais, true);
  assert.equal(urgePageOne.vontades.length, 1);
  const urgePageTwo = bodyAt(await request(app).get(`${urgeQuery}&cursor=${encodeURIComponent(urgePageOne.next_cursor)}`)
    .set('Authorization', `Bearer ${a.mobileToken}`), 200, 'urge page two');
  assert.equal(urgePageTwo.cobertura.total, 2);
  assert.equal(urgePageTwo.vontades.length, 1);
  assert.notEqual(urgePageOne.vontades[0].id, urgePageTwo.vontades[0].id,
    'timestamp ties use id as a stable keyset cursor');
  const emptyUrgePage = bodyAt(await request(app).get(`${urgeQuery.replace(`inicio=${localDay}&fim=${localDay}`, 'inicio=2020-01-01&fim=2020-01-01')}`)
    .set('Authorization', `Bearer ${a.mobileToken}`), 200, 'empty urge page');
  assert.deepEqual(emptyUrgePage.vontades, []);
  assert.equal(emptyUrgePage.cobertura.total, 0);
  const foreignUrgePage = await request(app).get(urgeQuery).set('Authorization', `Bearer ${b.mobileToken}`);
  bodyAt(foreignUrgePage, 404, 'foreign urge query denied');
  const urgeRows = await sql.query('select count(*)::integer as count from public.eventos_vontade where usuario_id=$1 and vicio_id=$2', [a.id, habitId]);
  assert.equal(urgeRows.rows[0].count, 2, 'urge events do not create or reset relapses');
  const habitAfterUrges = await sql.query('select data_ultima_recaida from public.vicios where id=$1', [habitId]);
  assert.equal(habitAfterUrges.rows[0].data_ultima_recaida, null,
    'recording a desire does not reset the abstinence counter');

  const urgeBaseline = bodyAt(await request(app).get('/api/v2/bootstrap')
    .set('Authorization', `Bearer ${a.mobileToken}`), 200, 'urge baseline');
  const urgeHabit = urgeBaseline.vicios.find(row => row.id === habitId);
  const archiveUrgeHabit = bodyAt(await request(app).patch(`/api/v2/vicios/${habitId}`)
    .set('Authorization', `Bearer ${a.mobileToken}`).send({ revision: urgeHabit.revision, ativo: false }), 200, 'archive urge habit');
  const blockedKey = randomUUID();
  const retryArchivedUrge = () => request(app).post('/api/v2/vontades')
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', blockedKey).send({ ...urgePayload, intensidade: 0 });
  assert.equal(bodyAt(await retryArchivedUrge(), 404, 'archive blocks urge creation').codigo, 'VICIO_NAO_ENCONTRADO');
  const archivedUrges = bodyAt(await request(app).get(urgeQuery)
    .set('Authorization', `Bearer ${a.mobileToken}`), 200, 'archived urge history');
  assert.equal(archivedUrges.cobertura.total, 2);
  bodyAt(await request(app).patch(`/api/v2/vicios/${habitId}`)
    .set('Authorization', `Bearer ${a.mobileToken}`).send({ revision: archiveUrgeHabit.vicio.revision, ativo: true }), 200, 'reactivate urge habit');
  assert.equal(bodyAt(await retryArchivedUrge(), 404, 'replay keeps the definitive archived rejection').codigo, 'VICIO_NAO_ENCONTRADO');
  assert.equal(bodyAt(await request(app).post('/api/v2/vontades')
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', randomUUID())
    .send({ ...urgePayload, intensidade: 0 }), 201, 'explicit zero urge after reactivation').vontade.intensidade, 0);
  assert.equal(bodyAt(await request(app).post('/api/v2/vontades')
    .set('Authorization', `Bearer ${a.mobileToken}`).set('Idempotency-Key', randomUUID())
    .send({ ...urgePayload, intensidade: 10 }), 201, 'maximum urge intensity').vontade.intensidade, 10);
  const urgeAfter = bodyAt(await request(app).get('/api/v2/bootstrap')
    .set('Authorization', `Bearer ${a.mobileToken}`), 200, 'urge unchanged progress');
  assert.equal(urgeAfter.vicios.find(row => row.id === habitId).progresso.sequencia_atual_dias,
    urgeHabit.progresso.sequencia_atual_dias, 'urge creation does not change the streak');
  assert.equal(urgeAfter.recaidas.length, urgeBaseline.recaidas.length, 'urge creation does not create relapses');
  console.log('Urges: tied pages, ownership, archive history/block/stable rejection, intensity 0/10 and unchanged streak passed.');

  const webBeforeDelete = await request(app).post('/api/v2/web-auth/login')
    .set('Host', 'web.example.invalid').set('Origin', 'http://web.example.invalid')
    .send({ email: a.email, senha: password });
  bodyAt(webBeforeDelete, 200, 'web login before account deletion');
  const deletedAccount = await request(app).delete('/api/v2/account')
    .set('Authorization', `Bearer ${webBeforeDelete.body.access_token}`);
  bodyAt(deletedAccount, 204, 'web account deletion');
  assert.equal(deletedAccount.text, '');
  assert.ok(deletedAccount.headers['set-cookie'][0].includes('Expires=Thu, 01 Jan 1970'));
  assert.equal((await request(app).get('/api/v2/bootstrap').set('Authorization', `Bearer ${a.mobileToken}`)).status, 401);
  assert.equal((await request(app).post('/api/v2/web-auth/refresh')
    .set('Host', 'web.example.invalid').set('Origin', 'http://web.example.invalid')
    .set('Cookie', webBeforeDelete.headers['set-cookie'][0].split(';')[0]).send({})).status, 401);
  assert.equal((await request(app).get('/api/v2/bootstrap').set('Authorization', `Bearer ${b.mobileToken}`)).status, 200);

  const gone = await sql.query(`select
    (select count(*) from public.usuarios where id=$1) as users,
    (select count(*) from public.vicios where usuario_id=$1) as habits,
    (select count(*) from public.registros_diarios where vicio_id=$2) as records,
    (select count(*) from public.historico_recaidas where vicio_id=$2) as relapses,
    (select count(*) from public.metas where usuario_id=$1) as goals,
    (select count(*) from public.app_sessions where usuario_id=$1) as sessions,
    (select count(*) from public.api_idempotency where usuario_id=$1) as idempotency,
    (select count(*) from public.progresso_ancoras where vicio_id = any($3::uuid[])) as progress_anchors,
    (select count(*) from public.progresso_periodos where vicio_id = any($3::uuid[])) as progress_periods,
    (select count(*) from public.segmentos_economia where vicio_id = any($3::uuid[])) as economy_segments,
    (select count(*) from public.conquistas_permanentes where usuario_id=$1) as permanent_awards,
    (select count(*) from public.eventos_vontade where usuario_id=$1) as urge_events`,
  [a.id, habitId, [habitId, progressHabitId, retroHabitId]]);
  for (const [table, count] of Object.entries(gone.rows[0])) {
    assert.equal(Number(count), 0, `${table} must be removed`);
  }
  assert.equal(Number((await sql.query('select count(*) from public.usuarios where id=$1', [b.id])).rows[0].count), 1);
  await sql.query('delete from public.usuarios where id=$1', [b.id]);
  await sql.query('delete from public.usuarios where id=$1', [c.id]);
}

async function verifyPublicRoles(proxyUrl) {
  for (const role of ['anon', 'authenticated']) {
    const token = jwt.sign({ role }, jwtSecret, { algorithm: 'HS256', expiresIn: '5m' });
    const response = await fetch(`${proxyUrl}/rest/v1/usuarios?select=id`, {
      headers: { Authorization: `Bearer ${token}`, apikey: token },
    });
    assert.ok([401, 403, 404].includes(response.status), `${role} must not read private users`);
  }
}

const proxy = await startProxy();
const first = new pg.Client({ connectionString: databaseUrl });
const second = new pg.Client({ connectionString: databaseUrl });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(postgrestUrl);
      ready = true;
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  assert.equal(ready, true, 'PostgREST must start');
  await Promise.all([first.connect(), second.connect()]);
  await verifyConnections(first, second);
  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_URL = proxy.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = jwt.sign({ role: 'service_role' }, jwtSecret,
    { algorithm: 'HS256', expiresIn: '5m' });
  process.env.JWT_SECRET = 'revive-ci-only-app-jwt-secret';
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.PASSWORD_RECOVERY_ENABLED = 'true';
  process.env.WEB_AUTH_ENABLED = 'true';
  process.env.SMTP_PORT = '55434';
  process.env.RECOVERY_EMAIL_FROM = 'Revive CI <noreply@example.invalid>';
  const { app } = require('../../index.js');
  await verifyApi(app, first, second);
  await verifyGoalsRelapses(app, first, process.env.JWT_SECRET);
  await verifyPasswordRecovery(app, first, second);
  await verifyPublicRoles(proxy.url);
  console.log('Two SQL connections, API ownership, cascade and role denial passed.');
} finally {
  await Promise.allSettled([first.end(), second.end()]);
  await new Promise(resolve => proxy.server.close(resolve));
}
