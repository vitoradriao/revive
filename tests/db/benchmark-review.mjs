import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import request from 'supertest';

export async function verifyReviewBenchmark(app, db) {
  const sessions = [];
  try {
    for (let i = 0; i < 20; i++) {
      const response = await request(app).post('/api/v2/auth/cadastro').send({
        nome: 'Synthetic benchmark', email: `review-${randomUUID()}@example.invalid`, senha: 'Synthetic!123'
      });
      assert.equal(response.status, 201);
      const session = { user: response.body.usuario.id, token: response.body.access_token };
      sessions.push(session);
      const habit = await db.query(
        "insert into public.vicios (usuario_id,nome_vicio,data_inicio) values ($1,'Synthetic benchmark','2020-01-01') returning id", [session.user]
      );
      session.habit = habit.rows[0].id;
      await db.query(
        "insert into public.registros_diarios (vicio_id,data_registro,humor) select $1,date '2020-01-01'+n,'bem' from generate_series(0,999) n", [session.habit]
      );
    }
    const durations = [];
    const page = async ({ token, habit }, measure) => {
      const start = performance.now();
      const response = await request(app).get('/api/v2/registros').query({ vicio_id: habit, limit: 100 })
        .set('Authorization', 'Bearer ' + token);
      if (measure) durations.push(performance.now() - start);
      assert.equal(response.status, 200);
      assert.equal(response.body.registros.length, 100);
      assert.ok(response.body.next_cursor);
      assert.ok(response.body.registros.every(record => record.vicio_id === habit));
    };
    await Promise.all(sessions.map(session => page(session, false)));
    for (let i = 0; i < 5; i++) await Promise.all(sessions.map(session => page(session, true)));
    durations.sort((a,b) => a-b);
    const pct = p => +durations[Math.ceil(durations.length*p)-1].toFixed(1);
    console.log('REVIVE_PERFORMANCE ' + JSON.stringify({sessions:20, recordsPerAccount:1000, pageSize:100, samples:durations.length, p50_ms:pct(.50), p95_ms:pct(.95), errors:0, environment:'isolated CI Express/PostgreSQL via loopback'}));
    const first = sessions[0], key = randomUUID(), date = '2026-09-07';
    const submit = () => request(app).post('/api/v2/registros')
      .set('Authorization', 'Bearer ' + first.token).set('Idempotency-Key', key)
      .send({ vicio_id: first.habit, data_registro: date, humor:'bem' });
    const initial = await submit();
    assert.equal(initial.status, 201);
    for (let i=0;i<100;i++) {
      const replay = await submit();
      assert.equal(replay.status, 201);
      assert.equal(replay.body.registro.id, initial.body.registro.id);
    }
    const result = await db.query('select count(*) as total from public.registros_diarios where vicio_id=$1 and data_registro=$2', [first.habit,date]);
    assert.equal(Number(result.rows[0].total),1);
    console.log('REVIVE_IDEMPOTENCY initial=1 repeats=100 confirmed_rows=1');
  } finally {
    await db.query('delete from public.usuarios where id=any($1::uuid[])',[sessions.map(session=>session.user)]);
  }
}
