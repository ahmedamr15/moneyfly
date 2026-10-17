/* MoneyFly Admin — core: sign-in, two-factor, API calls, dialogs, tabs.
 *
 * Each tab lives in its own file (models.js, users.js, …) and registers itself with
 * AdminApp.register(). Everything talks only to the `admin-api` edge function, which
 * re-checks admin + 2FA on every call. API keys are write-only. */
(() => {
  'use strict';

  // The anon key is public by design (it ships inside the iOS app too).
  const SUPABASE_URL = 'https://llhpxikoymctlthdjybo.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaHB4aWtveW1jdGx0aGRqeWJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMDc1NDQsImV4cCI6MjA5NTU4MzU0NH0.vQrvuHAUQGxHCMuMZsoeWVW5Bb0jiuAO4p3gm7rdKBY';
  // Supabase Auth signs in with an email; typing "admin" maps to this address.
  const ADMIN_EMAIL = 'admin@moneyfly.internal';
  const API_URL = SUPABASE_URL + '/functions/v1/admin-api';
  const IDLE_MINUTES = 30;

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // sessionStorage: closing the tab signs the admin out.
    auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const App = window.AdminApp = { sb, views: {}, order: [], current: 'models', email: '', userId: '' };
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
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  };
  const icon = (name, extra) => '<svg class="i ' + (extra || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';

  // ── Utilities ─────────────────────────────────────────────────────────────
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const fmt = (n) => (n == null ? '–' : new Intl.NumberFormat().format(Number(n)));
  const ms = (n) => (n == null ? '–' : n >= 1000 ? (n / 1000).toFixed(1) + ' s' : n + ' ms');
  function ago(iso) {
    if (!iso) return 'never';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return Math.floor(s / 86400) + ' d ago';
  }
  function dur(seconds) {
    if (seconds == null) return '–';
    if (seconds < 90) return Math.round(seconds) + ' s';
    if (seconds < 5400) return Math.round(seconds / 60) + ' min';
    if (seconds < 172800) return Math.round(seconds / 3600) + ' h';
    return Math.round(seconds / 86400) + ' d';
  }
  const when = (iso) => (iso ? new Date(iso).toLocaleString() : '–');

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
  function openModal(html, labelId, wide) {
    lastFocus = document.activeElement;
    $modal.innerHTML = '<div class="overlay" data-action="modal-backdrop"><div class="modal' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="' + labelId + '">' + html + '</div></div>';
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
  function askConfirm({ title, message, confirmLabel, danger, typeToConfirm }) {
    return new Promise((resolve) => {
      openModal('<h3 id="dlg-t">' + esc(title) + '</h3><p class="muted">' + esc(message) + '</p>' +
        (typeToConfirm ? '<label class="field"><span>Type ' + esc(typeToConfirm) + ' to confirm</span><input id="dlg-type" type="text" autocomplete="off" spellcheck="false"></label>' : '') +
        '<div class="actions"><button class="btn" type="button" data-action="dlg-no">Cancel</button>' +
        '<button class="btn ' + (danger ? 'danger-solid' : 'primary') + '" type="button" data-action="dlg-yes"' + (typeToConfirm ? ' disabled' : '') + '>' + esc(confirmLabel || 'Confirm') + '</button></div>', 'dlg-t');
      const yes = $modal.querySelector('[data-action="dlg-yes"]');
      const typed = $modal.querySelector('#dlg-type');
      if (typed) typed.addEventListener('input', () => { yes.disabled = typed.value.trim() !== typeToConfirm; });
      else $modal.querySelector('[data-action="dlg-no"]').focus();
      const done = (v) => { $modal.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); closeModal(); resolve(v); };
      const onClick = (e) => {
        const a = e.target.closest('[data-action]');
        if (!a) return;
        if (a.dataset.action === 'dlg-yes' && !a.disabled) done(true);
        else if (a.dataset.action === 'dlg-no' || (a.dataset.action === 'modal-backdrop' && e.target === a)) done(false);
      };
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      $modal.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);
    });
  }

  // ── Sign-in ───────────────────────────────────────────────────────────────
  function renderLogin(error) {
    $app.innerHTML = '<div class="center-screen"><form class="card login-card" id="login-form" autocomplete="on">' +
      '<div class="brand"><img src="../assets/icon.png" alt=""><div><h1>MoneyFly Admin</h1><p class="muted small">Control panel</p></div></div>' +
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

  async function signOut(message) {
    await sb.auth.signOut();
    for (const id of App.order) if (App.views[id].reset) App.views[id].reset();
    renderLogin(message);
  }

  // ── Shell, tabs, views ────────────────────────────────────────────────────
  App.register = (id, view) => { App.views[id] = view; App.order.push(id); };
  App.api = api; App.attempt = attempt; App.toast = toast; App.icon = icon; App.esc = esc; App.clone = clone;
  App.fmt = fmt; App.ms = ms; App.ago = ago; App.dur = dur; App.when = when;
  App.openModal = openModal; App.closeModal = closeModal; App.askConfirm = askConfirm; App.ApiError = ApiError;
  App.signOut = signOut;

  function skeleton() {
    return '<div class="skeleton" style="height:56px;width:260px"></div><div class="skeleton" style="height:240px"></div><div class="skeleton" style="height:240px"></div>';
  }

  /** Keep keyboard focus on the same control across a re-render. */
  function focusKey() {
    const el = document.activeElement;
    if (!el || el === document.body || !el.closest || !el.closest('#main')) return null;
    const path = [];
    for (let n = el; n && n.id !== 'main'; n = n.parentElement) {
      const p = n.parentElement; if (!p) break;
      path.unshift(Array.prototype.indexOf.call(p.children, n));
    }
    return { path, id: el.id || null };
  }
  function restoreFocus(k) {
    if (!k) return;
    let el = k.id && document.getElementById(k.id);
    if (!el) {
      el = document.getElementById('main');
      for (const i of k.path) { el = el && el.children[i]; }
    }
    if (el && el.focus && !el.disabled) el.focus({ preventScroll: true });
  }

  App.render = () => {
    const view = App.views[App.current];
    const main = document.getElementById('main');
    if (!view || !main) return;
    const fk = focusKey(), y = window.scrollY;
    main.innerHTML = view.render();
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === App.current));
    if (view.mount) view.mount(main);
    window.scrollTo(0, y);
    restoreFocus(fk);
  };

  async function show(id) {
    if (!App.views[id]) return;
    App.current = id;
    try { window.sessionStorage.setItem('admin_tab', id); } catch { /* optional */ }
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === id));
    const view = App.views[id], main = document.getElementById('main');
    if (view.load) {
      main.innerHTML = skeleton();
      main.setAttribute('aria-busy', 'true');
      await attempt(() => view.load());
      main.removeAttribute('aria-busy');
      if (App.current !== id) return;       // user moved on while it loaded
    }
    App.render();
  }
  App.show = show;

  function renderShell() {
    $app.innerHTML = '<header class="topbar"><div class="brand"><img src="../assets/icon.png" alt="">MoneyFly <small>Admin</small></div>' +
      '<nav class="tabs" aria-label="Sections">' + App.order.map((id) => '<button class="tab" data-action="nav" data-view="' + id + '">' + esc(App.views[id].title) + '</button>').join('') + '</nav>' +
      '<div class="who"><span class="email">' + esc(App.email) + '</span><button class="btn sm ghost" data-action="signout">' + icon('logout') + '<span class="hide-sm">Sign out</span></button></div></header>' +
      '<main id="main"></main>';
  }

  async function bootstrap() {
    const { data } = await sb.auth.getSession();
    if (!data.session) { renderLogin(); return; }
    $app.innerHTML = '<header class="topbar"><div class="brand"><img src="../assets/icon.png" alt="">MoneyFly <small>Admin</small></div></header><main id="main" aria-busy="true">' + skeleton() + '</main>';
    try {
      const who = await api('whoami');
      App.email = who.email;
    } catch (e) {
      if (e.code === 'mfa_required') { await renderMfa(); return; }
      if (e.code === 'not_admin') { await sb.auth.signOut(); renderLogin('This account is not an administrator.'); return; }
      if (e.code === 'unauthenticated') { await sb.auth.signOut(); renderLogin(); return; }
      renderLogin(e.message);
      return;
    }
    renderShell();
    let tab = 'models';
    try { tab = window.sessionStorage.getItem('admin_tab') || 'models'; } catch { /* optional */ }
    await show(App.views[tab] ? tab : 'models');
  }

  // ── Events ────────────────────────────────────────────────────────────────
  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action;
    if (a === 'modal-backdrop') { if (ev.target === t && !$modal.querySelector('[data-action="dlg-yes"]')) closeModal(); return; }
    if (a === 'close-modal') return closeModal();
    if (a === 'dlg-yes' || a === 'dlg-no') return;           // handled by askConfirm
    if (a === 'signout') return signOut();
    if (a === 'nav') return show(t.dataset.view);
    if (a === 'reveal') {
      const input = t.closest('.input-wrap').querySelector('input');
      const showIt = input.type === 'password';
      input.type = showIt ? 'text' : 'password';
      t.innerHTML = icon(showIt ? 'eyeOff' : 'eye');
      t.setAttribute('aria-label', showIt ? 'Hide' : 'Show');
      return;
    }
    const view = App.views[App.current];
    if (view && view.click) await view.click(a, t, ev);
  });
  for (const type of ['input', 'change', 'focusin', 'keydown', 'submit']) {
    document.addEventListener(type, (ev) => {
      const view = App.views[App.current];
      if (view && view[type] && ev.target.closest && ev.target.closest('#main, #modal-root')) view[type](ev);
    });
  }

  // Leave-page warning while a tab has unsaved edits.
  window.addEventListener('beforeunload', (ev) => {
    const view = App.views[App.current];
    if (view && view.dirty && view.dirty()) { ev.preventDefault(); ev.returnValue = ''; }
  });

  // Sign out after 30 idle minutes.
  let idleTimer = null;
  function bumpIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) signOut('You were signed out after ' + IDLE_MINUTES + ' minutes of inactivity.');
    }, IDLE_MINUTES * 60 * 1000);
  }
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach((e) => document.addEventListener(e, bumpIdle, { passive: true }));
  bumpIdle();

  sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') renderLogin(); });

  App.start = bootstrap;
})();
