/* Users tab — look up an account, give or remove Pro-for-AI access, send a push message. */
(() => {
  'use strict';
  const App = window.AdminApp;
  const { api, attempt, toast, icon, esc, when, ago, askConfirm, openModal, closeModal } = App;

  const S = { query: '', results: null, searching: false, grants: [], health: null };

  // ── Push dialog (also used by the Settings tab for "send to everyone") ────
  App.pushDialog = async function pushDialog({ audience, userId, email, title = '', body = '', url = '' }) {
    const everyone = audience === 'all';
    openModal('<h3 id="push-t">' + icon('send', 'lg') + (everyone ? ' Message everyone' : ' Message ' + esc(email)) + '</h3>' +
      '<form id="push-form" class="stack">' +
      '<p class="muted small" id="push-audience">' + icon('loader', 'spin') + ' Checking devices…</p>' +
      '<label class="field"><span>Title <em class="muted">(max 60)</em></span><input name="title" type="text" maxlength="60" value="' + esc(title) + '" required></label>' +
      '<label class="field"><span>Message <em class="muted">(max 200)</em></span><textarea name="body" rows="3" maxlength="200" required>' + esc(body) + '</textarea></label>' +
      '<label class="field"><span>Link <em class="muted">(optional, https only)</em></span><input name="url" type="text" value="' + esc(url) + '" placeholder="https://"></label>' +
      (everyone ? '<label class="field"><span>Type <strong>SEND</strong> to confirm a message to everyone</span><input name="confirm" type="text" autocomplete="off" spellcheck="false"></label>' : '') +
      '<div class="actions"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn primary" type="submit" id="push-go" disabled>' + icon('send') + 'Send</button></div></form>', 'push-t');
    const form = document.getElementById('push-form');
    const go = document.getElementById('push-go');
    let devices = 0;
    const prev = await attempt(() => api('push_preview', { audience, user_id: userId }));
    const note = document.getElementById('push-audience');
    if (!prev) { closeModal(); return; }
    devices = prev.devices;
    note.innerHTML = devices
      ? icon('info') + ' This will go to <strong>' + devices + ' device' + (devices === 1 ? '' : 's') + '</strong> (each on its own Apple environment — development builds via sandbox, TestFlight/App Store via production).'
      : icon('alert') + ' No devices are registered for push' + (everyone ? '' : ' for this account') + '.';
    if (!prev.configured) note.innerHTML += '<br>' + icon('alert') + ' Push is not configured on the server.';
    const refresh = () => { go.disabled = !devices || !prev.configured || (everyone && form.confirm.value.trim() !== 'SEND'); };
    form.addEventListener('input', refresh); refresh();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      go.disabled = true; go.innerHTML = icon('loader', 'spin') + 'Sending…';
      const r = await attempt(() => api('push_send', { audience, user_id: userId, title: form.title.value, body: form.body.value, url: form.url.value || null, confirm: everyone ? form.confirm.value.trim() : undefined }));
      if (!r) { go.innerHTML = icon('send') + 'Send'; refresh(); return; }
      closeModal();
      toast('Sent — ' + r.accepted + ' accepted' + (r.failed ? ', ' + r.failed + ' failed' : '') + (r.removed_dead ? ', ' + r.removed_dead + ' dead device(s) cleaned up' : ''));
    });
  };

  // ── Data ──────────────────────────────────────────────────────────────────
  async function loadGrants() { S.grants = (await api('pro_list')).grants; }
  async function loadHealth() { S.health = await attempt(() => api('push_health')); }

  function healthPanel() {
    const h = S.health;
    if (!h) return '';
    const day = h.last_24h, week = h.last_7d;
    const rate = (t) => t.total ? Math.round(100 * (t.byStatus.delivered || 0) / t.total) + '%' : '—';
    const chips = (o) => Object.keys(o).length
      ? Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => '<span class="badge">' + esc(k) + ' · ' + v + '</span>').join(' ')
      : '<span class="muted small">none</span>';
    return '<section class="panel"><header><h3>' + icon('send', 'lg') + 'Push delivery</h3><span class="muted small">Split Wisely pushes and announcements</span></header><div class="body stack">' +
      (h.configured ? '' : '<p>' + icon('alert') + ' Push is not configured on the server.</p>') +
      '<div class="small">Registered devices: <strong>' + h.devices + '</strong> · Undelivered in the last 24 h (retried automatically): <strong>' + h.pending_24h + '</strong></div>' +
      '<div class="small">Last 24 h: <strong>' + day.total + '</strong> sends, delivered ' + rate(day) + ' · Last 7 days: <strong>' + week.total + '</strong> sends, delivered ' + rate(week) + '</div>' +
      '<div class="small">Outcomes (7 d): ' + chips(week.byStatus) + '</div>' +
      '<div class="small">Apple rejection reasons (7 d): ' + chips(week.reasons) + '</div></div></section>';
  }

  async function search(q) {
    S.query = q;
    if (q.trim().length < 3) { toast('Type at least 3 characters of the email.', 'err'); return; }
    S.searching = true; App.render();
    const r = await attempt(() => api('user_find', { query: q }));
    S.searching = false;
    S.results = r ? r.users : null;
    App.render();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function planBadge(u) {
    if (u.ai_tier === 'pro') return '<span class="badge ok">' + icon('check') + 'Pro AI models — ' + (u.reason === 'subscription' ? 'real subscription' : 'admin grant') + '</span>';
    return '<span class="badge">Free AI models</span>';
  }

  function userCard(u) {
    const sub = u.subscription
      ? '<div class="small muted">Subscription: ' + esc(u.subscription.status) + ' · ' + esc((u.subscription.product_id || '').split('.').pop()) + ' · expires ' + esc(when(u.subscription.expires_at)) + '</div>'
      : '<div class="small muted">No App Store subscription on record.</div>';
    const grant = u.override ? '<div class="small muted">Grant: ' + esc(u.override.note || '') + ' · ' + (u.override.expires_at ? 'expires ' + esc(when(u.override.expires_at)) : 'no expiry') + '</div>' : '';
    return '<div class="user-card" data-id="' + esc(u.id) + '" data-email="' + esc(u.email) + '"><div class="user-main"><div class="user-email">' + esc(u.email) + '</div>' +
      '<div class="small muted">Signed up with ' + esc(u.provider || 'email') + ' · joined ' + esc(when(u.created_at)) + ' · last sign-in ' + esc(u.last_sign_in_at ? ago(u.last_sign_in_at) : 'never') + '</div>' +
      '<div class="user-plan">' + planBadge(u) + '</div>' + sub + grant + '</div>' +
      '<div class="user-actions">' + (u.override
        ? '<button class="btn sm danger" data-action="revoke">Remove grant</button>'
        : '<button class="btn sm" data-action="grant">' + icon('plus') + 'Give Pro AI models…</button>') +
      '<button class="btn sm" data-action="push-user">' + icon('send') + 'Send push…</button></div></div>';
  }

  function render() {
    const results = S.results === null ? '' : S.results.length
      ? '<div class="stack">' + S.results.map(userCard).join('') + '</div>'
      : '<div class="empty">No account matches "' + esc(S.query) + '".</div>';
    const grants = S.grants.length
      ? '<div class="table-wrap"><table><thead><tr><th>Account</th><th>Note</th><th>Expires</th><th></th></tr></thead><tbody>' + S.grants.map((g) =>
        '<tr data-id="' + esc(g.user_id) + '"><td>' + esc(g.email || g.user_id) + '</td><td class="muted">' + esc(g.note || '') + '</td><td>' + (g.expires_at ? esc(when(g.expires_at)) + ' <span class="muted small">(' + (new Date(g.expires_at) < new Date() ? 'expired' : 'in ' + App.dur((new Date(g.expires_at) - Date.now()) / 1000)) + ')</span>' : 'never') + '</td>' +
        '<td class="num"><button class="btn sm danger" data-action="revoke-row">Remove</button></td></tr>').join('') + '</tbody></table></div>'
      : '<div class="empty">No accounts have a grant.</div>';
    return '<div class="page-head"><div><h2>Users</h2><p>Find an account by email, see which AI models it gets, and give testers Pro access to the AI models without faking a subscription. Grants never change what the app itself unlocks.</p></div></div>' +
      '<section class="panel"><header><h3>' + icon('search', 'lg') + 'Find an account</h3></header><div class="body"><form class="search-row" id="user-search">' +
      '<label class="field grow"><span>Email (start of it is enough)</span><input name="q" type="text" value="' + esc(S.query) + '" placeholder="name@example.com" autocomplete="off" spellcheck="false"></label>' +
      '<button class="btn primary" type="submit"' + (S.searching ? ' disabled' : '') + '>' + (S.searching ? icon('loader', 'spin') + 'Searching…' : icon('search') + 'Search') + '</button></form>' +
      '<div style="margin-top:16px">' + results + '</div></div></section>' +
      '<section class="panel"><header><h3>' + icon('shield', 'lg') + 'Accounts with a Pro-AI grant</h3><span class="muted small">Testers, App Review demo accounts, comped users</span></header>' + grants + '</section>' +
      healthPanel();
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function grantDialog(userId, email) {
    openModal('<h3 id="g-t">Give Pro AI models</h3><form id="grant-form" class="stack">' +
      '<p class="muted">' + esc(email) + ' will use the <strong>Pro</strong> model lists for AI features. In-app Pro features stay as they are.</p>' +
      '<label class="field"><span>For how long</span><select name="days"><option value="7">7 days</option><option value="30" selected>30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></label>' +
      '<label class="field"><span>Note</span><input name="note" type="text" maxlength="200" value="tester" spellcheck="false"></label>' +
      '<div class="actions"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Give access</button></div></form>', 'g-t');
    document.getElementById('grant-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      if (!(await attempt(() => api('pro_grant', { user_id: userId, days: Number(f.days.value), note: f.note.value }), 'Access granted'))) return;
      closeModal();
      await attempt(loadGrants);
      if (S.results) { const r = await attempt(() => api('user_find', { query: S.query })); if (r) S.results = r.users; }
      App.render();
    });
  }

  async function revoke(userId, label) {
    if (!(await askConfirm({ title: 'Remove the grant?', message: label + ' goes back to the Free AI models unless they have a real subscription.', confirmLabel: 'Remove', danger: true }))) return;
    if (!(await attempt(() => api('pro_revoke', { user_id: userId }), 'Grant removed'))) return;
    await attempt(loadGrants);
    if (S.results) { const r = await attempt(() => api('user_find', { query: S.query })); if (r) S.results = r.users; }
    App.render();
  }

  async function click(a, t) {
    const card = t.closest('.user-card'), row = t.closest('tr[data-id]');
    if (a === 'grant') return grantDialog(card.dataset.id, card.dataset.email);
    if (a === 'revoke') return revoke(card.dataset.id, card.dataset.email);
    if (a === 'revoke-row') return revoke(row.dataset.id, row.children[0].textContent);
    if (a === 'push-user') return App.pushDialog({ audience: 'user', userId: card.dataset.id, email: card.dataset.email });
  }

  function submit(ev) {
    if (ev.target.id === 'user-search') { ev.preventDefault(); search(ev.target.q.value); }
  }

  App.register('users', {
    title: 'Users',
    async load() { await Promise.all([loadGrants(), loadHealth()]); },
    render, click, submit,
    reset() { S.results = null; S.grants = []; S.query = ''; S.health = null; },
  });
})();
