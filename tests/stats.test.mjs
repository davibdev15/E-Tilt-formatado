import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatsBundle, leaderboard } from '../server/stats.js';
test('estatísticas: usa roster fixado e pondera ADR por rounds e farm por minutos', () => {
  const t = { id: 't', game: 'valorant', name: 'Copa', status: 'ongoing', prize_cents: 120000 };
  const maps = [
    {
      id: 'm1',
      match_id: 'match',
      map_index: 0,
      winner_id: 'a',
      rounds: 20,
      duration_seconds: 1200,
      score_a: 13,
      score_b: 7,
      name: 'Ascent',
    },
    {
      id: 'm2',
      match_id: 'match',
      map_index: 1,
      winner_id: 'b',
      rounds: 30,
      duration_seconds: 2400,
      score_a: 14,
      score_b: 16,
      name: 'Haven',
    },
  ];
  const stats = maps.map((m, i) => ({
    map_id: m.id,
    player_id: 'p',
    team_id: 'a',
    kills: 10,
    deaths: i ? 5 : 0,
    assists: 5,
    damage: i ? 6000 : 2000,
    acs: i ? 300 : 200,
    headshot_pct: 25,
    kast_rounds: 15,
    first_kills: 2,
    cs: 100,
    gold: 10000,
    agent: 'Jett',
  }));
  const bundle = buildStatsBundle(
    t,
    [{ id: 'a', name: 'Time', tag: 'TM', color: '#aabbcc' }],
    [{ player_id: 'p', team_id: 'a', nickname: 'Player', role: 'Duelista' }],
    [
      {
        id: 'match',
        team_a: 'a',
        team_b: 'b',
        round: 1,
        position: 1,
        score_a: 1,
        score_b: 1,
        status: 'completed',
      },
    ],
    maps,
    stats,
  );
  const p = leaderboard(bundle)[0];
  assert.equal(p.adr, 160);
  assert.equal(p.acs, 250);
  assert.equal(p.kda, 6);
  assert.equal(p.kd, 4);
  assert.equal(p.csm, 200 / 60);
  assert.equal(bundle.records[0].win, true);
  assert.equal(bundle.records[1].win, false);
  assert.equal(bundle.players[0].nick, 'Player');
});
test('estatísticas: zero partidas não produz NaN ou Infinity', () => {
  const b = { lol: false, players: [{ id: 'p' }], records: [] };
  const p = leaderboard(b)[0];
  assert.ok(
    Object.values(p)
      .filter((x) => typeof x === 'number')
      .every(Number.isFinite),
  );
  assert.equal(p.maps, 0);
});
