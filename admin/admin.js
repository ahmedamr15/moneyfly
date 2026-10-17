/* MoneyFly Admin — pick the AI model for each feature, for Free and Pro users.
 *
 * Talks only to the `admin-api` edge function (which re-checks admin + 2FA on every
 * call). API keys are write-only: they are sent to the server and never displayed. */
(() => {
  'use strict';

  // The anon key is public by design (it ships inside the iOS app too).
  const SUPABASE_URL = 'https://llhpxikoymctlthdjybo.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaHB4aWtveW1jdGx0aGRqeWJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMDc1NDQsImV4cCI6MjA5NTU4MzU0NH0.vQrvuHAUQGxHCMuMZsoeWVW5Bb0jiuAO4p3gm7rdKBY';
  // Supabase Auth signs in with an email; typing "admin" maps to this address.
  const ADMIN_EMAIL = 'admin@moneyfly.internal';
  const API_URL = SUPABASE_URL + '/functions/v1/admin-api';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // sessionStorage: closing the tab signs the admin out.
    auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const state = {
    email: '', features: [], providers: [], routes: [], health: {},
    chains: {}, orig: {}, models: {}, tests: {},
    saving: {}, justSaved: {}, refreshing: false,
  };
  const $app = document.getElementById('app');
  const $modal = document.getElementById('modal-root');

  // ── Icons (inline SVG, Lucide-style) ──────────────────────────────────────
  const ICONS = {
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    undo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    text: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  };
  const icon = (name, extra) => '<svg class="i ' + (extra || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';

  // ── Utilities ─────────────────────────────────────────────────────────────
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const provById = (id) => state.providers.find((p) => p.id === id);
  const kindOf = (p) => {
    const url = p ? p.base_url : '';
    if (/openrouter\.ai/.test(url)) return 'openrouter';
    if (/deepseek\.com/.test(url)) return 'deepseek';
    if (/groq\.com/.test(url)) return 'groq';
    return 'other';
  };
  function ago(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return Math.floor(s / 86400) + ' d ago';
  }

  function toast(message, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'err' ? ' err' : '');
    el.innerHTML = icon(kind === 'err' ? 'alert' : 'check', 'lg') + '<span></span>';
    el.querySelector('span').textContent = message;
    el.addEventListener('click', () => el.remove());
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'err' ? 8000 : 3200);
  }

  class ApiError extends Error {
    constructor(message, code, status) { super(message); this.code = code; this.status = status; }
  }

  async function api(action, data) {
    const { data: sess } = await sb.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    if (!token) throw new ApiError('Signed out.', 'unauthenticated', 401);
    let resp;
    try {
      resp = await fetch(API_URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(data || {}) }),
      });
    } catch {
      throw new ApiError('Network error — could not reach the server.', 'network', 0);
    }
    let body = {};
    try { body = await resp.json(); } catch { /* non-JSON error page */ }
    if (!resp.ok) throw new ApiError(body.error || 'Request failed (' + resp.status + ').', body.code || 'error', resp.status);
    return body;
  }

  /** Run something, toast any error, return null on failure. */
  async function attempt(fn, okMessage) {
    try {
      const r = await fn();
      if (okMessage) toast(okMessage);
      return r === undefined ? true : r;
    } catch (e) {
      if (e.code === 'unauthenticated') { await signOut(); return null; }
      toast(e.message, 'err');
      return null;
    }
  }

  // ── Dialogs (focus-trapped, Escape closes, focus returns) ─────────────────
  let lastFocus = null;
  function openModal(html, labelId) {
    lastFocus = document.activeElement;
    $modal.innerHTML = '<div class="overlay" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="' + labelId + '">' + html + '</div></div>';
    const first = $modal.querySelector('input, textarea, select, button.primary, button');
    if (first) first.focus();
  }
  function closeModal() {
    $modal.innerHTML = '';
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }
  document.addEventListener('keydown', (e) => {
    if (!$modal.firstChild) return;
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key === 'Tab') {
      const f = [...$modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /** Styled replacement for window.confirm. Resolves true / false. */
  function askConfirm({ title, message, confirmLabel, danger }) {
    return new Promise((resolve) => {
      openModal('<h3 id="dlg-t">' + esc(title) + '</h3><p class="muted">' + esc(message) + '</p>' +
        '<div class="actions"><button class="btn" type="button" data-action="dlg-no">Cancel</button>' +
        '<button class="btn ' + (danger ? 'danger-solid' : 'primary') + '" type="button" data-action="dlg-yes">' + esc(confirmLabel || 'Confirm') + '</button></div>', 'dlg-t');
      $modal.querySelector('[data-action="dlg-no"]').focus();
      const done = (v) => { $modal.removeEventListener('click', onClick); closeModal(); resolve(v); };
      const onClick = (e) => {
        const a = e.target.closest('[data-action]');
        if (!a) return;
        if (a.dataset.action === 'dlg-yes') done(true);
        else if (a.dataset.action === 'dlg-no' || (a.dataset.action === 'modal-backdrop' && e.target === a)) done(false);
      };
      $modal.addEventListener('click', onClick);
      const esc2 = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', esc2); done(false); } };
      document.addEventListener('keydown', esc2);
    });
  }

  // ── Sign-in ───────────────────────────────────────────────────────────────
  function renderLogin(error) {
    $app.innerHTML = '<div class="center-screen"><form class="card login-card" id="login-form" autocomplete="on">' +
      '<div class="brand"><img src="../assets/icon.png" alt=""><div><h1>MoneyFly Admin</h1><p class="muted small">AI model settings</p></div></div>' +
      '<label class="field"><span>Username</span><input name="username" type="text" autocomplete="username" value="admin" required></label>' +
      '<label class="field"><span>Password</span><div class="input-wrap"><input name="password" type="password" autocomplete="current-password" required' + (error ? ' aria-invalid="true"' : '') + ' aria-describedby="login-error">' +
      '<button class="btn ghost sm icon reveal" type="button" data-action="reveal" aria-label="Show password">' + icon('eye') + '</button></div></label>' +
      '<div class="form-error" id="login-error" role="alert">' + (error ? icon('alert') + esc(error) : '') + '</div>' +
      '<button class="btn primary block" type="submit">Sign in</button></form></div>';
    const form = document.getElementById('login-form');
    form.password.focus();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.innerHTML = icon('loader', 'spin') + 'Signing in…';
      const user = form.username.value.trim();
      const { error: err } = await sb.auth.signInWithPassword({ email: user.includes('@') ? user : ADMIN_EMAIL, password: form.password.value });
      if (err) { renderLogin('Wrong username or password.'); return; }
      await bootstrap();
    });
  }

  async function renderMfa() {
    $app.innerHTML = '<div class="center-screen"><div class="card login-card"><p class="muted">' + icon('loader', 'spin') + ' Preparing two-factor sign-in…</p></div></div>';
    const { data: fx, error } = await sb.auth.mfa.listFactors();
    if (error) { await signOut(); renderLogin('Could not load two-factor settings.'); return; }
    const verified = (fx.totp || []).find((f) => f.status === 'verified');

    let factorId, setupHtml = '', title, intro;
    if (verified) {
      factorId = verified.id;
      title = 'Two-factor code';
      intro = 'Enter the 6-digit code from your authenticator app.';
    } else {
      for (const f of (fx.all || [])) if (f.status === 'unverified') await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data: en, error: enErr } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'MoneyFly Admin ' + Date.now() });
      if (enErr) { await signOut(); renderLogin('Could not start two-factor setup: ' + enErr.message); return; }
      factorId = en.id;
      title = 'Set up two-factor';
      intro = 'Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy), then type the 6-digit code it shows.';
      setupHtml = '<div class="qr"><img alt="Two-factor QR code" src="' + esc(en.totp.qr_code) + '"></div>' +
        '<p class="muted small" style="text-align:center">Or type this key manually:</p><div class="secret mono">' + esc(en.totp.secret) + '</div>';
    }

    $app.innerHTML = '<div class="center-screen"><form class="card login-card" id="mfa-form">' +
      '<div class="brand"><img src="../assets/icon.png" alt=""><div><h1>' + title + '</h1></div></div>' +
      '<p class="muted">' + intro + '</p>' + setupHtml +
      '<label class="field"><span>6-digit code</span><input class="code-input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required aria-describedby="mfa-error"></label>' +
      '<div class="form-error" id="mfa-error" role="alert"></div>' +
      '<button class="btn primary block" type="submit">Verify</button>' +
      '<button class="btn ghost block" type="button" data-action="signout">Cancel</button></form></div>';
    const form = document.getElementById('mfa-form');
    form.code.focus();
    form.code.addEventListener('input', () => { if (/^\d{6}$/.test(form.code.value)) form.requestSubmit(); });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.innerHTML = icon('loader', 'spin') + 'Verifying…';
      const { error: vErr } = await sb.auth.mfa.challengeAndVerify({ factorId, code: form.code.value.trim() });
      if (vErr) {
        document.getElementById('mfa-error').innerHTML = icon('alert') + 'That code was not accepted. Try the next one.';
        form.code.setAttribute('aria-invalid', 'true');
        btn.disabled = false; btn.textContent = 'Verify'; form.code.select(); return;
      }
      await bootstrap();
    });
  }

  async function signOut() {
    await sb.auth.signOut();
    state.features = []; state.providers = []; state.routes = [];
    renderLogin();
  }

  function renderSkeleton() {
    $app.innerHTML = '<header class="topbar"><div class="brand"><img src="../assets/icon.png" alt="">MoneyFly <small>Admin</small></div></header>' +
      '<main id="main" aria-busy="true"><div class="skeleton" style="height:56px;width:260px"></div>' +
      '<div class="skeleton" style="height:260px"></div><div class="skeleton" style="height:260px"></div><div class="skeleton" style="height:160px"></div></main>';
  }

  async function bootstrap() {
    const { data } = await sb.auth.getSession();
    if (!data.session) { renderLogin(); return; }
    renderSkeleton();
    try {
      state.email = (await api('whoami')).email;
    } catch (e) {
      if (e.code === 'mfa_required') { await renderMfa(); return; }
      if (e.code === 'not_admin') { await sb.auth.signOut(); renderLogin('This account is not an administrator.'); return; }
      if (e.code === 'unauthenticated') { await sb.auth.signOut(); renderLogin(); return; }
      renderLogin(e.message);
      return;
    }
    if (!(await attempt(loadAll))) { renderLogin('Could not load the settings.'); return; }
    render();
    loadHealth();
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  /** Working copy of one Free/Pro box, built from the saved routes. */
  function buildChain(feature, tier) {
    return state.routes
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
  const isDirty = (f, t) => !!state.chains[f] && !!state.chains[f][t] && snapshot(state.chains[f][t]) !== state.orig[f][t];
  const anyDirty = () => state.features.some((f) => ['free', 'pro'].some((t) => isDirty(f.id, t)));

  function syncChains(force) {
    for (const f of state.features) {
      state.chains[f.id] = state.chains[f.id] || {};
      state.orig[f.id] = state.orig[f.id] || {};
      for (const t of ['free', 'pro']) {
        if (force || !state.chains[f.id][t] || !isDirty(f.id, t)) {
          state.chains[f.id][t] = buildChain(f.id, t);
          state.orig[f.id][t] = snapshot(state.chains[f.id][t]);
        }
      }
    }
  }

  async function loadAll() {
    const r = await api('config');
    state.features = r.features; state.providers = r.providers; state.routes = r.routes;
    syncChains(false);
  }

  /** Last recorded call per feature (quiet: the page works without it). */
  async function loadHealth() {
    try {
      const r = await api('stats', { hours: 24 });
      state.health = r.last_call || {};
      // Update the pills in place — never re-render, so typing is not disturbed.
      state.features.forEach((f) => { const slot = document.querySelector('[data-feature="' + f.id + '"] .health-slot'); if (slot) slot.innerHTML = healthPill(f); });
    } catch { /* optional */ }
  }

  // ── Page ──────────────────────────────────────────────────────────────────
  /** Keep keyboard focus on the same control across a re-render. */
  function focusKey() {
    const el = document.activeElement;
    if (!el || el === document.body || !el.closest) return null;
    const card = el.closest('.feature-card'), box = el.closest('.tier'), row = el.closest('.model');
    return {
      feature: card && card.dataset.feature, tier: box && box.dataset.tier, index: row && row.dataset.index,
      f: el.dataset && el.dataset.f, action: el.dataset && el.dataset.action,
      sel: !card && el.id ? '#' + el.id : null,
    };
  }
  function restoreFocus(k) {
    if (!k) return;
    let sel = null;
    if (k.sel) sel = k.sel;
    else if (k.feature) {
      sel = '[data-feature="' + k.feature + '"]' + (k.tier ? ' .tier[data-tier="' + k.tier + '"]' : '') + (k.index != null ? ' .model[data-index="' + k.index + '"]' : '') +
        (k.f ? ' [data-f="' + k.f + '"]' : k.action ? ' [data-action="' + k.action + '"]' : '');
    }
    const el = sel && document.querySelector(sel);
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }

  function render() {
    const fk = focusKey();
    const y = window.scrollY;
    $app.innerHTML = '<header class="topbar"><div class="brand"><img src="../assets/icon.png" alt="">MoneyFly <small>Admin</small></div><div class="spacer"></div>' +
      '<div class="who"><span class="email">' + esc(state.email) + '</span><button class="btn sm ghost" data-action="signout">' + icon('logout') + 'Sign out</button></div></header>' +
      '<main id="main"><div class="page-head"><div><h2>AI models</h2><p>Pick the provider and model each feature uses for Free and Pro users. If the main model fails, the next one is tried. Changes apply within about 30 seconds.</p></div>' +
      '<button class="btn" id="btn-refresh" data-action="refresh"' + (state.refreshing ? ' disabled' : '') + '>' + icon('refresh', state.refreshing ? 'spin' : '') + 'Refresh</button></div>' +
      banner() + jumpChips() + state.features.map(featureCard).join('') + keysPanel() + '</main>';
    window.scrollTo(0, y);
    restoreFocus(fk);
  }

  function banner() {
    const issues = [];
    for (const p of state.providers) {
      if (!p.enabled || p.key_source !== 'none') continue;
      const n = state.routes.filter((r) => r.provider_id === p.id && r.enabled).length;
      if (n) issues.push(p.label + ' has no API key — ' + n + ' model' + (n === 1 ? '' : 's') + ' using it will fail.');
    }
    const off = state.features.filter((f) => !f.enabled).map((f) => f.label);
    if (off.length) issues.push('Switched off for everyone: ' + off.join(', ') + '.');
    if (!issues.length) return '';
    return '<div class="banner" role="status">' + icon('alert', 'lg') + '<div><strong>Needs attention</strong><ul>' + issues.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul></div></div>';
  }

  const MODALITY_ICON = { text: 'text', image: 'image', audio: 'mic' };
  function jumpChips() {
    return '<nav class="chips" aria-label="Jump to a feature">' + state.features.map((f) =>
      '<a class="chip" href="#feat-' + esc(f.id) + '">' + icon(MODALITY_ICON[f.modality] || 'text') + esc(f.label) + '</a>').join('') +
      '<a class="chip" href="#keys">' + icon('key') + 'API keys</a></nav>';
  }

  function healthPill(f) {
    if (!f.enabled) return '';
    const h = state.health[f.id];
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
    const chain = state.chains[f.id][tier];
    const dirty = isDirty(f.id, tier);
    const saving = !!state.saving[key], saved = !!state.justSaved[key] && !dirty;
    const rows = chain.map((r, i) => modelRow(f, tier, r, i, chain.length)).join('');
    const saveLabel = saving ? icon('loader', 'spin') + 'Saving…' : saved ? icon('check') + 'Saved' : 'Save';
    return '<div class="tier' + (dirty ? ' dirty' : '') + '" data-tier="' + tier + '"><div class="tier-head"><div class="tier-title"><h4>' + title + '</h4></div>' +
      '<div class="tier-actions">' + (dirty ? '<span class="unsaved">Unsaved changes</span><button class="btn sm ghost" data-action="discard">' + icon('undo') + 'Discard</button>' : '') +
      '<button class="btn sm primary' + (saved ? ' saved' : '') + '" data-action="save"' + (dirty && !saving ? '' : ' disabled') + '>' + saveLabel + '</button></div></div>' +
      rows + '<button class="btn sm ghost add-fallback" data-action="add-model">' + icon('plus') + 'Add fallback model</button></div>';
  }

  function modelRow(f, tier, r, i, count) {
    const k = kindOf(provById(r.provider_id));
    const opts = state.providers.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === r.provider_id ? ' selected' : '') + (p.enabled ? '' : ' disabled') + '>' + esc(p.label) + '</option>').join('');
    const t = state.tests[f.id + '/' + tier + '/' + i];
    const testHtml = !t ? '' : t.busy
      ? '<div class="test busy" role="status">' + icon('loader', 'spin') + 'Testing…</div>'
      : t.ok
        ? '<div class="test ok" role="status">' + icon('check') + '<span>Works — replied in ' + (t.latency_ms >= 1000 ? (t.latency_ms / 1000).toFixed(1) + ' s' : t.latency_ms + ' ms') + '</span></div>'
        : '<div class="test err" role="alert">' + icon('alert') + '<span>' + esc(t.error) + '</span></div>';
    const label = i === 0 ? 'Main model' : 'Fallback ' + i;
    return '<div class="model" data-index="' + i + '"><div class="model-label"><span class="n">' + (i + 1) + '</span>' + label + '</div>' +
      '<div class="model-fields' + (k === 'openrouter' ? ' has-or' : '') + '">' +
      '<label class="field"><span>Provider</span><select data-f="provider_id">' + opts + '</select></label>' +
      '<label class="field"><span>Model name</span><input data-f="model" type="text" list="dl-' + esc(r.provider_id) + '" value="' + esc(r.model) + '" placeholder="e.g. openai/gpt-oss-120b" spellcheck="false" autocomplete="off"></label>' +
      (k === 'openrouter' ? '<label class="field"><span>OpenRouter provider <em style="font-style:normal;font-weight:400">(optional)</em></span><input data-f="orProvider" type="text" list="dl-orprov" value="' + esc(r.orProvider) + '" placeholder="automatic" spellcheck="false" autocomplete="off"></label>' : '') +
      '<div class="model-actions"><button class="btn sm" data-action="test"' + (t && t.busy ? ' disabled' : '') + '>' + icon('play') + 'Test</button>' +
      (count > 1 ? '<button class="btn sm danger icon" data-action="remove-model" aria-label="Remove ' + label.toLowerCase() + '">' + icon('x') + '</button>' : '') + '</div></div>' + testHtml + '</div>';
  }

  // ── API keys ──────────────────────────────────────────────────────────────
  function keysPanel() {
    const rows = state.providers.map((p) => {
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
      await attempt(loadAll); render();
    });
  }

  // ── Model suggestions (loaded quietly the first time a provider is used) ──
  function updateDatalists() {
    document.getElementById('datalists').innerHTML =
      '<datalist id="dl-orprov"><option value="google-ai-studio"></option><option value="DeepInfra"></option></datalist>' +
      Object.entries(state.models).map(([pid, list]) => '<datalist id="dl-' + esc(pid) + '">' + list.map((m) => '<option value="' + esc(m) + '"></option>').join('') + '</datalist>').join('');
  }
  async function ensureModels(providerId) {
    if (state.models[providerId] !== undefined) return;
    state.models[providerId] = [];
    try {
      const r = await api('list_models', { provider_id: providerId });
      if (r.ok) { state.models[providerId] = r.models; updateDatalists(); }
    } catch { /* suggestions are optional */ }
  }

  // ── Events ────────────────────────────────────────────────────────────────
  const rowOf = (el) => {
    const card = el.closest('.feature-card'), box = el.closest('.tier'), model = el.closest('.model');
    if (!card || !box || !box.dataset.tier) return null;
    const feature = card.dataset.feature, tier = box.dataset.tier;
    return { feature, tier, chain: state.chains[feature][tier], index: model ? Number(model.dataset.index) : -1 };
  };

  async function saveBox(feature, tier) {
    const chain = state.chains[feature][tier], key = feature + '/' + tier;
    if (chain.some((r) => !r.model.trim())) { toast('Every row needs a model name.', 'err'); return; }
    const attempts = chain.map((r) => ({ provider_id: r.provider_id, model: r.model.trim(), params: paramsFor(r) }));
    state.saving[key] = true; render();
    const ok = await attempt(() => api('save_chain', { feature, tier, attempts }), (tier === 'free' ? 'Free' : 'Pro') + ' models saved');
    state.saving[key] = false;
    if (!ok) { render(); return; }
    Object.keys(state.tests).forEach((k) => { if (k.startsWith(key + '/')) delete state.tests[k]; });
    await attempt(loadAll);
    state.chains[feature][tier] = buildChain(feature, tier);
    state.orig[feature][tier] = snapshot(state.chains[feature][tier]);
    state.justSaved[key] = true;
    render();
    setTimeout(() => { delete state.justSaved[key]; if (document.getElementById('main') && !$modal.firstChild) render(); }, 2200);
  }

  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action;
    if (a === 'modal-backdrop') { if (ev.target === t && !$modal.querySelector('[data-action="dlg-yes"]')) closeModal(); return; }
    if (a === 'close-modal') return closeModal();
    if (a === 'dlg-yes' || a === 'dlg-no') return;           // handled by askConfirm
    if (a === 'signout') return signOut();
    if (a === 'reveal') {
      const input = t.closest('.input-wrap').querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      t.innerHTML = icon(show ? 'eyeOff' : 'eye');
      t.setAttribute('aria-label', show ? 'Hide' : 'Show');
      return;
    }
    if (a === 'refresh') {
      state.refreshing = true; render();
      await attempt(loadAll); await loadHealth();
      state.refreshing = false; render(); toast('Refreshed');
      return;
    }

    if (a === 'set-key') return keyForm(t.closest('[data-provider]').dataset.provider);
    if (a === 'clear-key') {
      const id = t.closest('[data-provider]').dataset.provider;
      if (!(await askConfirm({ title: 'Remove the saved key?', message: provById(id).label + ' will go back to the key already on the server, if there is one. Requests fail if there is not.', confirmLabel: 'Remove key', danger: true }))) return;
      if (await attempt(() => api('clear_provider_key', { id }), 'Key removed')) { await attempt(loadAll); render(); }
      return;
    }

    const ctx = rowOf(t);
    if (!ctx) return;
    const { feature, tier, chain, index } = ctx;

    if (a === 'add-model') {
      const last = chain[chain.length - 1] || {};
      chain.push({ provider_id: last.provider_id || (state.providers.find((p) => p.enabled) || {}).id, model: '', params: {}, orProvider: '' });
      render();
      const rows = document.querySelectorAll('[data-feature="' + feature + '"] .tier[data-tier="' + tier + '"] .model');
      const inp = rows[rows.length - 1] && rows[rows.length - 1].querySelector('[data-f="model"]');
      if (inp) inp.focus();
      return;
    }
    if (a === 'remove-model') { chain.splice(index, 1); Object.keys(state.tests).forEach((k) => { if (k.startsWith(feature + '/' + tier + '/')) delete state.tests[k]; }); return render(); }
    if (a === 'discard') {
      state.chains[feature][tier] = buildChain(feature, tier);
      Object.keys(state.tests).forEach((k) => { if (k.startsWith(feature + '/' + tier + '/')) delete state.tests[k]; });
      return render();
    }
    if (a === 'test') {
      const row = chain[index], key = feature + '/' + tier + '/' + index;
      if (!row.model.trim()) { toast('Type a model name first.', 'err'); return; }
      state.tests[key] = { busy: true, ok: true }; render();
      const r = await attempt(() => api('test_route', { provider_id: row.provider_id, model: row.model.trim(), params: paramsFor(row) }));
      state.tests[key] = r || { ok: false, error: 'The test did not complete.' };
      render();
      return;
    }
    if (a === 'save') return saveBox(feature, tier);
  });

  document.addEventListener('input', (ev) => {
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
    delete state.justSaved[ctx.feature + '/' + ctx.tier];
  });

  document.addEventListener('focusin', (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.f === 'model') { const ctx = rowOf(el); if (ctx) ensureModels(ctx.chain[ctx.index].provider_id); }
  });

  document.addEventListener('change', async (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.f === 'provider_id') {
      const ctx = rowOf(el);
      if (!ctx) return;
      const row = ctx.chain[ctx.index];
      row.provider_id = el.value;
      row.params = paramsFor(row);                       // drop settings that belong to the old provider
      if (kindOf(provById(row.provider_id)) !== 'openrouter') row.orProvider = '';
      render();
      return;
    }
    if (el.dataset && el.dataset.action === 'toggle-feature') {
      const f = state.features.find((x) => x.id === el.dataset.id);
      const want = el.checked;
      if (!want && !(await askConfirm({ title: 'Turn off "' + f.label + '"?', message: 'It will be unavailable for ALL users until you turn it back on. The app treats it like a provider failure.', confirmLabel: 'Turn off', danger: true }))) { el.checked = true; return; }
      if (await attempt(() => api('save_feature', { id: f.id, enabled: want }), want ? f.label + ' is on' : f.label + ' is off')) await attempt(loadAll);
      render();
    }
  });

  // Ctrl/Cmd+S saves the box you are editing.
  document.addEventListener('keydown', (ev) => {
    if (!((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 's')) return;
    const ctx = document.activeElement && document.activeElement.closest && rowOf(document.activeElement);
    if (!ctx) return;
    ev.preventDefault();
    if (isDirty(ctx.feature, ctx.tier) && !state.saving[ctx.feature + '/' + ctx.tier]) saveBox(ctx.feature, ctx.tier);
  });

  window.addEventListener('beforeunload', (ev) => { if (anyDirty()) { ev.preventDefault(); ev.returnValue = ''; } });

  sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') renderLogin(); });

  updateDatalists();
  bootstrap();
})();
