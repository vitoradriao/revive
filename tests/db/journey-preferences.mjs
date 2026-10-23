import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';

export async function verifyJourneyPreferences(app, sql, secret) {
  const users = [randomUUID(), randomUUID()], habits = [randomUUID(), randomUUID()], tokens = [];
  for (const [index, user] of users.entries()) {
    await sql.query("insert into public.usuarios(id,nome,email,senha_hash) values($1,'Synthetic preferences',$2,'synthetic')", [user, `${user}@example.invalid`]);
    const session = randomUUID();
    await sql.query("insert into public.app_sessions(id,usuario_id,refresh_token_hash,family_id,expires_at) values($1,$2,$3,$4,now()+interval '1 day')", [session, user, randomUUID(), randomUUID()]);
    tokens.push(jwt.sign({ id: user, sid: session, token_type: 'access' }, secret));
    await sql.query("insert into public.vicios(id,usuario_id,nome_vicio,data_inicio) values($1,$2,'Synthetic habit',current_date)", [habits[index], user]);
  }
  const send = (method, index, body) => request(app)[method]('/api/v2/preferences').set('Authorization', 'Bearer ' + tokens[index]).send(body);
  try {
    const defaults = await send('get', 0); assert.equal(defaults.status, 200); assert.equal(defaults.body.preferences.revision, 0);
    assert.equal((await sql.query('select * from public.journey_preferences where usuario_id=$1', [users[0]])).rowCount, 0);
    assert.equal((await send('patch', 0, { revision: 0, primary_habit_id: habits[1] })).status, 422);
    const first = await send('patch', 0, { revision: 0, primary_habit_id: habits[0], indicator_order: ['future_metric', 'accumulated_savings'], intro: { version: 2, state: 'dismissed' } });
    assert.equal(first.status, 200); assert.equal(first.body.preferences.revision, 1);
    assert.equal((await send('get', 1)).body.preferences.revision, 0);
    assert.equal((await send('get', 1)).body.preferences.intro.version, 0);
    const race = await Promise.all([
      send('patch', 0, { revision: 1, intro: { version: 3, state: 'completed' } }),
      send('patch', 0, { revision: 1, intro: { version: 3, state: 'dismissed' } }),
    ]);
    assert.deepEqual(race.map(row => row.status).sort(), [200, 409]);
    await sql.query('update public.vicios set ativo=false where id=$1', [habits[0]]);
    assert.equal((await send('get', 0)).body.preferences.primary_habit_id, habits[0]);
    assert.equal((await send('patch', 0, { revision: 2, primary_habit_id: habits[0] })).status, 422);
    const restore = await send('patch', 0, { revision: 2, primary_habit_id: null, indicator_order: defaults.body.preferences.indicator_order });
    assert.equal(restore.status, 200); assert.deepEqual(restore.body.preferences.indicator_order, defaults.body.preferences.indicator_order);
    await sql.query('update public.vicios set ativo=true where id=$1', [habits[0]]);
    assert.equal((await send('patch', 0, { revision: 3, primary_habit_id: habits[0] })).status, 200);
    await sql.query('delete from public.vicios where id=$1', [habits[0]]);
    const deleted = (await send('get', 0)).body.preferences;
    assert.equal(deleted.primary_habit_id, null); assert.equal(deleted.revision, 5);
    assert.equal((await send('patch', 0, { revision: 4, primary_habit_id: null })).status, 409);
    // O banco valida também chamadas diretas, sem depender da validação Express.
    for (const patch of [{ indicator_order: [] }, { indicator_order: ['a', 'a'] }, { intro: { version: 0, state: 'completed' } }, { intro: { x: 1, state: 'pending' } }]) {
      const result = await sql.query('select public.edit_journey_preferences($1,5,$2::jsonb) as value', [users[0], JSON.stringify(patch)]);
      assert.equal(result.rows[0].value.status, 422);
    }
    assert.equal((await send('patch', 1, { revision: 0, intro: { version: 1, state: 'completed' } })).status, 200);
    await sql.query('select public.delete_revive_account($1)', [users[0]]);
    assert.equal((await sql.query('select * from public.journey_preferences where usuario_id=$1', [users[0]])).rowCount, 0);
    assert.equal((await send('get', 1)).body.preferences.revision, 1);
  } finally { for (const user of users) await sql.query('select public.delete_revive_account($1)', [user]); }
  console.log('Journey preferences: defaults, ownership, future IDs, intro, concurrent revision, archive, restore and cascades passed.');
}
