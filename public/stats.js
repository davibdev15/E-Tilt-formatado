const h = ET.escape,
  $ = (s) => document.querySelector(s),
  tid = new URLSearchParams(location.search).get('id');
let C,
  ranking = [],
  sortKey,
  sortDirection = -1,
  searchTerm = '';
const n = (v, d = 1) =>
  Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const team = (id) =>
  C.teams.find((t) => t.id === id) || { id: null, name: 'A definir', tag: '?', color: '#8d7b9e' };
const mark = (t) => `<span class="team-mark" style="--team-color:${h(t.color)}">${h(t.tag)}</span>`;
const teamLink = (id) =>
  id
    ? `<a class="match-team" href="#team/${id}">${mark(team(id))}${h(team(id).name)}</a>`
    : `<span class="match-team">${mark(team(null))}A definir</span>`;
function empty(text) {
  return `<div class="result-empty">${h(text)}</div>`;
}
function playerLink(p) {
  return `<a class="player-cell" href="#player/${p.id}"><span class="player-monogram">${h(p.nick[0].toUpperCase())}</span><span><b>${h(p.nick)}</b><small>${h(team(p.team).tag)} · ${h(p.role)}</small></span></a>`;
}
function columns() {
  return C.lol
    ? [
        ['kda', 'KDA'],
        ['kills', 'K'],
        ['deaths', 'D'],
        ['assists', 'A'],
        ['csm', 'CS/min'],
        ['gold', 'Ouro'],
        ['damage', 'Dano'],
        ['kp', 'KP%'],
      ]
    : [
        ['acs', 'ACS'],
        ['kills', 'K'],
        ['deaths', 'D'],
        ['assists', 'A'],
        ['kd', 'K/D'],
        ['adr', 'ADR'],
        ['hs', 'HS%'],
        ['kast', 'KAST%'],
      ];
}
function value(p, key) {
  return (
    n(p[key], ['kills', 'deaths', 'assists', 'gold', 'damage', 'acs'].includes(key) ? 0 : 1) +
    (['hs', 'kast', 'kp'].includes(key) ? '%' : '')
  );
}
function aggregate(p, rr = C.records) {
  rr = rr.filter((r) => r.player === p.id);
  const total = (k) => rr.reduce((n, r) => n + r[k], 0),
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
  };
}
function statsTable(players, records, sortable = false) {
  const list = players
    .map((p) => aggregate(p, records))
    .sort(
      (a, b) =>
        (a[sortKey || (C.lol ? 'kda' : 'acs')] - b[sortKey || (C.lol ? 'kda' : 'acs')]) *
        sortDirection,
    );
  return `<div class="table-scroll"><table class="stats-table"><thead><tr><th>JOGADOR / TIME</th><th>MAPAS</th>${columns()
    .map(
      ([key, label]) =>
        `<th>${sortable ? `<button data-sort="${key}">${label} ↕</button>` : label}</th>`,
    )
    .join('')}</tr></thead><tbody>${list
    .map(
      (p) =>
        `<tr><td>${playerLink(p)}</td><td>${p.maps}</td>${columns()
          .map(([key]) => `<td>${value(p, key)}</td>`)
          .join('')}</tr>`,
    )
    .join('')}</tbody></table></div>`;
}
function glossary() {
  return `<p class="stat-glossary">K/D/A: abates, mortes e assistências totais. ${C.lol ? 'KDA = (K + A) / mortes (mínimo 1); CS/min = tropas / minutos; KP = participação nos abates. Ouro e dano são médias por jogo.' : 'ACS, headshots e KAST são médias dos mapas; ADR = dano total / rounds; K/D = abates / mortes (mínimo 1).'} Jogadores com zero mapas ainda não têm desempenho registrado.</p>`;
}
function matchRow(m) {
  return `<a class="match-list-row" href="#match/${m.id}"><span class="match-phase"><b>${h(m.phase)}</b>${m.status === 'completed' ? 'Encerrado' : 'Aguardando'}</span><span class="match-team">${mark(team(m.a))}${h(team(m.a).name)}</span><b class="series-score">${m.score.join(':')}</b><span class="match-team right">${h(team(m.b).name)}${mark(team(m.b))}</span><span class="match-link-arrow">↗</span></a>`;
}
function matchesScreen() {
  return `<section class="stat-panel"><div class="panel-heading"><h2>Confrontos</h2><span>${C.matches.length} séries</span></div>${C.matches.length ? C.matches.slice().reverse().map(matchRow).join('') : empty('O organizador ainda não gerou o chaveamento.')}</section>`;
}
function bracketScreen() {
  if (!C.matches.length)
    return empty('O chaveamento será exibido após a aprovação dos times e o início do campeonato.');
  const final = C.matches.find((m) => !m.next),
    rounds = [...new Set(C.matches.map((m) => m.round))].sort((a, b) => a - b);
  return `<section class="stat-panel">${final?.winner ? `<div class="champion-banner">${mark(team(final.winner))}<div><small>CAMPEÃ DO CAMPEONATO</small><h3>${h(team(final.winner).name)}</h3></div></div>` : ''}<div class="panel-heading"><h2>Eliminação simples · Melhor de 3</h2><span>Deslize para acompanhar as fases</span></div><div class="bracket-scroll"><div class="bracket" style="grid-template-columns:repeat(${rounds.length},minmax(210px,1fr));min-width:${rounds.length * 240}px">${rounds
    .map(
      (r) =>
        `<div class="bracket-round"><h3>${h(C.matches.find((m) => m.round === r).phase)}</h3><div class="round-matches">${C.matches
          .filter((m) => m.round === r)
          .sort((a, b) => a.position - b.position)
          .map(
            (m) =>
              `<a class="bracket-match" href="#match/${m.id}"><div class="round-meta">${m.status === 'completed' ? 'ENCERRADO' : 'AGUARDANDO'} ↗</div>${[m.a, m.b].map((id, i) => `<div class="bracket-team ${id && id === m.winner ? 'winner' : ''}">${mark(team(id))}<span>${h(team(id).name)}</span><b>${m.score[i]}</b></div>`).join('')}</a>`,
          )
          .join('')}</div></div>`,
    )
    .join('')}</div></div></section>`;
}
function rankingScreen() {
  return `<section class="stat-panel"><div class="panel-heading"><h2>Leaderboard · ${C.players.length} participantes</h2><input class="rank-search" id="rank-search" value="${h(searchTerm)}" placeholder="Buscar jogador ou time" aria-label="Buscar jogador ou time"></div><div id="rank-table">${rankTable()}</div>${glossary()}</section>`;
}
function rankTable() {
  const players = C.players.filter((p) =>
    (p.nick + ' ' + team(p.team).name).toLowerCase().includes(searchTerm.toLowerCase()),
  );
  return players.length
    ? statsTable(players, C.records, true)
    : empty('Nenhum participante encontrado.');
}
function matchScreen(id, index) {
  const m = C.matches.find((m) => m.id === id);
  if (!m) return empty('Confronto não encontrado.');
  const selected = m.maps.find((mp) => String(mp.index) === index),
    records = selected ? selected.records : m.maps.flatMap((mp) => mp.records);
  return `<a class="back-link" href="#matches">← Confrontos</a><div class="match-scoreboard"><div class="eyebrow subtle">${h(m.phase)} / MD3</div><div class="match-versus"><div class="score-team">${teamLink(m.a)}</div><div class="big-score">${m.score.join(' : ')}<span class="score-status">${m.status === 'completed' ? 'ENCERRADO' : 'AGUARDANDO RESULTADO'}</span></div><div class="score-team">${teamLink(m.b)}</div></div><p>${m.date ? ET.date(m.date) : 'Data do resultado a definir'}</p></div>${
    m.maps.length
      ? `<div class="map-tabs"><a class="outline" href="#match/${m.id}">Série completa</a>${m.maps.map((mp) => `<a class="outline" href="#match/${m.id}/${mp.index}">${h(mp.name)} · ${mp.score.join(':')}</a>`).join('')}</div><section class="stat-panel"><div class="panel-heading"><h2>${h(selected?.name || 'Estatísticas da série')}</h2><span>${C.lol ? 'Placar de mapas: abates' : 'Placar de mapas: rounds'}</span></div>${[
          m.a,
          m.b,
        ]
          .map(
            (tid) =>
              `<div class="table-team-heading">${teamLink(tid)}</div>${statsTable(
                C.players.filter((p) => p.team === tid),
                records,
              )}`,
          )
          .join('')}${glossary()}</section>`
      : empty('As estatísticas aparecerão quando o organizador registrar o resultado completo.')
  }`;
}
function playerScreen(id) {
  const p = C.players.find((p) => p.id === id);
  if (!p) return empty('Jogador não encontrado.');
  const a = aggregate(p),
    rr = C.records.filter((r) => r.player === id);
  return `<a class="back-link" href="#ranking">← Leaderboard</a><div class="profile-hero"><span class="player-monogram">${h(p.nick[0].toUpperCase())}</span><div><div class="eyebrow subtle">JOGADOR / ${h(p.role)}</div><h2>${h(p.nick)}</h2>${teamLink(p.team)}</div><div class="profile-tag">MAPAS<strong>${a.maps}</strong></div></div><div class="metric-grid">${(C.lol
    ? [
        ['KDA', a.kda],
        ['CS/min', a.csm],
        ['Dano médio', a.damage],
        ['Ouro médio', a.gold],
      ]
    : [
        ['K/D', a.kd],
        ['ACS', a.acs],
        ['ADR', a.adr],
        ['Headshots %', a.hs],
      ]
  )
    .map(
      ([label, v]) =>
        `<div class="metric-card"><span>${label}</span><strong>${n(v)}</strong></div>`,
    )
    .join(
      '',
    )}</div><section class="stat-panel"><div class="panel-heading"><h2>Histórico por mapa</h2><span>${a.kills} K / ${a.deaths} D / ${a.assists} A</span></div><div class="table-scroll"><table class="stats-table"><thead><tr><th>MAPA / ADVERSÁRIO</th><th>${C.lol ? 'CAMPEÃO' : 'AGENTE'}</th><th>K / D / A</th><th>${C.lol ? 'KDA' : 'ACS'}</th><th>RESULTADO</th></tr></thead><tbody>${rr
    .slice()
    .reverse()
    .map((r) => {
      const m = C.matches.find((m) => m.id === r.match),
        mp = m.maps.find((mp) => mp.index === r.map);
      return `<tr><td><a href="#match/${m.id}/${r.map}">${h(mp.name)} · vs ${h(team(m.a === p.team ? m.b : m.a).name)} ↗</a></td><td>${h(r.agent)}</td><td>${r.kills} / ${r.deaths} / ${r.assists}</td><td>${n(C.lol ? (r.kills + r.assists) / Math.max(1, r.deaths) : r.acs)}</td><td class="match-result ${r.win ? '' : 'loss'}">${r.win ? 'Vitória' : 'Derrota'}</td></tr>`;
    })
    .join(
      '',
    )}</tbody></table></div>${rr.length ? '' : empty('Nenhum mapa disputado ainda.')}${glossary()}</section>`;
}
function teamScreen(id) {
  const t = C.teams.find((t) => t.id === id);
  if (!t) return empty('Time não encontrado.');
  return `<a class="back-link" href="#standings">← Equipes</a><div class="profile-hero">${mark(t)}<h2>${h(t.name)}</h2></div><section class="stat-panel"><div class="panel-heading"><h2>Elenco inscrito</h2></div><div class="team-roster">${C.players
    .filter((p) => p.team === id)
    .map((p) => `<div class="roster-player">${playerLink(p)}</div>`)
    .join('')}</div></section><section class="stat-panel profile-history">${C.matches
    .filter((m) => m.a === id || m.b === id)
    .map(matchRow)
    .join('')}</section>`;
}
function standingsScreen() {
  const final = C.matches.find((m) => !m.next),
    done = final?.status === 'completed';
  const rows = C.teams
    .map((t) => {
      const mm = C.matches.filter(
          (m) => m.status === 'completed' && (m.a === t.id || m.b === t.id),
        ),
        wins = mm.filter((m) => m.winner === t.id).length,
        loss = mm.find((m) => m.winner !== t.id);
      return {
        ...t,
        played: mm.length,
        wins,
        losses: mm.length - wins,
        place: done
          ? t.id === final.winner
            ? '1'
            : t.id === final.a || t.id === final.b
              ? '2'
              : loss
                ? `${2 ** (Math.max(...C.matches.map((m) => m.round)) - loss.round) + 1}–${2 ** (Math.max(...C.matches.map((m) => m.round)) - loss.round + 1)}`
                : '—'
          : '—',
      };
    })
    .sort((a, b) => b.wins - a.wins);
  return `<section class="stat-panel"><div class="panel-heading"><h2>${done ? 'Classificação final' : 'Campanha das equipes'}</h2><span>${done ? 'Posições compartilhadas por fase' : 'Colocações definidas ao encerrar'}</span></div><div class="table-scroll"><table class="stats-table"><thead><tr><th>TIME</th><th>POSIÇÃO</th><th>SÉRIES</th><th>V</th><th>D</th></tr></thead><tbody>${rows.map((t) => `<tr><td>${teamLink(t.id)}</td><td>${t.place}</td><td>${t.played}</td><td>${t.wins}</td><td>${t.losses}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function render() {
  if (!C) return;
  const [screen = 'matches', id, index] = location.hash.replace(/^#/, '').split('/');
  document
    .querySelectorAll('.stats-tabs a')
    .forEach((a) => a.classList.toggle('active', a.hash === '#' + screen));
  const screens = {
    matches: matchesScreen,
    bracket: bracketScreen,
    ranking: rankingScreen,
    standings: standingsScreen,
    match: () => matchScreen(id, index),
    player: () => playerScreen(id),
    team: () => teamScreen(id),
  };
  $('#stats-content').innerHTML = (screens[screen] || matchesScreen)();
}
async function load() {
  C = await ET.api('tournaments/' + tid + '/stats');
  ranking = await ET.api('tournaments/' + tid + '/leaderboard');
  $('#competition-summary').innerHTML =
    `<div class="competition-emblem">${C.lol ? 'L' : 'V'}</div><div><h2>${h(C.title)}</h2><p>${C.lol ? 'League of Legends' : 'Valorant'} · ${C.teams.length} equipes · ${C.players.length} jogadores</p></div><div class="summary-facts"><div><span>STATUS</span><b>${{ registration: 'Inscrições', ongoing: 'Em andamento', completed: 'Encerrado' }[C.status]}</b></div><div><span>PREMIAÇÃO</span><b>${ET.money(C.prize * 100)}</b></div></div>`;
  render();
}
ET.init()
  .then(load)
  .catch((e) => {
    $('#stats-content').textContent = 'Não foi possível carregar as estatísticas.';
    ET.error(e);
  });
$('#refresh').onclick = (e) => ET.run(e.target, load);
window.addEventListener('hashchange', render);
$('#stats-content').addEventListener('input', (e) => {
  if (e.target.id === 'rank-search') {
    searchTerm = e.target.value;
    $('#rank-table').innerHTML = rankTable();
  }
});
$('#stats-content').onclick = (e) => {
  const b = e.target.closest('[data-sort]');
  if (b) {
    sortDirection = sortKey === b.dataset.sort ? -sortDirection : -1;
    sortKey = b.dataset.sort;
    $('#rank-table').innerHTML = rankTable();
  }
};
