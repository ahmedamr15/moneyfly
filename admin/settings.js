/* Settings tab — remote settings the iPhone app reads, and the server-side AI usage caps. */
(() => {
  'use strict';
  const App = window.AdminApp;
  const { api, attempt, toast, icon, esc, when, askConfirm } = App;

  const LIMIT_LABELS = [
    ['maxAccounts', 'Accounts in total'], ['maxBankAccounts', 'Bank accounts'], ['maxCashAccounts', 'Cash wallets'], ['maxCreditCardAccounts', 'Credit cards'],
    ['maxInvestmentAccounts', 'Investment accounts'], ['maxGoals', 'Savings goals'], ['maxBudgets', 'Budgets'], ['maxRecurringTemplates', 'Recurring payments'],
    ['maxSplitsPerMonth', 'Bill splits per month'], ['maxOwnedSplitGroups', 'Split Wisely groups owned'], ['maxSMSPerMonth', 'SMS captures per month'],
    ['maxReceiptScansPerMonth', 'Receipt scans per month'], ['maxAIChatSessionsPerMonth', 'AI chats per month'],
  ];
  const QUOTA_LABELS = { 'sms-parse': 'SMS parsing', 'receipt-scan': 'Receipt scans', 'ai-chat': 'AI chat messages' };
  const FLAGS = [['aiChat', 'AI chat ("Discuss with AI")'], ['receiptScan', 'Receipt scanning'], ['voiceInput', 'Voice input']];

  const S = { settings: {}, saving: {} };
  const get = (k, fallback) => (S.settings[k] !== undefined ? S.settings[k] : fallback);

  async function load() {
    const r = await api('settings_get');
    S.settings = Object.fromEntries(r.settings.map((s) => [s.key, s.value]));
    S.meta = Object.fromEntries(r.settings.map((s) => [s.key, s]));
  }

  const num = (name, label, value, hint) => '<label class="field"><span>' + esc(label) + '</span><input name="' + esc(name) + '" type="number" min="0" step="1" inputmode="numeric" value="' + (value ?? '') + '"' + (hint ? ' placeholder="' + esc(hint) + '"' : '') + '></label>';
  const saveBtn = (key) => '<button class="btn primary" type="submit"' + (S.saving[key] ? ' disabled' : '') + '>' + (S.saving[key] ? icon('loader', 'spin') + 'Saving…' : 'Save') + '</button>';
  const stamp = (key) => (S.meta && S.meta[key] && S.meta[key].updated_by ? '<span class="muted small">Last changed ' + esc(when(S.meta[key].updated_at)) + ' by ' + esc(S.meta[key].updated_by) + '</span>' : '');

  function limitsPanel() {
    const v = get('free_limits', {});
    return '<section class="panel"><header><h3>Free plan limits</h3>' + stamp('free_limits') + '</header><form class="body stack" data-setting="free_limits">' +
      '<p class="muted small">How much a Free user gets. <strong>The app reads these only after the update that includes remote settings ships</strong> — until then it uses the numbers built into the version people have installed. Pro is always unlimited.</p>' +
      '<div class="grid-fields">' + LIMIT_LABELS.map(([k, l]) => num(k, l, v[k])).join('') + '</div>' + '<div>' + saveBtn('free_limits') + '</div></form></section>';
  }

  function quotasPanel() {
    const q = get('ai_quotas', { enabled: true, features: {} });
    const rows = Object.entries(QUOTA_LABELS).map(([f, label]) => {
      const c = (q.features || {})[f] || { period: 'month', free: null, pro: null };
      return '<tr data-feature="' + f + '"><td>' + esc(label) + '</td><td><select name="period"><option value="month"' + (c.period === 'month' ? ' selected' : '') + '>per month</option><option value="day"' + (c.period === 'day' ? ' selected' : '') + '>per day</option></select></td>' +
        '<td><input name="free" type="number" min="0" step="1" value="' + (c.free ?? '') + '" placeholder="unlimited" aria-label="' + esc(label) + ' Free limit"></td>' +
        '<td><input name="pro" type="number" min="0" step="1" value="' + (c.pro ?? '') + '" placeholder="unlimited" aria-label="' + esc(label) + ' Pro limit"></td></tr>';
    }).join('');
    return '<section class="panel"><header><h3>Server-side AI caps</h3>' + stamp('ai_quotas') + '</header><form class="body stack" data-setting="ai_quotas">' +
      '<p class="muted small">A safety net that works <strong>today</strong>, for every app version: the server counts successful AI calls per person and refuses more once a cap is reached. Leave a box empty for no cap. These are deliberately looser than the in-app limits, because the app only counts what it saves.</p>' +
      '<label class="switch-label"><span class="switch"><input type="checkbox" name="enabled"' + (q.enabled !== false ? ' checked' : '') + '><span class="track"></span></span><span>Caps are on</span></label>' +
      '<div class="table-wrap"><table><thead><tr><th>Feature</th><th>Counted</th><th>Free users</th><th>Pro users</th></tr></thead><tbody>' + rows + '</tbody></table></div><div>' + saveBtn('ai_quotas') + '</div></form></section>';
  }

  function statusPanel() {
    const s = get('app_status', { min_version: '', maintenance: { enabled: false, message: '' } });
    const m = s.maintenance || {};
    return '<section class="panel"><header><h3>App status</h3>' + stamp('app_status') + '</header><form class="body stack" data-setting="app_status">' +
      '<p class="muted small">Needs the app update that reads remote settings.</p>' +
      '<label class="field"><span>Minimum app version <em class="muted">(older versions are asked to update; leave empty for none)</em></span><input name="min_version" type="text" value="' + esc(s.min_version || '') + '" placeholder="e.g. 2.1" spellcheck="false" autocomplete="off"></label>' +
      '<label class="switch-label"><span class="switch"><input type="checkbox" name="maint"' + (m.enabled ? ' checked' : '') + '><span class="track"></span></span><span>Show a maintenance message to everyone</span></label>' +
      '<label class="field"><span>Maintenance message</span><input name="message" type="text" maxlength="300" value="' + esc(m.message || '') + '" placeholder="We are doing some maintenance — back soon."></label>' +
      '<div>' + saveBtn('app_status') + '</div></form></section>';
  }

  function announcementPanel() {
    const a = get('announcement', { enabled: false, title: '', body: '', url: '', expires_at: null });
    const exp = a.expires_at ? new Date(new Date(a.expires_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    return '<section class="panel"><header><h3>' + icon('bell', 'lg') + 'Announcement</h3>' + stamp('announcement') + '</header><form class="body stack" data-setting="announcement">' +
      '<p class="muted small">A banner inside the app (needs the app update that reads remote settings). People can dismiss it; editing the text shows it again. To also notify people who are not in the app, send a push message.</p>' +
      '<label class="switch-label"><span class="switch"><input type="checkbox" name="enabled"' + (a.enabled ? ' checked' : '') + '><span class="track"></span></span><span>Show the announcement</span></label>' +
      '<label class="field"><span>Title <em class="muted">(max 80)</em></span><input name="title" type="text" maxlength="80" value="' + esc(a.title || '') + '"></label>' +
      '<label class="field"><span>Message <em class="muted">(max 400)</em></span><textarea name="body" rows="3" maxlength="400">' + esc(a.body || '') + '</textarea></label>' +
      '<div class="grid-fields"><label class="field"><span>Link <em class="muted">(optional, https)</em></span><input name="url" type="text" value="' + esc(a.url || '') + '" placeholder="https://"></label>' +
      '<label class="field"><span>Hide automatically after <em class="muted">(optional)</em></span><input name="expires" type="datetime-local" value="' + exp + '"></label></div>' +
      '<div class="toolbar">' + saveBtn('announcement') + '<button class="btn" type="button" data-action="push-all">' + icon('send') + 'Send as a push message…</button></div></form></section>';
  }

  function flagsPanel() {
    const f = get('feature_flags', {});
    return '<section class="panel"><header><h3>Feature switches in the app</h3>' + stamp('feature_flags') + '</header><form class="body stack" data-setting="feature_flags">' +
      '<p class="muted small">Hide a feature inside the app for everyone, for example if a provider is down for a long time. Needs the app update that reads remote settings. (To stop the AI behind a feature right now, use the on/off switch on the Models tab.)</p>' +
      '<div class="flag-list">' + FLAGS.map(([k, l]) => '<label class="switch-label"><span class="switch"><input type="checkbox" name="' + k + '"' + (f[k] !== false ? ' checked' : '') + '><span class="track"></span></span><span>' + esc(l) + '</span></label>').join('') + '</div>' +
      '<div>' + saveBtn('feature_flags') + '</div></form></section>';
  }

  function render() {
    return '<div class="page-head"><div><h2>Settings</h2><p>Remote settings for the iPhone app and the server-side safety limits. Everything here is recorded in the audit trail.</p></div></div>' +
      quotasPanel() + limitsPanel() + announcementPanel() + statusPanel() + flagsPanel();
  }

  // ── Reading each form into the value the server expects ───────────────────
  const val = (f, n) => f.elements[n].value.trim();
  const orNull = (s) => (s === '' ? null : Number(s));
  const READERS = {
    free_limits(f) { const o = {}; for (const [k] of LIMIT_LABELS) if (val(f, k) !== '') o[k] = Number(val(f, k)); return o; },
    ai_quotas(f) {
      const features = {};
      f.querySelectorAll('tr[data-feature]').forEach((tr) => { features[tr.dataset.feature] = { period: tr.querySelector('[name=period]').value, free: orNull(tr.querySelector('[name=free]').value.trim()), pro: orNull(tr.querySelector('[name=pro]').value.trim()) }; });
      return { enabled: f.elements.enabled.checked, features };
    },
    app_status(f) { return { min_version: val(f, 'min_version'), maintenance: { enabled: f.elements.maint.checked, message: val(f, 'message') } }; },
    announcement(f) { return { enabled: f.elements.enabled.checked, title: val(f, 'title'), body: val(f, 'body'), url: val(f, 'url'), expires_at: f.elements.expires.value ? new Date(f.elements.expires.value).toISOString() : null }; },
    feature_flags(f) { const o = {}; for (const [k] of FLAGS) o[k] = f.elements[k].checked; return o; },
  };

  async function submit(ev) {
    const form = ev.target;
    const key = form.dataset && form.dataset.setting;
    if (!key) return;
    ev.preventDefault();
    let value;
    try { value = READERS[key](form); } catch { toast('Could not read the form.', 'err'); return; }
    if (key === 'free_limits' && Object.values(value).some((n) => !Number.isInteger(n) || n < 0)) { toast('Limits must be whole numbers, 0 or more.', 'err'); return; }
    S.saving[key] = true; App.render();
    const r = await attempt(() => api('settings_set', { key, value }), 'Saved');
    S.saving[key] = false;
    if (r) { S.settings[key] = r.value; await attempt(load); }
    App.render();
  }

  async function click(a) {
    if (a === 'push-all') {
      const f = document.querySelector('form[data-setting="announcement"]');
      App.pushDialog({ audience: 'all', title: f.elements.title.value.trim(), body: f.elements.body.value.trim(), url: f.elements.url.value.trim() });
    }
  }

  App.register('settings', { title: 'Settings', load, render, click, submit, reset() { S.settings = {}; } });
})();
