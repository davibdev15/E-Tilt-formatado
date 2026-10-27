window.ET = {
  escape: (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    ),
  money: (n) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100),
  date: (s) =>
    s
      ? new Date(s).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : 'A definir',
  async init() {
    const r = await fetch('/api/config');
    const data = await r.json();
    if (!r.ok) throw Error(data.error);
    this.client = window.supabase.createClient(data.supabaseUrl, data.supabasePublishableKey);
    return this.client;
  },
  async api(path, method = 'GET', body) {
    const {
      data: { session },
    } = await this.client.auth.getSession();
    const r = await fetch('/api/' + path, {
      method,
      headers: {
        ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}),
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let result;
    try {
      result = await r.json();
    } catch {
      throw Error('Resposta inválida do servidor. Confira a implantação da API.');
    }
    if (!r.ok)
      throw Error(
        result.error +
          (result.fields
            ? ' ' + result.fields.map((x) => x.path + ': ' + x.message).join('; ')
            : ''),
      );
    return result;
  },
  error(error) {
    const box = document.querySelector('#message');
    if (box) {
      box.hidden = false;
      box.textContent = error.message;
      box.className = 'notice error';
      box.scrollIntoView({ block: 'nearest' });
    }
  },
  notice(text) {
    const box = document.querySelector('#message');
    if (box) {
      box.hidden = false;
      box.textContent = text;
      box.className = 'notice';
    }
  },
  async run(button, fn) {
    if (button) button.disabled = true;
    try {
      await fn();
    } catch (e) {
      this.error(e);
    } finally {
      if (button) button.disabled = false;
    }
  },
};
