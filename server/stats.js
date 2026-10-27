export function buildStatsBundle(tournament, teams, rosters, matches, maps, stats) {
  const game = tournament.game,
    lol = game === 'lol';
  const rs = stats.map((s) => {
    const map = maps.find((m) => m.id === s.map_id),
      match = matches.find((m) => m.id === map.match_id);
    const teamKills = stats
      .filter((x) => x.map_id === s.map_id && x.team_id === s.team_id)
      .reduce((n, x) => n + x.kills, 0);
    return {
      player: s.player_id,
      team: s.team_id,
      match: match.id,
      map: map.map_index,
      kills: s.kills,
      deaths: s.deaths,
      assists: s.assists,
      damage: s.damage,
      acs: Number(s.acs),
      hs: Number(s.headshot_pct),
      kast: map.rounds ? (s.kast_rounds / map.rounds) * 100 : 0,
      firstKills: s.first_kills,
      cs: s.cs,
      gold: s.gold,
      rounds: map.rounds,
      adr: map.rounds ? s.damage / map.rounds : 0,
      minutes: map.duration_seconds / 60,
      kp: teamKills ? ((s.kills + s.assists) / teamKills) * 100 : 0,
      agent: s.agent,
      win: map.winner_id === s.team_id,
    };
  });
  const maxRound = Math.max(0, ...matches.map((m) => m.round));
  return {
    id: tournament.id,
    title: tournament.name,
    game,
    lol,
    status: tournament.status,
    prize: tournament.prize_cents / 100,
    teams: teams.map((t) => ({ id: t.id, name: t.name, tag: t.tag, color: t.color })),
    players: rosters.map((p) => ({
      id: p.player_id,
      team: p.team_id,
      nick: p.nickname,
      role: p.role,
    })),
    matches: matches.map((m) => ({
      id: m.id,
      a: m.team_a,
      b: m.team_b,
      winner: m.winner_id,
      score: [m.score_a, m.score_b],
      status: m.status,
      round: m.round,
      position: m.position,
      next: m.next_match_id,
      phase: phaseName(maxRound - m.round),
      date: m.completed_at,
      maps: maps
        .filter((mp) => mp.match_id === m.id)
        .sort((a, b) => a.map_index - b.map_index)
        .map((mp) => ({
          id: mp.id,
          index: mp.map_index,
          name: mp.name,
          winner: mp.winner_id,
          score: [mp.score_a, mp.score_b],
          rounds: mp.rounds,
          duration_seconds: mp.duration_seconds,
          records: rs.filter((r) => r.match === m.id && r.map === mp.map_index),
        })),
    })),
    records: rs,
  };
}
export function phaseName(distance) {
  return (
    ['Grande final', 'Semifinal', 'Quartas de final', 'Oitavas de final', '16 avos de final'][
      distance
    ] || 'Eliminatórias'
  );
}
export function leaderboard(bundle) {
  return bundle.players
    .map((p) => {
      const rr = bundle.records.filter((r) => r.player === p.id),
        total = (k) => rr.reduce((n, r) => n + r[k], 0),
        mean = (k) => (rr.length ? total(k) / rr.length : 0);
      return {
        ...p,
        maps: rr.length,
        kills: total('kills'),
        deaths: total('deaths'),
        assists: total('assists'),
        kd: total('kills') / Math.max(1, total('deaths')),
        kda: (total('kills') + total('assists')) / Math.max(1, total('deaths')),
        acs: mean('acs'),
        hs: mean('hs'),
        kast: mean('kast'),
        adr: total('rounds') ? total('damage') / total('rounds') : 0,
        damage: mean('damage'),
        gold: mean('gold'),
        csm: total('minutes') ? total('cs') / total('minutes') : 0,
        kp: mean('kp'),
        wins: rr.filter((r) => r.win).length,
        firstKills: total('firstKills'),
      };
    })
    .sort((a, b) => (bundle.lol ? b.kda - a.kda : b.acs - a.acs));
}
