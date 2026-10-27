const h = ET.escape;
let tournaments = [],
  favorites = [];
function renderCatalog() {
  const term = document.querySelector('#search').value.toLowerCase(),
    game = document.querySelector('#game').value,
    scope = document.querySelector('#scope').value;
  const list = tournaments.filter(
    (t) =>
      (game === 'all' || t.game === game) &&
      t.name.toLowerCase().includes(term) &&
      (scope !== 'favorites' || favorites.includes(t.id)),
  );
  document.querySelector('#catalog').innerHTML = list.length
    ? list
        .map(
          (t) =>
            `<article class="catalog-card"><div class="catalog-game">${t.game === 'valorant' ? 'VALORANT' : 'LEAGUE OF LEGENDS'} / ${h(t.level)}</div><h2>${h(t.name)}</h2><span class="badge">${{ registration: 'Inscrições', ongoing: 'Em andamento', completed: 'Encerrado' }[t.status]}${t.status === 'registration' && Date.parse(t.registration_closes_at) <= Date.now() ? ' encerradas' : ''}</span><p>${h(t.description.slice(0, 160))}</p><div class="live-details"><div><span>Início · Brasília</span><b>${ET.date(t.starts_at)}</b></div><div><span>Premiação</span><b>${ET.money(t.prize_cents)}</b></div><div><span>Limite de equipes</span><b>${t.max_teams}</b></div></div><div class="row-actions"><a class="primary" href="campeonato.html?id=${t.id}">Ver campeonato ↗</a><button class="outline" data-favorite="${t.id}">${favorites.includes(t.id) ? '♥ Salvo' : '♡ Salvar'}</button></div></article>`,
        )
        .join('')
    : '<div class="empty-state full-width">Nenhum campeonato encontrado. Organizadores podem publicar pelo painel.</div>';
}
ET.init()
  .then(async () => {
    tournaments = await ET.api('tournaments');
    const {
      data: { session },
    } = await ET.client.auth.getSession();
    if (session) favorites = (await ET.api('favorites')).map((f) => f.tournament_id);
    renderCatalog();
  })
  .catch((e) => {
    document.querySelector('#catalog').textContent = 'Catálogo indisponível.';
    ET.error(e);
  });
for (const id of ['search', 'game', 'scope'])
  document
    .querySelector('#' + id)
    .addEventListener(id === 'search' ? 'input' : 'change', renderCatalog);
document.querySelector('#catalog').onclick = (e) => {
  const button = e.target.closest('[data-favorite]');
  if (button)
    ET.run(button, async () => {
      const id = button.dataset.favorite,
        removing = favorites.includes(id);
      await ET.api('favorites/' + id, removing ? 'DELETE' : 'POST', {});
      favorites = removing ? favorites.filter((x) => x !== id) : [...favorites, id];
      renderCatalog();
    });
};
