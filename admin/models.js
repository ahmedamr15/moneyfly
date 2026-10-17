/* Models tab — pick the provider and model each AI feature uses, for Free and Pro users. */
(() => {
  'use strict';
  const App = window.AdminApp;
  const { api, attempt, toast, icon, esc, clone, ago, askConfirm, openModal, closeModal } = App;

  const S = {
    features: [], providers: [], routes: [], health: {}, failing: [],
    chains: {}, orig: {}, models: {}, tests: {}, saving: {}, justSaved: {}, refreshing: false,
  };

  const provById = (id) => S.providers.find((p) => p.id === id);
  const kindOf = (p) => {
    const url = p ? p.base_url : '';
    if (/openrouter\.ai/.test(url)) return 'openrouter';
    if (/deepseek\.com/.test(url)) return 'deepseek';
    if (/groq\.com/.test(url)) return 'groq';
    return 'other';
  };
  const featName = (id) => (S.features.find((f) => f.id === id) || {}).label || id;
  const MODALITY_ICON = { text: 'text', image: 'image', audio: 'mic' };

  // ── Working copies of each Free/Pro box ───────────────────────────────────
  function buildChain(feature, tier) {
    return S.routes
      .filter((r) => r.feature === feature && r.tier === tier && r.enabled)
      .sort((a, b) => a.position - b.position)
      .map((r) => ({
        provider_id: r.provider_id,
        model: r.model,
        params: clone(r.params || {}),
        orProvider: (r.params && r.params.provider && Array.isArray(r.params.provider.order) && r.params.provider.order[0]) || '',
      }));
  }

  /** Params exactly as they will be saved: only the fields that fit the chosen provider. */
  function paramsFor(row) {
    const p = clone(row.params || {});
    const k = kindOf(provById(row.provider_id));
    const or = row.orProvider.trim();
    if (k === 'openrouter') {
      const prov = p.provider && typeof p.provider === 'object' ? p.provider : {};
      if (or) prov.order = [or]; else delete prov.order;
      if (Object.keys(prov).length) p.provider = prov; else delete p.provider;
      // "flex" is a Google AI Studio discount tier — only keep it when that provider is selected.
      if (p.service_tier === 'flex' && !/google-ai-studio/i.test(or)) delete p.service_tier;
    } else {
      delete p.provider; delete p.service_tier;
    }
    if (k === 'deepseek') { if (!p.thinking) p.thinking = { type: 'disabled' }; } else { delete p.thinking; }
    return p;
  }

  const snapshot = (chain) => JSON.stringify(chain.map((r) => [r.provider_id, r.model.trim(), paramsFor(r)]));
  const isDirty = (f, t) => !!S.chains[f] && !!S.chains[f][t] && snapshot(S.chains[f][t]) !== S.orig[f][t];
  const anyDirty = () => S.features.some((f) => ['free', 'pro'].some((t) => isDirty(f.id, t)));

  function syncChains(force) {
    for (const f of S.features) {
      S.chains[f.id] = S.chains[f.id] || {};
      S.orig[f.id] = S.orig[f.id] || {};
      for (const t of ['free', 'pro']) {
        if (force || !S.chains[f.id][t] || !isDirty(f.id, t)) {
          S.chains[f.id][t] = buildChain(f.id, t);
          S.orig[f.id][t] = snapshot(S.chains[f.id][t]);
        }
      }
    }
  }

  async function loadConfig() {
    const r = await api('config');
    S.features = r.features; S.providers = r.providers; S.routes = r.routes;
    syncChains(false);
  }
  async function loadStats() {
    try {
      const r = await api('stats', { hours: 24 });
      S.health = r.last_call || {}; S.failing = r.failing || [];
    } catch { /* optional */ }
  }
  App.models = { get providers() { return S.providers; }, get features() { return S.features; } };

  // ── Rendering ─────────────────────────────────────────────────────────────
  function banner() {
    const issues = [];
    for (const p of S.providers) {
      if (!p.enabled || p.key_source !== 'none') continue;
      const n = S.routes.filter((r) => r.provider_id === p.id && r.enabled).length;
      if (n) issues.push(p.label + ' has no API key — ' + n + ' model' + (n === 1 ? '' : 's') + ' using it will fail.');
    }
    for (const f of S.failing) issues.push((f.model) + ' (' + featName(f.feature) + ') failed ' + f.errors + ' of its last ' + f.calls + ' calls today.');
    const off = S.features.filter((f) => !f.enabled).map((f) => f.label);
    if (off.length) issues.push('Switched off for everyone: ' + off.join(', ') + '.');
    if (!issues.length) return '';
    return '<div class="banner" role="status">' + icon('alert', 'lg') + '<div><strong>Needs attention</strong><ul>' + issues.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul></div></div>';
  }

  function jumpChips() {
    return '<nav class="chips" aria-label="Jump to a feature">' + S.features.map((f) =>
      '<a class="chip" href="#feat-' + esc(f.id) + '">' + icon(MODALITY_ICON[f.modality] || 'text') + esc(f.label) + '</a>').join('') +
      '<a class="chip" href="#keys">' + icon('key') + 'API keys</a></nav>';
  }

  function healthPill(f) {
    if (!f.enabled) return '';
    const h = S.health[f.id];
    if (!h) return '<span class="health"><span class="dot"></span>No calls in 24 h</span>';
    return '<span class="health" title="From the call log"><span class="dot ' + (h.ok ? 'ok' : 'err') + '"></span>' + (h.ok ? 'Healthy' : 'Last call failed') + ' · ' + ago(h.created_at) + '</span>';
  }

  function featureCard(f) {
    const chip = f.modality === 'text' ? '' : '<span class="badge info">needs ' + f.modality + ' input</span>';
    return '<section class="feature-card' + (f.enabled ? '' : ' off') + '" id="feat-' + esc(f.id) + '" data-feature="' + esc(f.id) + '"><div class="head">' +
      '<div class="head-main"><span class="feat-icon">' + icon(MODALITY_ICON[f.modality] || 'text', 'lg') + '</span><div><h3>' + esc(f.label) + ' ' + chip +
      (f.edge_function ? ' <span class="badge" title="The backend function that uses this setting">' + esc(f.edge_function) + '</span>' : '') + '</h3><p>' + esc(f.description || '') + '</p></div></div>' +
      '<div class="head-side"><span class="health-slot">' + healthPill(f) + '</span>' +
      '<label class="switch-label"><span>' + (f.enabled ? 'On' : 'Off') + '</span><span class="switch"><input type="checkbox" role="switch" data-action="toggle-feature" data-id="' + esc(f.id) + '" aria-label="' + esc(f.label) + ' enabled"' + (f.enabled ? ' checked' : '') + '><span class="track"></span></span></label></div></div>' +
      '<div class="tiers">' + tierBox(f, 'free') + tierBox(f, 'pro') + '</div></section>';
  }

  function tierBox(f, tier) {
    const title = tier === 'free' ? 'Free users' : 'Pro users';
    if (f.pro_only && tier === 'free') {
      return '<div class="tier na"><div class="tier-head"><div class="tier-title"><h4>' + title + '</h4></div></div><p class="muted">Pro only — Free users do not get this feature.</p></div>';
    }
    const key = f.id + '/' + tier;
    const chain = S.chains[f.id][tier];
    const dirty = isDirty(f.id, tier);
    const saving = !!S.saving[key], saved = !!S.justSaved[key] && !dirty;
    const rows = chain.map((r, i) => modelRow(f, tier, r, i, chain.length)).join('');
    const saveLabel = saving ? icon('loader', 'spin') + 'Saving…' : saved ? icon('check') + 'Saved' : 'Save';
    return '<div class="tier' + (dirty ? ' dirty' : '') + '" data-tier="' + tier + '"><div class="tier-head"><div class="tier-title"><h4>' + title + '</h4>' +
      '<button class="btn sm ghost" data-action="history" title="Past changes, undo, reset to defaults">' + icon('history') + 'History</button></div>' +
      '<div class="tier-actions">' + (dirty ? '<span class="unsaved">Unsaved changes</span><button class="btn sm ghost" data-action="discard">' + icon('undo') + 'Discard</button>' : '') +
      '<button class="btn sm primary' + (saved ? ' saved' : '') + '" data-action="save"' + (dirty && !saving ? '' : ' disabled') + '>' + saveLabel + '</button></div></div>' +
      rows + '<button class="btn sm ghost add-fallback" data-action="add-model">' + icon('plus') + 'Add fallback model</button></div>';
  }

  function modelRow(f, tier, r, i, count) {
    const k = kindOf(provById(r.provider_id));
    const opts = S.providers.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === r.provider_id ? ' selected' : '') + (p.enabled ? '' : ' disabled') + '>' + esc(p.label) + '</option>').join('');
    const t = S.tests[f.id + '/' + tier + '/' + i];
    let testHtml = '';
    if (t) {
      if (t.busy) testHtml = '<div class="test busy" role="status">' + icon('loader', 'spin') + 'Testing…</div>';
      else if (t.ok) testHtml = '<div class="test ok" role="status">' + icon('check') + '<span>Works — replied in ' + App.ms(t.latency_ms) + (t.prompt_tokens != null ? ' · ' + App.fmt(t.prompt_tokens) + ' in / ' + App.fmt(t.completion_tokens) + ' out' : '') + '</span></div>' +
        (t.content ? '<details class="reply"><summary>Show the reply</summary><pre>' + esc(t.content) + '</pre></details>' : '');
      else testHtml = '<div class="test err" role="alert">' + icon('alert') + '<span>' + esc(t.error) + '</span></div>';
    }
    const fail = S.failing.find((x) => x.feature === f.id && x.provider_id === r.provider_id && x.model === r.model);
    const label = i === 0 ? 'Main model' : 'Fallback ' + i;
    const testLabel = f.modality === 'image' ? 'Test with photo' : f.modality === 'audio' ? 'Test with audio' : 'Test';
    return '<div class="model" data-index="' + i + '"><div class="model-label"><span class="n">' + (i + 1) + '</span>' + label +
      (fail ? '<span class="badge err" title="From the call log, last 24 h">' + icon('alert') + 'Failing — ' + fail.errors + ' of ' + fail.calls + ' calls</span>' : '') + '</div>' +
      '<div class="model-fields' + (k === 'openrouter' ? ' has-or' : '') + '">' +
      '<label class="field"><span>Provider</span><select data-f="provider_id">' + opts + '</select></label>' +
      '<label class="field"><span>Model name</span><input data-f="model" type="text" list="dl-' + esc(r.provider_id) + '" value="' + esc(r.model) + '" placeholder="e.g. openai/gpt-oss-120b" spellcheck="false" autocomplete="off"></label>' +
      (k === 'openrouter' ? '<label class="field"><span>OpenRouter provider <em style="font-style:normal;font-weight:400">(optional)</em></span><input data-f="orProvider" type="text" list="dl-orprov" value="' + esc(r.orProvider) + '" placeholder="automatic" spellcheck="false" autocomplete="off"></label>' : '') +
      '<div class="model-actions"><button class="btn sm" data-action="test"' + (t && t.busy ? ' disabled' : '') + '>' + icon('play') + testLabel + '</button>' +
      (count > 1 ? '<button class="btn sm danger icon" data-action="remove-model" aria-label="Remove ' + label.toLowerCase() + '">' + icon('x') + '</button>' : '') + '</div></div>' + testHtml + '</div>';
  }

  function keysPanel() {
    const rows = S.providers.map((p) => {
      let status;
      if (p.key_source === 'vault') status = '<span class="badge ok">' + icon('lock') + 'Key saved ••••' + esc(p.key_hint || '') + '</span>';
      else if (p.key_source === 'env') status = '<span class="badge info">' + icon('info') + 'Using the key already on the server</span>';
      else status = '<span class="badge err">' + icon('alert') + 'No key — requests to ' + esc(p.label) + ' will fail</span>';
      return '<div class="key-row" data-provider="' + esc(p.id) + '"><div class="key-name">' + esc(p.label) + '</div><div>' + status + '</div><div class="key-actions">' +
        '<button class="btn sm" data-action="set-key">' + icon('key') + (p.key_source === 'vault' ? 'Replace key' : 'Add key') + '</button>' +
        (p.key_source === 'vault' ? '<button class="btn sm ghost" data-action="clear-key">Remove</button>' : '') + '</div></div>';
    }).join('');
    return '<section class="panel" id="keys"><header><h3>' + icon('key', 'lg') + 'API keys</h3><span class="muted small">Stored encrypted. A key can be replaced but never viewed again.</span></header><div class="body">' + rows + '</div></section>';
  }

  function render() {
    return '<div class="page-head"><div><h2>AI models</h2><p>Pick the provider and model each feature uses for Free and Pro users. If the main model fails, the next one is tried. Changes apply within about 30 seconds.</p></div>' +
      '<button class="btn" id="btn-refresh" data-action="refresh"' + (S.refreshing ? ' disabled' : '') + '>' + icon('refresh', S.refreshing ? 'spin' : '') + 'Refresh</button></div>' +
      banner() + jumpChips() + S.features.map(featureCard).join('') + keysPanel();
  }

  // ── Model suggestions (loaded quietly the first time a provider is used) ──
  function updateDatalists() {
    document.getElementById('datalists').innerHTML =
      '<datalist id="dl-orprov"><option value="google-ai-studio"></option><option value="DeepInfra"></option></datalist>' +
      Object.entries(S.models).map(([pid, list]) => '<datalist id="dl-' + esc(pid) + '">' + list.map((m) => '<option value="' + esc(m) + '"></option>').join('') + '</datalist>').join('');
  }
  async function ensureModels(providerId) {
    if (S.models[providerId] !== undefined) return;
    S.models[providerId] = [];
    try {
      const r = await api('list_models', { provider_id: providerId });
      if (r.ok) { S.models[providerId] = r.models; updateDatalists(); }
    } catch { /* suggestions are optional */ }
  }

  // ── Dialogs ───────────────────────────────────────────────────────────────
  function keyForm(providerId) {
    const p = provById(providerId);
    openModal('<h3 id="key-t">API key — ' + esc(p.label) + '</h3><form id="key-form" class="stack">' +
      '<p class="muted">Paste the key. It is stored encrypted and only the last four characters are shown afterwards. It replaces any key currently saved here.</p>' +
      '<label class="field"><span>API key</span><div class="input-wrap"><input name="key" type="password" autocomplete="off" spellcheck="false" required>' +
      '<button class="btn ghost sm icon reveal" type="button" data-action="reveal" aria-label="Show key">' + icon('eye') + '</button></div></label>' +
      '<div class="actions"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Save key</button></div></form>', 'key-t');
    document.getElementById('key-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = ev.target.querySelector('button[type=submit]');
      const k = ev.target.key.value;
      btn.disabled = true; btn.innerHTML = icon('loader', 'spin') + 'Saving…';
      const ok = await attempt(() => api('set_provider_key', { id: providerId, key: k }), 'Key saved');
      if (!ok) { btn.disabled = false; btn.textContent = 'Save key'; return; }
      ev.target.key.value = '';
      closeModal();
      await attempt(loadConfig); App.render();
    });
  }

  const ACTION_LABEL = { save_chain: 'Saved', restore_chain: 'Undone', reset_chain: 'Reset to defaults' };
  async function historyDialog(feature, tier) {
    openModal('<h3 id="h-t">History — ' + esc(featName(feature)) + ' · ' + (tier === 'free' ? 'Free' : 'Pro') + '</h3><div id="hist-body" class="stack"><p class="muted">' + icon('loader', 'spin') + ' Loading…</p></div>' +
      '<div class="actions"><button class="btn danger" type="button" id="hist-reset">' + icon('undo') + 'Reset to defaults</button><button class="btn" type="button" data-action="close-modal">Close</button></div>', 'h-t', true);
    const body = document.getElementById('hist-body');
    const r = await attempt(() => api('route_history', { feature, tier }));
    if (!r) { closeModal(); return; }
    const list = (rows) => rows.length ? rows.map((x) => esc(x.model)).join(' → ') : 'nothing';
    body.innerHTML = r.entries.length
      ? '<p class="muted small">Newest first. "Undo" puts the box back the way it was <em>before</em> that change.</p>' + r.entries.map((e) =>
        '<div class="hist"><div><strong>' + (ACTION_LABEL[e.action] || esc(e.action)) + '</strong> <span class="muted small">' + esc(App.when(e.at)) + ' · ' + esc(e.admin || '') + '</span>' +
        '<div class="small muted">Was: ' + list(e.before) + '</div><div class="small">Now: ' + list(e.after) + '</div></div>' +
        (e.before.length ? '<button class="btn sm" data-action="undo-entry" data-id="' + e.id + '">' + icon('undo') + 'Undo</button>' : '') + '</div>').join('')
      : '<p class="muted">No changes recorded for this box yet.</p>';
    document.getElementById('hist-reset').addEventListener('click', async () => {
      closeModal();
      if (!(await askConfirm({ title: 'Reset to the original models?', message: 'This replaces the current ' + (tier === 'free' ? 'Free' : 'Pro') + ' list for ' + featName(feature) + ' with the one MoneyFly shipped with. You can undo it from History.', confirmLabel: 'Reset', danger: true }))) return;
      if (await attempt(() => api('reset_chain', { feature, tier }), 'Reset to defaults')) { await attempt(loadConfig); S.chains[feature][tier] = buildChain(feature, tier); S.orig[feature][tier] = snapshot(S.chains[feature][tier]); App.render(); }
    });
  }

  // ── Test files (photo / recording) ────────────────────────────────────────
  function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept;
      inp.onchange = () => resolve(inp.files && inp.files[0] ? inp.files[0] : null);
      inp.addEventListener('cancel', () => resolve(null));
      inp.click();
    });
  }
  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
  }
  /** Shrink a photo to at most 1600 px (like the app does) and return JPEG base64. */
  async function prepareImage(file) {
    const url = await readAsDataUrl(file);
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('That file is not an image.')); i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { image_base64: c.toDataURL('image/jpeg', 0.8).split(',')[1], image_mime: 'image/jpeg' };
  }
  async function prepareAudio(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const format = { m4a: 'm4a', wav: 'wav', mp3: 'mp3', mp4: 'mp4', webm: 'webm', aac: 'm4a' }[ext];
    if (!format) throw new Error('Use an m4a, wav, mp3, mp4 or webm recording.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Keep the recording under 5 MB.');
    return { audio_base64: (await readAsDataUrl(file)).split(',')[1], audio_format: format };
  }

  // ── Saving ────────────────────────────────────────────────────────────────
  async function saveBox(feature, tier) {
    const chain = S.chains[feature][tier], key = feature + '/' + tier;
    if (chain.some((r) => !r.model.trim())) { toast('Every row needs a model name.', 'err'); return; }
    const attempts = chain.map((r) => ({ provider_id: r.provider_id, model: r.model.trim(), params: paramsFor(r) }));
    S.saving[key] = true; App.render();
    const ok = await attempt(() => api('save_chain', { feature, tier, attempts }), (tier === 'free' ? 'Free' : 'Pro') + ' models saved');
    S.saving[key] = false;
    if (!ok) { App.render(); return; }
    Object.keys(S.tests).forEach((k) => { if (k.startsWith(key + '/')) delete S.tests[k]; });
    await attempt(loadConfig);
    S.chains[feature][tier] = buildChain(feature, tier);
    S.orig[feature][tier] = snapshot(S.chains[feature][tier]);
    S.justSaved[key] = true;
    App.render();
    setTimeout(() => { delete S.justSaved[key]; if (App.current === 'models' && !document.querySelector('.modal')) App.render(); }, 2200);
  }

  const rowOf = (el) => {
    const card = el.closest('.feature-card'), box = el.closest('.tier'), model = el.closest('.model');
    if (!card || !box || !box.dataset.tier) return null;
    const feature = card.dataset.feature, tier = box.dataset.tier;
    return { feature, tier, chain: S.chains[feature][tier], index: model ? Number(model.dataset.index) : -1 };
  };
  const clearTests = (feature, tier) => Object.keys(S.tests).forEach((k) => { if (k.startsWith(feature + '/' + tier + '/')) delete S.tests[k]; });

  // ── Events ────────────────────────────────────────────────────────────────
  async function click(a, t) {
    if (a === 'refresh') {
      S.refreshing = true; App.render();
      await attempt(loadConfig); await loadStats();
      S.refreshing = false; App.render(); toast('Refreshed');
      return;
    }
    if (a === 'set-key') return keyForm(t.closest('[data-provider]').dataset.provider);
    if (a === 'clear-key') {
      const id = t.closest('[data-provider]').dataset.provider;
      if (!(await askConfirm({ title: 'Remove the saved key?', message: provById(id).label + ' will go back to the key already on the server, if there is one. Requests fail if there is not.', confirmLabel: 'Remove key', danger: true }))) return;
      if (await attempt(() => api('clear_provider_key', { id }), 'Key removed')) { await attempt(loadConfig); App.render(); }
      return;
    }
    if (a === 'undo-entry') {
      const id = Number(t.dataset.id);
      closeModal();
      if (await attempt(() => api('restore_chain', { audit_id: id }), 'Change undone')) { await attempt(loadConfig); syncChains(true); App.render(); }
      return;
    }

    const ctx = rowOf(t);
    if (!ctx) return;
    const { feature, tier, chain, index } = ctx;

    if (a === 'history') return historyDialog(feature, tier);
    if (a === 'add-model') {
      const last = chain[chain.length - 1] || {};
      chain.push({ provider_id: last.provider_id || (S.providers.find((p) => p.enabled) || {}).id, model: '', params: {}, orProvider: '' });
      App.render();
      const rows = document.querySelectorAll('[data-feature="' + feature + '"] .tier[data-tier="' + tier + '"] .model');
      const inp = rows[rows.length - 1] && rows[rows.length - 1].querySelector('[data-f="model"]');
      if (inp) inp.focus();
      return;
    }
    if (a === 'remove-model') { chain.splice(index, 1); clearTests(feature, tier); return App.render(); }
    if (a === 'discard') { S.chains[feature][tier] = buildChain(feature, tier); clearTests(feature, tier); return App.render(); }
    if (a === 'test') {
      const row = chain[index], key = feature + '/' + tier + '/' + index;
      if (!row.model.trim()) { toast('Type a model name first.', 'err'); return; }
      const f = S.features.find((x) => x.id === feature);
      let extra = {};
      if (f.modality === 'image' || f.modality === 'audio') {
        const file = await pickFile(f.modality === 'image' ? 'image/*' : 'audio/*,.m4a,.wav,.mp3,.webm');
        if (!file) return;
        try { extra = f.modality === 'image' ? await prepareImage(file) : await prepareAudio(file); } catch (e) { toast(e.message, 'err'); return; }
      }
      S.tests[key] = { busy: true, ok: true }; App.render();
      const r = await attempt(() => api('test_route', { provider_id: row.provider_id, model: row.model.trim(), params: paramsFor(row), ...extra }));
      S.tests[key] = r || { ok: false, error: 'The test did not complete.' };
      App.render();
      return;
    }
    if (a === 'save') return saveBox(feature, tier);
  }

  function input(ev) {
    const el = ev.target, f = el.dataset && el.dataset.f;
    if (!f || f === 'provider_id') return;
    const ctx = rowOf(el);
    if (!ctx) return;
    ctx.chain[ctx.index][f] = el.value;
    // Update the box chrome without re-rendering (keeps focus and caret while typing).
    const box = el.closest('.tier'), dirty = isDirty(ctx.feature, ctx.tier);
    box.classList.toggle('dirty', dirty);
    const saveBtn = box.querySelector('[data-action="save"]');
    saveBtn.disabled = !dirty; saveBtn.classList.remove('saved'); saveBtn.textContent = 'Save';
    const actions = box.querySelector('.tier-actions');
    const hint = actions.querySelector('.unsaved');
    if (dirty && !hint) actions.insertAdjacentHTML('afterbegin', '<span class="unsaved">Unsaved changes</span><button class="btn sm ghost" data-action="discard">' + icon('undo') + 'Discard</button>');
    if (!dirty && hint) { hint.remove(); const d = actions.querySelector('[data-action="discard"]'); if (d) d.remove(); }
    delete S.justSaved[ctx.feature + '/' + ctx.tier];
  }

  function focusin(ev) {
    const el = ev.target;
    if (el.dataset && el.dataset.f === 'model') { const ctx = rowOf(el); if (ctx) ensureModels(ctx.chain[ctx.index].provider_id); }
  }

  async function change(ev) {
    const el = ev.target;
    if (el.dataset && el.dataset.f === 'provider_id') {
      const ctx = rowOf(el);
      if (!ctx) return;
      const row = ctx.chain[ctx.index];
      row.provider_id = el.value;
      row.params = paramsFor(row);                       // drop settings that belong to the old provider
      if (kindOf(provById(row.provider_id)) !== 'openrouter') row.orProvider = '';
      App.render();
      return;
    }
    if (el.dataset && el.dataset.action === 'toggle-feature') {
      const f = S.features.find((x) => x.id === el.dataset.id);
      const want = el.checked;
      if (!want && !(await askConfirm({ title: 'Turn off "' + f.label + '"?', message: 'It will be unavailable for ALL users until you turn it back on. The app treats it like a provider failure.', confirmLabel: 'Turn off', danger: true }))) { el.checked = true; return; }
      if (await attempt(() => api('save_feature', { id: f.id, enabled: want }), want ? f.label + ' is on' : f.label + ' is off')) await attempt(loadConfig);
      App.render();
    }
  }

  // Ctrl/Cmd+S saves the box you are editing.
  function keydown(ev) {
    if (!((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 's')) return;
    const ctx = document.activeElement && document.activeElement.closest && rowOf(document.activeElement);
    if (!ctx) return;
    ev.preventDefault();
    if (isDirty(ctx.feature, ctx.tier) && !S.saving[ctx.feature + '/' + ctx.tier]) saveBox(ctx.feature, ctx.tier);
  }

  App.register('models', {
    title: 'Models',
    async load() { await loadConfig(); await loadStats(); updateDatalists(); },
    render, click, input, focusin, change, keydown,
    dirty: anyDirty,
    reset() { S.features = []; S.providers = []; S.routes = []; S.chains = {}; S.orig = {}; S.tests = {}; },
  });
  updateDatalists();
})();
