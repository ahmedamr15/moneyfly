/* Prompts tab — edit the instructions the AI models are given, with versions and a safe way back. */
(() => {
  'use strict';
  const App = window.AdminApp;
  const { api, attempt, toast, icon, esc, when, askConfirm } = App;

  const TESTABLE = { 'sms-parse': 'Paste a bank SMS…', 'voice-text': 'Type what someone might say, e.g. "paid 150 for lunch and 40 for a taxi"', 'ai-chat': 'Ask a question, e.g. "How much did I spend on food this month?"' };
  const SAMPLES = { 'sms-parse': 'Your credit card ending 1234 was charged EGP 245.50 at CARREFOUR MAADI on 14-10 15:42. Available limit EGP 54,300.', 'voice-text': 'paid 150 for lunch and 40 for a taxi', 'ai-chat': 'How much did I spend on food this month?' };

  const S = { list: [], feature: null, detail: null, text: '', note: '', loadedText: '', sample: '', testOut: null, testing: false, saving: false, loadingDetail: false };

  const isDirty = () => !!S.detail && S.text !== S.loadedText;

  async function select(feature) {
    if (isDirty() && !(await askConfirm({ title: 'Discard your edits?', message: 'You have unsaved changes to this prompt.', confirmLabel: 'Discard', danger: true }))) return;
    S.feature = feature; S.loadingDetail = true; S.testOut = null; App.render();
    const d = await attempt(() => api('prompt_get', { feature }));
    S.loadingDetail = false;
    if (!d) { S.feature = null; App.render(); return; }
    S.detail = d;
    const active = d.versions.find((v) => v.is_active);
    S.loadedText = active ? active.body : d.default; S.text = S.loadedText; S.note = '';
    S.sample = SAMPLES[feature] || '';
    App.render();
  }

  async function loadList() { S.list = (await api('prompts_list')).prompts; }

  function status(p) {
    return p.active_version ? '<span class="badge warn">Custom · version ' + p.active_version + '</span>' : '<span class="badge ok">Built-in default</span>';
  }

  function editor() {
    if (S.loadingDetail) return '<div class="skeleton" style="height:420px"></div>';
    const d = S.detail;
    if (!d) return '<div class="empty">Choose a feature to see and edit its instructions.</div>';
    const active = d.versions.find((v) => v.is_active);
    const chips = d.required.map((p) => '<button class="chip" type="button" data-action="insert" data-ph="' + p + '" title="Insert at the cursor">{{' + p + '}} <span class="muted small">required</span></button>').concat(
      d.optional.map((p) => '<button class="chip" type="button" data-action="insert" data-ph="' + p + '">{{' + p + '}} <span class="muted small">optional</span></button>')).join('');
    const versions = d.versions.length ? '<details class="panel-details"><summary>Saved versions (' + d.versions.length + ')</summary><div class="stack" style="margin-top:12px">' + d.versions.map((v) =>
      '<div class="hist" data-version="' + v.version + '"><div><strong>Version ' + v.version + '</strong> ' + (v.is_active ? '<span class="badge warn">in use</span>' : '') + ' <span class="muted small">' + esc(when(v.created_at)) + ' · ' + esc(v.created_by || '') + '</span>' +
      (v.note ? '<div class="small muted">' + esc(v.note) + '</div>' : '') + '</div><div class="row-actions"><button class="btn sm" data-action="load-version">Load into editor</button>' +
      (v.is_active ? '' : '<button class="btn sm" data-action="use-version">Use this version</button>') + '</div></div>').join('') + '</div></details>' : '';
    const test = TESTABLE[d.feature]
      ? '<section class="panel"><header><h3>' + icon('play', 'lg') + 'Try it</h3><span class="muted small">Runs the text in the editor (saved or not) on the first Free model. Not saved, not logged.</span></header><div class="body stack">' +
        '<label class="field"><span>Sample input</span><textarea id="p-sample" rows="3" placeholder="' + esc(TESTABLE[d.feature]) + '">' + esc(S.sample) + '</textarea></label>' +
        '<div><button class="btn" data-action="try"' + (S.testing ? ' disabled' : '') + '>' + (S.testing ? icon('loader', 'spin') + 'Running…' : icon('play') + 'Try this prompt') + '</button></div>' +
        (S.testOut ? (S.testOut.ok ? '<div class="test ok">' + icon('check') + '<span>' + esc(S.testOut.model) + ' · ' + App.ms(S.testOut.latency_ms) + '</span></div><pre class="reply-pre">' + esc(S.testOut.content) + '</pre>' : '<div class="test err" role="alert">' + icon('alert') + '<span>' + esc(S.testOut.error) + '</span></div>') : '') +
        '</div></section>' : '';
    return '<section class="panel"><header><h3>' + esc(d.label) + '</h3><div>' + (active ? '<span class="badge warn">Editing from version ' + active.version + '</span>' : '<span class="badge ok">Editing the built-in default</span>') + '</div></header><div class="body stack">' +
      '<div class="callout">' + icon('info') + '<span>' + esc(d.note) + '</span></div>' +
      '<div class="chips" aria-label="Placeholders">' + chips + '</div>' +
      '<label class="field"><span>Instructions</span><textarea id="p-body" class="code" rows="22" spellcheck="false">' + esc(S.text) + '</textarea></label>' +
      '<label class="field"><span>What changed? <em class="muted">(optional note)</em></span><input id="p-note" type="text" maxlength="200" value="' + esc(S.note) + '" placeholder="e.g. Stricter about decimal amounts"></label>' +
      '<div class="toolbar"><button class="btn primary" data-action="save"' + (S.saving || !isDirty() ? ' disabled' : '') + '>' + (S.saving ? icon('loader', 'spin') + 'Saving…' : 'Save as new version and use it') + '</button>' +
      '<button class="btn ghost" data-action="revert"' + (isDirty() ? '' : ' disabled') + '>' + icon('undo') + 'Revert editor</button>' +
      '<span class="spacer"></span><button class="btn danger" data-action="reset"' + (active ? '' : ' disabled') + '>Go back to the built-in default</button></div>' + versions + '</div></section>' + test;
  }

  function render() {
    const cards = S.list.map((p) => '<button class="prompt-card' + (S.feature === p.feature ? ' selected' : '') + '" data-action="select" data-feature="' + esc(p.feature) + '"><span class="pc-title">' + esc(p.label) + '</span>' + status(p) + '</button>').join('');
    return '<div class="page-head"><div><h2>Prompts</h2><p>The instructions each AI feature gives the model. Changes apply within about 30 seconds. Every saved version is kept, and the built-in default is always one click away. The app depends on the reply format, so keep the notes in mind.</p></div></div>' +
      '<div class="prompt-layout"><aside class="prompt-list" aria-label="Features">' + cards + '</aside><div class="stack">' + editor() + '</div></div>';
  }

  async function click(a, t) {
    if (a === 'select') return select(t.dataset.feature);
    if (a === 'insert') {
      const ta = document.getElementById('p-body'), ph = '{{' + t.dataset.ph + '}}';
      const s = ta.selectionStart, e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + ph + ta.value.slice(e);
      ta.focus(); ta.selectionStart = ta.selectionEnd = s + ph.length;
      S.text = ta.value; App.render();
      return;
    }
    if (a === 'revert') { S.text = S.loadedText; return App.render(); }
    if (a === 'load-version') {
      const v = S.detail.versions.find((x) => x.version === Number(t.closest('[data-version]').dataset.version));
      S.text = v.body; S.note = 'Based on version ' + v.version; App.render(); toast('Loaded version ' + v.version + ' into the editor.');
      return;
    }
    if (a === 'use-version') {
      const n = Number(t.closest('[data-version]').dataset.version);
      if (!(await attempt(() => api('prompt_activate', { feature: S.feature, version: n }), 'Now using version ' + n))) return;
      await attempt(loadList); await select2(S.feature); return;
    }
    if (a === 'save') {
      S.text = document.getElementById('p-body').value; S.note = document.getElementById('p-note').value;
      S.saving = true; App.render();
      const r = await attempt(() => api('prompt_save', { feature: S.feature, body: S.text, note: S.note }), 'Saved and in use');
      S.saving = false;
      if (!r) { App.render(); return; }
      await attempt(loadList); await select2(S.feature); return;
    }
    if (a === 'reset') {
      if (!(await askConfirm({ title: 'Go back to the built-in default?', message: 'The AI will use the original instructions again. Your saved versions stay in the list.', confirmLabel: 'Use the default', danger: true }))) return;
      if (!(await attempt(() => api('prompt_reset', { feature: S.feature }), 'Using the built-in default'))) return;
      await attempt(loadList); await select2(S.feature); return;
    }
    if (a === 'try') {
      S.text = document.getElementById('p-body').value; S.sample = document.getElementById('p-sample').value;
      S.testing = true; S.testOut = null; App.render();
      const r = await attempt(() => api('prompt_test', { feature: S.feature, body: S.text, sample: S.sample }));
      S.testing = false; S.testOut = r || { ok: false, error: 'The test did not complete.' }; App.render();
    }
  }
  /** Reload the open feature without the "discard edits?" prompt. */
  async function select2(feature) { S.loadedText = S.text; S.feature = null; S.detail = null; await select(feature); }

  function input(ev) {
    const id = ev.target.id;
    if (id === 'p-body') {
      S.text = ev.target.value;
      const b = document.querySelector('[data-action="save"]'); if (b) b.disabled = S.saving || !isDirty();
      const r = document.querySelector('[data-action="revert"]'); if (r) r.disabled = !isDirty();
    } else if (id === 'p-note') S.note = ev.target.value;
    else if (id === 'p-sample') S.sample = ev.target.value;
  }

  App.register('prompts', {
    title: 'Prompts',
    async load() { await loadList(); },
    render, click, input, dirty: isDirty,
    reset() { S.list = []; S.feature = null; S.detail = null; S.text = ''; S.loadedText = ''; },
  });
})();
