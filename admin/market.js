/* Market data tab — exchange rates, gold, stocks: how fresh they are, force a refresh, set cache times. */
(() => {
  'use strict';
  const App = window.AdminApp;
  const { api, attempt, toast, icon, esc, when, dur } = App;

  const S = { rows: [], ttl: null, saving: false, busy: {} };
  const LABELS = { forex: 'Exchange rates', gold: 'Gold prices (EGP, by karat)', stocks: 'Stocks, crypto and metals' };
  const TTL_FIELDS = [['forex', 'Exchange rates'], ['gold', 'Gold prices'], ['stocks', 'Stocks and crypto'], ['stock', 'One stock (EGX ticker)']];
  const labelOf = (k) => LABELS[k] || (k.startsWith('stock:') ? 'Stock ' + k.slice(6) : k);
  const ttlFor = (r) => (S.ttl && S.ttl[r.key.startsWith('stock:') ? 'stock' : r.key]) || r.ttl_seconds;

  async function load() {
    const r = await api('market_status');
    S.rows = r.rows; S.ttl = r.ttl;
  }

  function render() {
    const rows = S.rows.length ? '<div class="table-wrap"><table><thead><tr><th>Data</th><th>Last updated</th><th>Refreshed every</th><th>State</th><th></th></tr></thead><tbody>' + S.rows.map((r) => {
      const ttl = ttlFor(r), stale = r.age_seconds >= ttl;
      return '<tr data-key="' + esc(r.key) + '"><td>' + esc(labelOf(r.key)) + '</td><td>' + esc(dur(r.age_seconds)) + ' ago <span class="muted small">(' + esc(when(r.updated_at)) + ')</span></td><td>' + esc(dur(ttl)) + '</td>' +
        '<td>' + (stale ? '<span class="badge warn">Due — refreshes on the next request</span>' : '<span class="badge ok">Fresh</span>') + '</td>' +
        '<td class="num"><button class="btn sm" data-action="refresh"' + (S.busy[r.key] ? ' disabled' : '') + '>' + (S.busy[r.key] ? icon('loader', 'spin') : icon('refresh')) + 'Refresh now</button></td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="empty">Nothing cached yet — the first time the app asks for rates they will appear here.</div>';
    const t = S.ttl || {};
    return '<div class="page-head"><div><h2>Market data</h2><p>Exchange rates, gold and stock prices are fetched from outside sources and kept for a while so every user shares one request. "Refresh now" marks an entry as due; the next time the app asks, the server fetches it again (and keeps the old value if the source is down).</p></div>' +
      '<button class="btn" data-action="reload">' + icon('refresh') + 'Reload</button></div>' +
      '<section class="panel"><header><h3>Cached data</h3></header>' + rows + '</section>' +
      '<section class="panel"><header><h3>How long to keep it</h3></header><form class="body stack" id="ttl-form"><p class="muted small">In minutes. Shorter means fresher prices but more requests to the data providers (some have monthly limits).</p>' +
      '<div class="grid-fields">' + TTL_FIELDS.map(([k, l]) => '<label class="field"><span>' + esc(l) + '</span><input name="' + k + '" type="number" min="1" max="1440" step="1" value="' + (t[k] ? Math.round(t[k] / 60) : '') + '"></label>').join('') + '</div>' +
      '<div><button class="btn primary" type="submit"' + (S.saving ? ' disabled' : '') + '>' + (S.saving ? icon('loader', 'spin') + 'Saving…' : 'Save') + '</button></div></form></section>';
  }

  async function click(a, t) {
    if (a === 'reload') { await attempt(load); App.render(); return; }
    if (a === 'refresh') {
      const key = t.closest('tr').dataset.key;
      S.busy[key] = true; App.render();
      await attempt(() => api('market_refresh', { key }), 'Marked as due');
      S.busy[key] = false;
      await attempt(load); App.render();
    }
  }

  async function submit(ev) {
    if (ev.target.id !== 'ttl-form') return;
    ev.preventDefault();
    const f = ev.target, value = {};
    for (const [k] of TTL_FIELDS) value[k] = Math.round(Number(f.elements[k].value) * 60);
    S.saving = true; App.render();
    const r = await attempt(() => api('settings_set', { key: 'market_ttl', value }), 'Saved');
    S.saving = false;
    if (r) await attempt(load);
    App.render();
  }

  App.register('market', { title: 'Market data', load, render, click, submit, reset() { S.rows = []; S.ttl = null; } });
})();
