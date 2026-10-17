/* Activity tab — how the AI features are doing: calls, failures, speed, tokens, estimated cost, call log. */
(() => {
  'use strict';
  const App = window.AdminApp;
  const { api, attempt, toast, icon, esc, fmt, ms, when, askConfirm } = App;

  const S = { hours: 24, stats: [], failing: [], cost: null, logs: [], logsDone: false, filter: { feature: '', ok: '' }, features: {}, providers: {}, loadingMore: false };

  const featName = (id) => S.features[id] || id;
  const provName = (id) => S.providers[id] || id;
  const usd = (n) => (n == null ? '–' : n < 0.01 && n > 0 ? '< $0.01' : '$' + n.toFixed(2));

  async function loadNames() {
    if (Object.keys(S.features).length) return;
    const r = await api('config');
    S.features = Object.fromEntries(r.features.map((f) => [f.id, f.label]));
    S.providers = Object.fromEntries(r.providers.map((p) => [p.id, p.label]));
  }
  async function loadLogs(append) {
    const before = append && S.logs.length ? S.logs[S.logs.length - 1].id : undefined;
    const r = await api('logs', { limit: 100, feature: S.filter.feature || undefined, ok: S.filter.ok === '' ? undefined : S.filter.ok === 'true', before_id: before });
    S.logs = append ? S.logs.concat(r.logs) : r.logs;
    S.logsDone = r.logs.length < 100;
  }
  async function loadStats() {
    const [s, c] = await Promise.all([api('stats', { hours: S.hours }), api('cost_estimate', { hours: S.hours })]);
    S.stats = s.stats; S.failing = s.failing; S.cost = c;
  }
  async function load() { await loadNames(); await Promise.all([loadStats(), loadLogs(false)]); }

  function render() {
    const calls = S.stats.reduce((a, r) => a + Number(r.calls), 0);
    const errors = S.stats.reduce((a, r) => a + Number(r.errors), 0);
    const tokens = S.stats.reduce((a, r) => a + Number(r.prompt_tokens) + Number(r.completion_tokens), 0);
    const p95 = S.stats.reduce((a, r) => Math.max(a, Number(r.p95_ms) || 0), 0);
    const rate = calls ? (((calls - errors) / calls) * 100).toFixed(1) + '%' : '–';
    const costByKey = new Map((S.cost ? S.cost.rows : []).map((r) => [r.feature + '|' + r.provider_id + '|' + r.model, r.cost_usd]));

    const fail = S.failing.length
      ? '<div class="banner" role="status">' + icon('alert', 'lg') + '<div><strong>Failing models</strong><ul>' + S.failing.map((f) => '<li>' + esc(f.model) + ' (' + esc(featName(f.feature)) + ', ' + esc(provName(f.provider_id)) + ') — ' + f.errors + ' of ' + f.calls + ' calls failed. Change it on the Models tab.</li>').join('') + '</ul></div></div>' : '';

    const table = S.stats.length
      ? '<div class="table-wrap"><table><thead><tr><th>Feature</th><th>Provider</th><th>Model</th><th class="num">Calls</th><th class="num">Failed</th><th class="num">Typical</th><th class="num">Slowest 5%</th><th class="num">Tokens</th><th class="num">Est. cost</th></tr></thead><tbody>' +
        S.stats.map((r) => '<tr><td>' + esc(featName(r.feature)) + '</td><td>' + esc(provName(r.provider_id)) + '</td><td class="mono">' + esc(r.model) + '</td><td class="num">' + fmt(r.calls) + '</td><td class="num">' +
          (Number(r.errors) ? '<span class="badge err">' + fmt(r.errors) + '</span>' : '0') + '</td><td class="num">' + ms(r.p50_ms) + '</td><td class="num">' + ms(r.p95_ms) + '</td><td class="num">' + fmt(Number(r.prompt_tokens) + Number(r.completion_tokens)) +
          '</td><td class="num">' + usd(costByKey.get(r.feature + '|' + r.provider_id + '|' + r.model)) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="empty">No AI calls recorded in this window yet.</div>';

    const logRows = S.logs.map((l) => '<tr><td class="muted" title="' + esc(l.created_at) + '">' + esc(when(l.created_at)) + '</td><td>' + esc(featName(l.feature)) + '</td><td>' + esc(l.tier) + '</td>' +
      '<td class="mono">' + esc(l.model || '') + '<div class="muted">' + esc(provName(l.provider_id)) + ' · attempt ' + l.attempt + '</div></td><td>' + (l.ok ? '<span class="badge ok">ok</span>' : '<span class="badge err">' + esc(l.http_status || 'error') + '</span>') + '</td>' +
      '<td class="num">' + ms(l.latency_ms) + '</td><td class="num">' + (l.prompt_tokens == null ? '–' : fmt(l.prompt_tokens) + ' / ' + fmt(l.completion_tokens)) + '</td><td class="small err-text">' + esc(l.error || '') + '</td></tr>').join('');
    const feats = Object.entries(S.features).map(([id, label]) => '<option value="' + esc(id) + '"' + (S.filter.feature === id ? ' selected' : '') + '>' + esc(label) + '</option>').join('');

    return '<div class="page-head"><div><h2>Activity</h2><p>Every AI request, whether it worked, how long it took and what it used. Prompts, replies and user identities are never stored, and entries are removed after 30 days.</p></div>' +
      '<div class="toolbar"><select data-action="hours" aria-label="Time window">' + [[24, 'Last 24 hours'], [168, 'Last 7 days'], [720, 'Last 30 days']].map(([h, l]) => '<option value="' + h + '"' + (S.hours === h ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
      '<button class="btn" data-action="reload">' + icon('refresh') + 'Refresh</button></div></div>' + fail +
      '<div class="kpis"><div class="kpi"><div class="label">AI calls</div><div class="value">' + fmt(calls) + '</div><div class="sub">including retries on the next model</div></div>' +
      '<div class="kpi"><div class="label">Success rate</div><div class="value">' + rate + '</div><div class="sub">' + fmt(errors) + ' failed attempts</div></div>' +
      '<div class="kpi"><div class="label">Slowest 5%</div><div class="value">' + (p95 ? ms(p95) : '–') + '</div></div>' +
      '<div class="kpi"><div class="label">Tokens used</div><div class="value">' + fmt(tokens) + '</div></div>' +
      '<div class="kpi"><div class="label">Estimated cost</div><div class="value">' + (S.cost && S.cost.total_usd != null ? usd(S.cost.total_usd) : '–') + '</div><div class="sub">OpenRouter models only</div></div></div>' +
      '<section class="panel"><header><h3>By model</h3><span class="muted small">A failed attempt may still have been rescued by the next model.</span></header>' + table + '</section>' +
      (S.cost ? '<p class="muted small">' + esc(S.cost.note) + '</p>' : '') +
      '<section class="panel"><header><h3>Recent calls</h3><div class="toolbar"><select data-action="log-feature" aria-label="Feature"><option value="">All features</option>' + feats + '</select>' +
      '<select data-action="log-status" aria-label="Result"><option value="">Any result</option><option value="true"' + (S.filter.ok === 'true' ? ' selected' : '') + '>Successful</option><option value="false"' + (S.filter.ok === 'false' ? ' selected' : '') + '>Failed</option></select>' +
      '<button class="btn sm danger" data-action="purge">' + icon('trash') + 'Delete old entries…</button></div></header>' +
      (S.logs.length ? '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Feature</th><th>Plan</th><th>Model</th><th>Result</th><th class="num">Time</th><th class="num">Tokens in / out</th><th>Error</th></tr></thead><tbody>' + logRows + '</tbody></table></div>' +
        (S.logsDone ? '' : '<div class="body"><button class="btn" data-action="more">' + (S.loadingMore ? icon('loader', 'spin') + 'Loading…' : 'Load more') + '</button></div>') : '<div class="empty">No matching calls.</div>') + '</section>';
  }

  async function click(a) {
    if (a === 'reload') { await attempt(load); App.render(); return; }
    if (a === 'more') { S.loadingMore = true; App.render(); await attempt(() => loadLogs(true)); S.loadingMore = false; App.render(); return; }
    if (a === 'purge') {
      if (!(await askConfirm({ title: 'Delete old call-log entries?', message: 'Entries older than 30 days are removed automatically. This removes them now. It cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
      const r = await attempt(() => api('purge_logs', { days: 30 }));
      if (r) { toast(r.deleted + ' entries removed'); await attempt(() => loadLogs(false)); App.render(); }
    }
  }

  async function change(ev) {
    const el = ev.target, a = el.dataset && el.dataset.action;
    if (a === 'hours') { S.hours = Number(el.value); await attempt(loadStats); App.render(); }
    else if (a === 'log-feature') { S.filter.feature = el.value; await attempt(() => loadLogs(false)); App.render(); }
    else if (a === 'log-status') { S.filter.ok = el.value; await attempt(() => loadLogs(false)); App.render(); }
  }

  App.register('activity', { title: 'Activity', load, render, click, change, reset() { S.logs = []; S.stats = []; S.features = {}; S.providers = {}; } });
})();
