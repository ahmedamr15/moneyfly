/* Account tab — your password and authenticator, and who else can use this console. */
(() => {
  'use strict';
  const App = window.AdminApp;
  const { api, attempt, toast, icon, esc, when, ago, askConfirm, sb } = App;

  const S = { admins: [], me: null, busy: '' };

  async function load() {
    const r = await api('admin_list');
    S.admins = r.admins; S.me = r.me;
  }

  function render() {
    const me = S.admins.find((a) => a.user_id === S.me);
    const rows = S.admins.map((a) => '<tr data-id="' + esc(a.user_id) + '"><td>' + esc(a.email) + (a.user_id === S.me ? ' <span class="badge info">you</span>' : '') + '</td><td class="muted">' + esc(a.last_sign_in_at ? ago(a.last_sign_in_at) : 'never') + '</td><td class="muted">' + esc(when(a.created_at)) + '</td>' +
      '<td class="num">' + (a.user_id === S.me ? '' : '<button class="btn sm danger" data-action="remove-admin">Remove</button>') + '</td></tr>').join('');
    return '<div class="page-head"><div><h2>Account</h2><p>Your sign-in and who else can use this console. You are signed out automatically after 30 minutes of inactivity.</p></div></div>' +
      '<section class="panel"><header><h3>' + icon('lock', 'lg') + 'Password</h3><span class="muted small">Signed in as ' + esc(me ? me.email : App.email) + '</span></header><form class="body stack narrow" id="pw-form" autocomplete="off">' +
      '<label class="field"><span>New password <em class="muted">(at least 12 characters)</em></span><div class="input-wrap"><input name="pw1" type="password" autocomplete="new-password" minlength="12" required><button class="btn ghost sm icon reveal" type="button" data-action="reveal" aria-label="Show password">' + icon('eye') + '</button></div></label>' +
      '<label class="field"><span>Repeat it</span><input name="pw2" type="password" autocomplete="new-password" minlength="12" required></label>' +
      '<div class="form-error" id="pw-error" role="alert"></div>' +
      '<div><button class="btn primary" type="submit"' + (S.busy === 'pw' ? ' disabled' : '') + '>' + (S.busy === 'pw' ? icon('loader', 'spin') + 'Changing…' : 'Change password') + '</button></div></form></section>' +
      '<section class="panel"><header><h3>' + icon('shield', 'lg') + 'Authenticator app</h3></header><div class="body stack narrow"><p class="muted">Lost your phone or switching apps? Remove the current authenticator. You will be signed out, and the next sign-in shows a new QR code to scan. Do this only while you can still sign in.</p>' +
      '<div><button class="btn danger" data-action="reset-mfa"' + (S.busy === 'mfa' ? ' disabled' : '') + '>Reset my authenticator…</button></div></div></section>' +
      '<section class="panel"><header><h3>' + icon('user', 'lg') + 'Administrators</h3></header>' +
      '<div class="table-wrap"><table><thead><tr><th>Account</th><th>Last sign-in</th><th>Added</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<form class="body search-row" id="admin-add"><label class="field grow"><span>Add an administrator <em class="muted">(must already have an account — exact email)</em></span><input name="email" type="email" autocomplete="off" spellcheck="false" placeholder="name@example.com" required></label>' +
      '<button class="btn" type="submit">' + icon('plus') + 'Add</button></form>' +
      '<div class="body"><p class="muted small">A new administrator signs in at this page with their own app password and must set up their own authenticator on first sign-in. Only add people you fully trust: this console can change AI keys and turn features off.</p></div></section>';
  }

  async function changePassword(f) {
    const err = document.getElementById('pw-error');
    err.innerHTML = '';
    if (f.pw1.value !== f.pw2.value) { err.innerHTML = icon('alert') + 'The two passwords do not match.'; return; }
    if (f.pw1.value.length < 12) { err.innerHTML = icon('alert') + 'Use at least 12 characters.'; return; }
    S.busy = 'pw'; App.render();
    const { error } = await sb.auth.updateUser({ password: f.pw1.value });
    S.busy = '';
    if (error) { App.render(); document.getElementById('pw-error').innerHTML = icon('alert') + esc(error.message); return; }
    toast('Password changed');
    App.render();
  }

  async function click(a, t) {
    if (a === 'reset-mfa') {
      if (!(await askConfirm({ title: 'Reset your authenticator?', message: 'You will be signed out. At the next sign-in you scan a new QR code with your authenticator app.', confirmLabel: 'Reset and sign out', danger: true }))) return;
      S.busy = 'mfa'; App.render();
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) { S.busy = ''; App.render(); toast(error.message, 'err'); return; }
      for (const f of (data.all || [])) {
        const r = await sb.auth.mfa.unenroll({ factorId: f.id });
        if (r.error) { S.busy = ''; App.render(); toast(r.error.message, 'err'); return; }
      }
      S.busy = '';
      await App.signOut('Authenticator removed. Sign in again to set up a new one.');
      return;
    }
    if (a === 'remove-admin') {
      const tr = t.closest('tr');
      if (!(await askConfirm({ title: 'Remove this administrator?', message: tr.children[0].textContent + ' will no longer be able to use this console.', confirmLabel: 'Remove', danger: true }))) return;
      if (await attempt(() => api('admin_remove', { user_id: tr.dataset.id }), 'Administrator removed')) { await attempt(load); App.render(); }
    }
  }

  async function submit(ev) {
    const f = ev.target;
    if (f.id === 'pw-form') { ev.preventDefault(); changePassword(f); }
    else if (f.id === 'admin-add') {
      ev.preventDefault();
      if (await attempt(() => api('admin_add', { email: f.email.value }), 'Administrator added')) { f.email.value = ''; await attempt(load); App.render(); }
    }
  }

  App.register('account', { title: 'Account', load, render, click, submit, reset() { S.admins = []; S.me = null; } });
})();
