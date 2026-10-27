const h = ET.escape,
  $ = (s) => document.querySelector(s);
let me, managedId, managedBundle, editingMatch, editingTournament;
$('#roster-fields').innerHTML = Array.from(
  { length: 5 },
  (_, i) =>
    `<div class="roster-row"><label>Nickname ${i + 1}<input name="nickname${i}" minlength="2" maxlength="32" required></label><label>Função / posição<input name="role${i}" maxlength="40" required placeholder="Ex.: Duelista / Meio"></label></div>`,
).join('');
async function refreshDashboard() {
  const {
    data: { session },
  } = await ET.client.auth.getSession();
  $('#auth-box').hidden = !!session;
  $('#dashboard').hidden = !session;
  if (!session) return;
  me = await ET.api('me');
  $('#account-email').textContent = me.user.email;
  $('#my-tournaments').innerHTML = me.tournaments.length
    ? me.tournaments
        .map(
          (t) =>
            `<div class="owner-row"><b>${h(t.name)}</b><small>${h(t.game)} · ${h(t.status)} · ${t.published ? 'Publicado' : 'Rascunho privado'}</small><div class="row-actions"><button class="outline" data-manage="${t.id}">Gerenciar ↗</button><button class="outline" data-edit="${t.id}">Editar antes das inscrições</button><a href="stats.html?id=${t.id}" class="text-link">Estatísticas</a></div></div>`,
        )
        .join('')
    : '<p>Você ainda não criou campeonatos.</p>';
  $('#my-teams').innerHTML = me.teams.length
    ? me.teams
        .map(
          (t) =>
            `<div class="owner-row"><b>${h(t.name)} / ${h(t.tag)}</b><small>${h(t.game)} · ${t.players.map((p) => h(p.nickname)).join(', ')}</small></div>`,
        )
        .join('')
    : '<p>Cadastre seu primeiro time abaixo.</p>';
}
ET.init()
  .then(async () => {
    ET.client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        $('#recovery-box').hidden = false;
        $('#auth-box').hidden = true;
        $('#dashboard').hidden = true;
      }
    });
    await refreshDashboard();
  })
  .catch(ET.error);
$('#auth-form').onsubmit = (e) => {
  e.preventDefault();
  const action = e.submitter.value,
    data = Object.fromEntries(new FormData(e.target));
  ET.run(e.submitter, async () => {
    if (action === 'recover') {
      if (!e.target.elements.email.validity.valid) throw Error('Informe seu e-mail.');
      const { error } = await ET.client.auth.resetPasswordForEmail(data.email, {
        redirectTo: location.origin + '/painel.html',
      });
      if (error) throw error;
      ET.notice('Se houver uma conta com esse e-mail, você receberá o link de recuperação.');
      return;
    }
    if (action === 'signup') {
      const { data: result, error } = await ET.client.auth.signUp({
        email: data.email,
        password: data.password,
        options: { emailRedirectTo: location.origin + '/painel.html' },
      });
      if (error) throw error;
      ET.notice(result.session ? 'Conta criada.' : 'Confira seu e-mail para confirmar a conta.');
    } else {
      const { error } = await ET.client.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (error) throw error;
    }
    await refreshDashboard();
  });
};
$('#recovery-form').onsubmit = (e) => {
  e.preventDefault();
  ET.run(e.submitter, async () => {
    const { error } = await ET.client.auth.updateUser({
      password: new FormData(e.target).get('password'),
    });
    if (error) throw error;
    $('#recovery-box').hidden = true;
    ET.notice('Senha atualizada.');
    await refreshDashboard();
  });
};
$('#logout').onclick = (e) =>
  ET.run(e.target, async () => {
    const { error } = await ET.client.auth.signOut();
    if (error) throw error;
    $('#management').hidden = true;
    await refreshDashboard();
  });
