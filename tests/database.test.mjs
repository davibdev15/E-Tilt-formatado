import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const owner = '00000000-0000-4000-8000-000000000001',
  captain = '00000000-0000-4000-8000-000000000002',
  outsider = '00000000-0000-4000-8000-000000000003';
test('PostgreSQL: migração, permissões, inscrições, transações e avanço da chave', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users values('${owner}'),('${captain}'),('${outsider}');`,
    );
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202610270001_initial.sql', import.meta.url),
        'utf8',
      ),
    );
    const as = async (id, role = 'authenticated') => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
      await db.exec('set role ' + role);
    };
    const rpc = async (name, args) => {
      const params = args.map((_, i) => '$' + (i + 1)).join(',');
      return (await db.query(`select public.${name}(${params}) as result`, args)).rows[0].result;
    };
    await as(owner);
    const tid = await rpc('save_tournament', [
      JSON.stringify({
        name: 'Copa de teste',
        description: '',
        game: 'valorant',
        level: 'Amador',
        starts_at: '2030-11-01T12:00:00Z',
        registration_closes_at: '2030-10-30T12:00:00Z',
        max_teams: 4,
        prize_cents: 100000,
        published: true,
      }),
    ]);
    const draft = await rpc('save_tournament', [
      JSON.stringify({
        name: 'Rascunho privado',
        game: 'lol',
        level: 'Amador',
        starts_at: '2030-11-01T12:00:00Z',
        registration_closes_at: '2030-10-30T12:00:00Z',
        max_teams: 2,
        prize_cents: 0,
        published: false,
      }),
    ]);
    await as(null, 'anon');
    assert.equal(
      (await db.query('select * from public.tournaments where id=$1', [draft])).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query('insert into public.teams(name,tag,game,captain_id) values($1,$2,$3,$4)', [
          'Hack',
          'HK',
          'valorant',
          owner,
        ]),
      /permission denied/,
    );
    await assert.rejects(() => rpc('generate_bracket', [tid]), /permission denied/);
    await as(outsider);
    await assert.rejects(() => rpc('generate_bracket', [tid]), /not_organizer/);
    const teams = [];
    await as(captain);
    for (let n = 0; n < 4; n++)
      teams.push(
        await rpc('create_team', [
          JSON.stringify({
            name: 'Time ' + n,
            tag: 'T' + n,
            game: 'valorant',
            color: '#aabbcc',
            players: Array.from({ length: 5 }, (_, i) => ({
              nickname: 'p' + n + i,
              role: 'Duelista',
            })),
          }),
        ]),
      );
    const rid = [];
    for (const t of teams) rid.push(await rpc('register_team', [tid, t]));
    await as(null, 'anon');
    assert.equal(
      (await db.query('select * from public.tournament_rosters')).rows.length,
      0,
      'elencos pendentes não aparecem no público',
    );
    await as(captain);
    await assert.rejects(() => rpc('register_team', [tid, teams[0]]));
    await as(outsider);
    await assert.rejects(() => rpc('register_team', [tid, teams[0]]), /not_team_captain/);
    await assert.rejects(() => rpc('review_registration', [rid[0], 'approved']), /not_organizer/);
    await as(owner);
    await assert.rejects(() => rpc('generate_bracket', [tid]), /review_pending/);
    for (const r of rid) await rpc('review_registration', [r, 'approved']);
    await rpc('generate_bracket', [tid]);
    assert.equal(
      (await db.query('select * from public.matches where tournament_id=$1', [tid])).rows.length,
      3,
    );
    const matches = (
      await db.query(
        'select * from public.matches where tournament_id=$1 order by round,position',
        [tid],
      )
    ).rows;
    await assert.rejects(() => rpc('generate_bracket', [tid]), /bracket_already_started/);
    const makeMaps = async (m) => {
      const roster = (
        await db.query(
          'select * from public.tournament_rosters where tournament_id=$1 and team_id=any($2::uuid[])',
          [tid, [m.team_a, m.team_b]],
        )
      ).rows;
      return [0, 1].map((index) => ({
        name: ['Ascent', 'Haven'][index],
        winner_id: m.team_a,
        score_a: 13,
        score_b: 8,
        rounds: 21,
        duration_seconds: 1800,
        players: roster.map((p) => ({
          team_id: p.team_id,
          player_id: p.player_id,
          agent: 'Jett',
          kills: 10,
          deaths: 10,
          assists: 4,
          damage: 2200,
          acs: 190,
          headshot_pct: 25,
          kast_rounds: 16,
          first_kills: 1,
          cs: 0,
          gold: 0,
        })),
      }));
    };
    const good = await makeMaps(matches[0]),
      bad = structuredClone(good);
    bad[1].players[0].kills = 30;
    await assert.rejects(
      () => rpc('submit_match_result', [matches[0].id, JSON.stringify(bad)]),
      /kills_deaths_mismatch/,
    );
    assert.equal(
      (await db.query('select count(*)::int as n from public.match_maps')).rows[0].n,
      0,
      'falha desfaz todos os mapas',
    );
    await as(outsider);
    await assert.rejects(
      () => rpc('submit_match_result', [matches[0].id, JSON.stringify(good)]),
      /not_organizer/,
    );
    await as(owner);
    await rpc('submit_match_result', [matches[0].id, JSON.stringify(good)]);
    await assert.rejects(
      () => rpc('submit_match_result', [matches[0].id, JSON.stringify(good)]),
      /result_already_recorded/,
    );
    await rpc('submit_match_result', [matches[1].id, JSON.stringify(await makeMaps(matches[1]))]);
    const final = (
      await db.query('select * from public.matches where tournament_id=$1 and round=2', [tid])
    ).rows[0];
    assert.equal(final.team_a, matches[0].team_a);
    assert.equal(final.team_b, matches[1].team_a);
    await rpc('submit_match_result', [final.id, JSON.stringify(await makeMaps(final))]);
    assert.equal(
      (await db.query('select status from public.tournaments where id=$1', [tid])).rows[0].status,
      'completed',
    );
    await db.query('insert into public.favorites values($1,$2,now())', [owner, tid]);
    await as(outsider);
    assert.equal((await db.query('select * from public.favorites')).rows.length, 0);
    await assert.rejects(
      () =>
        db.query('insert into public.favorites(user_id,tournament_id) values($1,$2)', [owner, tid]),
      /row-level security/,
    );
    await as(null, 'anon');
    assert.equal((await db.query('select * from public.player_map_stats')).rows.length, 60);
    await as(owner);
    const capacity = await rpc('save_tournament', [
      JSON.stringify({
        name: 'Copa de capacidade',
        game: 'valorant',
        level: 'Amador',
        starts_at: '2030-11-01T12:00:00Z',
        registration_closes_at: '2030-10-30T12:00:00Z',
        max_teams: 2,
        prize_cents: 0,
        published: true,
      }),
    ]);
    await as(captain);
    const c1 = await rpc('register_team', [capacity, teams[0]]),
      c2 = await rpc('register_team', [capacity, teams[1]]);
    await as(owner);
    await rpc('review_registration', [c2, 'rejected']);
    await as(captain);
    const c3 = await rpc('register_team', [capacity, teams[2]]);
    await as(owner);
    await rpc('review_registration', [c1, 'approved']);
    await rpc('review_registration', [c3, 'approved']);
    await assert.rejects(() => rpc('review_registration', [c2, 'approved']), /tournament_full/);
    const lt = await rpc('save_tournament', [
      JSON.stringify({
        name: 'Copa LoL',
        game: 'lol',
        level: 'Amador',
        starts_at: '2030-11-01T12:00:00Z',
        registration_closes_at: '2030-10-30T12:00:00Z',
        max_teams: 2,
        prize_cents: 0,
        published: true,
      }),
    ]);
    await as(captain);
    for (let n = 0; n < 2; n++) {
      const team = await rpc('create_team', [
        JSON.stringify({
          name: 'Rift ' + n,
          tag: 'R' + n,
          game: 'lol',
          color: '#aabbcc',
          players: Array.from({ length: 5 }, (_, i) => ({ nickname: 'lol' + n + i, role: 'Meio' })),
        }),
      ]);
      const reg = await rpc('register_team', [lt, team]);
      await as(owner);
      await rpc('review_registration', [reg, 'approved']);
      await as(captain);
    }
    await as(owner);
    await rpc('generate_bracket', [lt]);
    const lm = (await db.query('select * from public.matches where tournament_id=$1', [lt]))
        .rows[0],
      lr = (await db.query('select * from public.tournament_rosters where tournament_id=$1', [lt]))
        .rows;
    const lolMaps = [0, 1].map((i) => ({
      name: 'Jogo ' + (i + 1),
      winner_id: lm.team_a,
      score_a: 10,
      score_b: 10,
      rounds: 0,
      duration_seconds: 1800,
      players: lr.map((p) => ({
        team_id: p.team_id,
        player_id: p.player_id,
        agent: 'Ahri',
        kills: 2,
        deaths: 3,
        assists: 2,
        damage: 20000,
        cs: 200,
        gold: 12000,
      })),
    }));
    const invalid = structuredClone(lolMaps);
    invalid[0].score_a = 99;
    await assert.rejects(
      () => rpc('submit_match_result', [lm.id, JSON.stringify(invalid)]),
      /invalid_lol_totals/,
    );
    await rpc('submit_match_result', [lm.id, JSON.stringify(lolMaps)]);
    assert.equal(
      (await db.query('select status from public.tournaments where id=$1', [lt])).rows[0].status,
      'completed',
    );
  } finally {
    await db.close();
  }
});
