import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/index.js';
import { tournamentSchema, teamSchema, resultSchema } from '../server/validation.js';
const cfg = () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
};
async function call(req, client) {
  const headers = {};
  let response;
  const res = {
    setHeader(k, v) {
      headers[k] = v;
    },
    status(code) {
      this.code = code;
      return this;
    },
    json(data) {
      response = { code: this.code, data, headers };
    },
  };
  await createHandler(client)(
    { url: '/api/tournaments', method: 'GET', headers: { host: 'example.test' }, ...req },
    res,
  );
  return response;
}
test('API: falha explícita se ambiente não configurado', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  const r = await call({ url: '/api/config' });
  assert.equal(r.code, 503);
  assert.ok(!JSON.stringify(r).includes('service_role'));
});
test('API: recusa chave secreta no endpoint de configuração', async () => {
  cfg();
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_secret_NEVER_PUBLISH';
  const r = await call({ url: '/api/config' });
  assert.equal(r.code, 503);
  assert.ok(!JSON.stringify(r).includes('NEVER_PUBLISH'));
});
test('API: leitura da configuração retorna apenas a chave pública', async () => {
  cfg();
  const r = await call({ url: '/api/config' });
  assert.equal(r.code, 200);
  assert.deepEqual(Object.keys(r.data).sort(), ['supabasePublishableKey', 'supabaseUrl']);
});
test('API: escrita exige login e origem correta', async () => {
  cfg();
  const r = await call(
    {
      method: 'POST',
      headers: { host: 'example.test', 'content-type': 'application/json' },
      body: {},
    },
    () => ({}),
  );
  assert.equal(r.code, 401);
  const cross = await call(
    {
      method: 'POST',
      headers: {
        host: 'example.test',
        origin: 'https://evil.test',
        'content-type': 'application/json',
      },
    },
    () => ({}),
  );
  assert.equal(cross.code, 403);
});
test('API: JWT é conferido pelo Auth antes de usar o banco', async () => {
  cfg();
  let checked = false;
  const r = await call(
    { headers: { host: 'example.test', authorization: 'Bearer invalid' } },
    () => ({
      auth: {
        async getUser(token) {
          checked = token === 'invalid';
          return { error: Error('bad token') };
        },
      },
    }),
  );
  assert.ok(checked);
  assert.equal(r.code, 401);
});
test('API: não aceita owner_id injetado na criação', async () => {
  cfg();
  const r = await call(
    {
      method: 'POST',
      headers: {
        host: 'example.test',
        authorization: 'Bearer valid',
        'content-type': 'application/json',
      },
      body: { owner_id: 'fake' },
    },
    () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }),
  );
  assert.equal(r.code, 400);
  assert.ok(r.data.fields.length);
});
test('API: negação do banco retorna 403 sem detalhes internos', async () => {
  cfg();
  const payload = {
    name: 'Copa teste',
    description: '',
    game: 'valorant',
    level: 'Amador',
    starts_at: '2030-12-01T12:00:00Z',
    registration_closes_at: '2030-11-01T12:00:00Z',
    max_teams: 8,
    prize_cents: 0,
    published: true,
  };
  const r = await call(
    {
      method: 'POST',
      headers: {
        host: 'example.test',
        authorization: 'Bearer valid',
        'content-type': 'application/json',
      },
      body: payload,
    },
    () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
      rpc: async () => ({ error: { code: '42501', message: 'sensitive database details' } }),
    }),
  );
  assert.equal(r.code, 403);
  assert.ok(!JSON.stringify(r).includes('sensitive database'));
});
test('validação: datas, roster repetido e números inválidos são recusados', () => {
  assert.equal(tournamentSchema.safeParse({}).success, false);
  assert.equal(
    teamSchema.safeParse({
      name: 'Time',
      tag: 'TM',
      game: 'valorant',
      color: '#aabbcc',
      players: Array.from({ length: 5 }, () => ({ nickname: 'igual', role: 'Duelista' })),
    }).success,
    false,
  );
  assert.equal(resultSchema.safeParse({ maps: [] }).success, false);
});