$('#tournament-form').onsubmit = (e) => {
  e.preventDefault();
  ET.run(e.submitter, async () => {
    const f = new FormData(e.target),
      data = Object.fromEntries(f);
    data.starts_at = new Date(data.starts_at).toISOString();
    data.registration_closes_at = new Date(data.registration_closes_at).toISOString();
    data.prize_cents = Math.round(Number(data.prize) * 100);
    delete data.prize;
    data.max_teams = Number(data.max_teams);
    data.published = f.has('published');
    await ET.api(
      'tournaments' + (editingTournament ? '/' + editingTournament : ''),
      editingTournament ? 'PATCH' : 'POST',
      data,
    );
    editingTournament = null;
    e.target.reset();
    e.target.querySelector('button').textContent = 'Criar campeonato ↗';
    await refreshDashboard();
    ET.notice('Campeonato salvo.');
  });
};
$('#team-form').onsubmit = (e) => {
  e.preventDefault();
  ET.run(e.submitter, async () => {
    const f = new FormData(e.target),
      data = {
        name: f.get('name'),
        tag: f.get('tag'),
        game: f.get('game'),
        color: f.get('color'),
        players: Array.from({ length: 5 }, (_, i) => ({
          nickname: f.get('nickname' + i),
          role: f.get('role' + i),
        })),
      };
    await ET.api('teams', 'POST', data);
    e.target.reset();
    await refreshDashboard();
    ET.notice('Time criado. Você já pode solicitar inscrição pelo catálogo.');
  });
};
async function manage(id) {
  managedId = id;
  const t = me.tournaments.find((t) => t.id === id);
  managedBundle = await ET.api('tournaments/' + id + '/stats');
  const registrations = await ET.api('tournaments/' + id + '/registrations');
  $('#management').hidden = false;
  $('#management-title').textContent = t.name;
  $('#result-editor').hidden = true;
  $('#management-actions').innerHTML =
    `<a class="outline" href="campeonato.html?id=${id}">Ver página pública</a><a class="outline" href="stats.html?id=${id}#bracket">Ver chave</a>${t.status === 'registration' ? '<button class="primary" id="generate">Gerar chave e iniciar ↗</button>' : ''}`;
  $('#registrations').innerHTML = registrations.length
    ? registrations
        .map(
          (r) =>
            `<div class="owner-row"><b>${h(r.teams.name)}</b><small>${h(r.status)}</small>${t.status === 'registration' ? `<div class="row-actions"><button class="outline" data-review="${r.id}" data-status="approved">Aprovar</button><button class="outline" data-review="${r.id}" data-status="rejected">Rejeitar</button></div>` : ''}</div>`,
        )
        .join('')
    : '<p>Nenhuma solicitação.</p>';
  $('#managed-matches').innerHTML = managedBundle.matches.length
    ? managedBundle.matches
        .map(
          (m) =>
            `<div class="owner-row"><b>${h(m.phase)} / ${m.position}: ${h(managedBundle.teams.find((t) => t.id === m.a)?.name || 'A definir')} × ${h(managedBundle.teams.find((t) => t.id === m.b)?.name || 'A definir')}</b><small>${h(m.status)} · ${m.score.join(' : ')}</small>${m.status !== 'completed' && m.a && m.b ? `<button class="outline" data-result="${m.id}">Lançar resultado</button>` : ''}</div>`,
        )
        .join('')
    : '<p>O chaveamento aparecerá após aprovar 2, 4, 8, 16 ou 32 times e iniciar.</p>';
  $('#management').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#my-tournaments').onclick = (e) => {
  const b = e.target.closest('[data-manage]'),
    edit = e.target.closest('[data-edit]');
  if (b) ET.run(b, () => manage(b.dataset.manage));
  if (edit) editTournament(edit.dataset.edit);
};
function editTournament(id) {
  const t = me.tournaments.find((t) => t.id === id);
  if (t.status !== 'registration') {
    ET.notice('O campeonato já começou e está bloqueado para edição.');
    return;
  }
  editingTournament = id;
  const form = $('#tournament-form');
  for (const key of ['name', 'description', 'game', 'level', 'max_teams'])
    form.elements[key].value = t[key];
  for (const key of ['starts_at', 'registration_closes_at']) {
    const d = new Date(t[key]);
    form.elements[key].value = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }
  form.elements.prize.value = t.prize_cents / 100;
  form.elements.published.checked = t.published;
  form.querySelector('button').textContent = 'Salvar alterações ↗';
  form.scrollIntoView({ behavior: 'smooth' });
  ET.notice(
    'Editando ' +
      t.name +
      '. O banco só permite alterações antes da primeira inscrição. Recarregue a página para cancelar.',
  );
}
$('#management-actions').onclick = (e) => {
  if (e.target.id === 'generate')
    ET.run(e.target, async () => {
      await ET.api('tournaments/' + managedId + '/bracket', 'POST', {});
      await refreshDashboard();
      await manage(managedId);
      ET.notice('Chave gerada. As inscrições e elencos estão bloqueados para esta competição.');
    });
};
$('#registrations').onclick = (e) => {
  const b = e.target.closest('[data-review]');
  if (b)
    ET.run(b, async () => {
      await ET.api('registrations/' + b.dataset.review, 'PATCH', { status: b.dataset.status });
      await manage(managedId);
    });
};
$('#managed-matches').onclick = (e) => {
  const b = e.target.closest('[data-result]');
  if (b) editResult(b.dataset.result);
};
function editResult(id) {
  editingMatch = managedBundle.matches.find((m) => m.id === id);
  const m = editingMatch,
    lol = managedBundle.lol,
    teams = [m.a, m.b].map((id) => managedBundle.teams.find((t) => t.id === id)),
    players = managedBundle.players.filter((p) => p.team === m.a || p.team === m.b);
  $('#result-editor').hidden = false;
  $('#result-editor').innerHTML =
    `<h3>Resultado final · ${h(teams[0].name)} × ${h(teams[1].name)}</h3><p>Envie apenas a série completa. Após salvar, o resultado fica bloqueado e o vencedor avança automaticamente. Confira os dados antes de enviar.</p><form id="result-form">${Array.from(
      { length: 3 },
      (_, i) =>
        `<fieldset class="result-map" data-index="${i}"><legend>Mapa / jogo ${i + 1}</legend>${i === 2 ? '<label class="check-label"><input type="checkbox" id="third-map"> Houve terceiro mapa</label>' : ''}<div class="map-fields" ${i === 2 ? 'hidden' : ''}><div class="result-inputs"><label class="agent-field">Nome<input data-key="name" maxlength="50" ${i < 2 ? 'required' : ''} placeholder="${lol ? 'Jogo ' + (i + 1) : 'Ex.: Ascent'}"></label><label class="agent-field">Vencedor<select data-key="winner_id">${teams.map((t) => `<option value="${t.id}">${h(t.name)}</option>`).join('')}</select></label><label>${lol ? 'Abates' : 'Rounds'} ${h(teams[0].tag)}<input data-key="score_a" type="number" min="0" max="100" value="0"></label><label>${lol ? 'Abates' : 'Rounds'} ${h(teams[1].tag)}<input data-key="score_b" type="number" min="0" max="100" value="0"></label><label>Duração (segundos)<input data-key="duration_seconds" type="number" min="60" max="14400" value="1800"></label></div>${players
          .map(
            (p) =>
              `<div class="result-player" data-player="${p.id}" data-team="${p.team}"><b>${h(p.nick)} / ${h(teams.find((t) => t.id === p.team).tag)}</b><div class="result-inputs"><label class="agent-field">${lol ? 'Campeão' : 'Agente'}<input data-stat="agent" maxlength="40" placeholder="${lol ? 'Ahri' : 'Jett'}"></label>${[
                ['kills', 'Abates', 200],
                ['deaths', 'Mortes', 200],
                ['assists', 'Assistências', 300],
                ['damage', lol ? 'Dano a campeões' : 'Dano total', 1000000],
                ...(lol
                  ? [
                      ['cs', 'Farm (CS)', 2000],
                      ['gold', 'Ouro', 100000],
                    ]
                  : [
                      ['acs', 'ACS', 1500],
                      ['headshot_pct', 'Headshot %', 100],
                      ['kast_rounds', 'Rounds KAST', 200],
                      ['first_kills', 'Primeiros abates', 100],
                    ]),
              ]
                .map(
                  ([key, label, max]) =>
                    `<label>${label}<input data-stat="${key}" type="number" min="0" max="${max}" step="${['acs', 'headshot_pct'].includes(key) ? '0.01' : '1'}" value="0"></label>`,
                )
                .join('')}</div></div>`,
          )
          .join('')}</div></fieldset>`,
    ).join(
      '',
    )}<label class="check-label result-check"><input type="checkbox" required> Conferi placares e estatísticas. Entendo que o resultado ficará bloqueado.</label><button class="primary">Salvar resultado completo e avançar ↗</button></form>`;
  $('#third-map').onchange = (e) => {
    $('[data-index="2"] .map-fields').hidden = !e.target.checked;
  };
  $('#result-form').onsubmit = (e) => {
    e.preventDefault();
    ET.run(e.submitter, async () => {
      const maps = [...document.querySelectorAll('.result-map')]
        .filter((el) => el.dataset.index !== '2' || $('#third-map').checked)
        .map((el) => {
          const get = (key) => el.querySelector('[data-key="' + key + '"]').value;
          const score_a = Number(get('score_a')),
            score_b = Number(get('score_b'));
          return {
            name: get('name'),
            winner_id: get('winner_id'),
            score_a,
            score_b,
            rounds: lol ? 0 : score_a + score_b,
            duration_seconds: Number(get('duration_seconds')),
            players: [...el.querySelectorAll('[data-player]')].map((p) => {
              const data = { player_id: p.dataset.player, team_id: p.dataset.team };
              for (const input of p.querySelectorAll('[data-stat]'))
                data[input.dataset.stat] =
                  input.dataset.stat === 'agent' ? input.value : Number(input.value);
              return data;
            }),
          };
        });
      await ET.api('matches/' + m.id + '/result', 'POST', { maps });
      await refreshDashboard();
      await manage(managedId);
      ET.notice('Resultado salvo. O vencedor avançou na chave.');
    });
  };
  $('#result-editor').scrollIntoView({ behavior: 'smooth' });
}
