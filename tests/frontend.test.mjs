import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
test('telas: chave vazia, confronto pendente, perfil sem mapas e nomes escapados', async () => {
  const elements = new Map(),
    element = (s) => {
      if (!elements.has(s)) elements.set(s, { innerHTML: '', value: '', addEventListener() {} });
      return elements.get(s);
    };
  const context = vm.createContext({
    document: { querySelector: element, querySelectorAll: () => [] },
    window: { addEventListener() {} },
    location: { hash: '#bracket', search: '?id=t' },
    URLSearchParams,
    ET: {
      escape: (s) =>
        String(s ?? '')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;'),
      init: () => ({ then: () => ({ catch() {} }) }),
      money: (n) => String(n),
      date: () => '',
      run() {},
      error() {},
    },
    console,
  });
  await vm.runInContext(
    await readFile(new URL('../public/stats.js', import.meta.url), 'utf8'),
    context,
  );
  context.fixture = {
    id: 't',
    title: 'Copa',
    lol: false,
    game: 'valorant',
    status: 'ongoing',
    teams: [{ id: 'a', name: '<script>bad</script>', tag: 'AA', color: '#aabbcc' }],
    players: [{ id: 'p', team: 'a', nick: '<img>', role: 'Duelista' }],
    records: [],
    matches: [],
  };
  vm.runInContext('C=fixture;render()', context);
  assert.ok(element('#stats-content').innerHTML.includes('chaveamento'));
  for (const screen of ['matches', 'ranking', 'standings', 'player/p', 'team/a']) {
    context.location.hash = '#' + screen;
    vm.runInContext('render()', context);
    assert.ok(!element('#stats-content').innerHTML.includes('NaN'));
    assert.ok(!element('#stats-content').innerHTML.includes('<script>bad'));
    assert.ok(!element('#stats-content').innerHTML.includes('<img>'));
  }
  context.fixture.matches = [
    {
      id: 'm',
      a: 'a',
      b: null,
      winner: null,
      next: null,
      score: [0, 0],
      round: 1,
      position: 1,
      phase: 'Final',
      maps: [],
      status: 'scheduled',
    },
  ];
  context.location.hash = '#match/m';
  vm.runInContext('render()', context);
  assert.ok(element('#stats-content').innerHTML.includes('A definir'));
  assert.ok(element('#stats-content').innerHTML.includes('AGUARDANDO RESULTADO'));
});
