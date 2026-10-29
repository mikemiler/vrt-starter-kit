// The dashboard page. It asks the local server for the current state every
// few seconds and redraws only the parts that changed.
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
const LABEL = { changed: 'Changed', ok: 'Same', new: 'No baseline', error: 'Error' };

let state = null;
const drawn = {}; // last drawn data per section, to skip redraws that change nothing

async function api(method, url, body) {
  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

function draw(key, data, fn) {
  const json = JSON.stringify(data);
  if (drawn[key] === json) return;
  drawn[key] = json;
  fn(data);
}

function lockedCard(el, step, title) {
  el.className = 'card locked';
  el.innerHTML = `<h2>${esc(title)}<span class="lock">🔒 Step ${step}</span></h2>
    <p class="hint">Unlocks in Step ${step}: ${esc(state.steps[step])}.</p>`;
}

// ------------------------------------------------------------ top bar
function renderSteps({ step, steps }) {
  $('#steps').innerHTML = Object.entries(steps).map(([key, name]) => {
    const n = Number(key);
    const label = n === 0 ? '↺ Start' : `${n <= step ? '✓' : n} ${esc(name)}`;
    return `<li><button class="${n <= step ? 'done' : ''} ${n === step ? 'current' : ''}" data-step="${n}"
      title="${n === step ? 'You are here' : n < step ? `Go back to Step ${n}` : `Go to Step ${n}`}">${label}</button></li>`;
  }).join('');
}

$('#steps').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-step]');
  if (!btn) return;
  const n = Number(btn.dataset.step);
  if (n === state.step) return;
  if (n < state.step && !confirm(`Go back to ${n === 0 ? 'the start' : `Step ${n}`}? Everything after it is locked again. Your pages and snippets stay.`)) return;
  switchStep(n, btn);
});

// Fallback: the instructor shows a code word, attendees type it in.
const codeBtn = document.getElementById('code-btn');
codeBtn.onclick = () => {
  const el = $('#unlock');
  el.hidden = false;
  el.innerHTML = `<form class="code-form" id="code-form">
      <label for="code-input"><strong>Code from the slide</strong></label>
      <input id="code-input" autocomplete="off" placeholder="e.g. maple" required>
      <button class="btn" type="submit">🔓 Unlock</button>
      <button class="btn" type="button" id="code-cancel">Cancel</button>
    </form>`;
  $('#code-input').focus();
  $('#code-cancel').onclick = () => { drawn.unlock = undefined; el.hidden = true; refresh(); };
  $('#code-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter || $('#code-form button');
    btn.disabled = true; btn.textContent = 'Unlocking…';
    try {
      const { step } = await api('POST', '/api/unlock-code', { code: $('#code-input').value });
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const s = await api('GET', '/api/state').catch(() => null);
        if (s && s.step === step) return location.reload();
      }
      location.reload();
    } catch (err) {
      btn.disabled = false; btn.textContent = '🔓 Unlock';
      alert(err.message);
    }
  };
  codeOpen = true;
};
let codeOpen = false;

// Steps are unlocked only with the code from the slides (button top right),
// so there is no automatic "Step N is ready" bar any more.
function renderUnlock() {
  if (!codeOpen) $('#unlock').hidden = true;
}

async function switchStep(n, btn) {
  const text = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Switching…';
  try {
    await api('POST', '/api/switch', { step: n });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = text;
    return alert(err.message);
  }
  // The dashboard restarts with the new building blocks. Wait for it, then reload.
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const s = await api('GET', '/api/state').catch(() => null);
    if (s && s.step === n) return location.reload();
  }
  location.reload();
}

// ------------------------------------------------------------ pages
function renderPages({ pages, viewports }) {
  $('#bulk').innerHTML = pages.length ? viewports.map((v) => {
    const allOn = pages.every((p) => p.on[v]);
    return `<button class="btn btn-small" data-bulk="${esc(v)}" data-on="${!allOn}">${allOn ? 'Deselect' : 'Select'} all ${esc(v)}</button>`;
  }).join('') : '';
  $('#pages').innerHTML = pages.length ? pages.map((p) => `
    <li>
      <span class="page-text"><span class="name">${esc(p.name)}</span><span class="url">${esc(p.url)}</span></span>
      <span class="devices">${viewports.map((v) => `<button class="device ${p.on[v] ? 'on' : ''}" data-page="${esc(p.name)}" data-viewport="${esc(v)}"
        aria-pressed="${p.on[v]}" title="${p.on[v] ? 'Switch off' : 'Switch on'}: ${esc(v)}">${esc(v)}</button>`).join('')}</span>
      <button class="remove" data-remove="${esc(p.name)}" title="Remove">×</button>
    </li>`).join('') : '<li class="hint">No pages yet. Add one below.</li>';
}

$('#bulk').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-bulk]');
  if (!btn) return;
  await api('POST', '/api/pages-all', { viewport: btn.dataset.bulk, on: btn.dataset.on === 'true' });
  refresh();
});

$('#pages').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-viewport]');
  if (!btn) return;
  await api('POST', `/api/pages/${btn.dataset.page}`, { viewport: btn.dataset.viewport, on: !btn.classList.contains('on') });
  refresh();
});
$('#pages').addEventListener('click', async (e) => {
  const name = e.target.dataset.remove;
  if (name && confirm(`Remove ${name}?`)) { await api('DELETE', `/api/pages/${name}`); refresh(); }
});
$('#add-page').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#new-url');
  $('#add-error').hidden = true;
  try {
    await api('POST', '/api/pages', { url: input.value });
    input.value = '';
    refresh();
  } catch (err) {
    $('#add-error').textContent = err.message;
    $('#add-error').hidden = false;
  }
});

// ------------------------------------------------------------ actions
function renderActions({ step, job, baseline, showBrowser }) {
  const busy = job && !job.finished;
  const action = (minStep, label, text, button, id, disabled) => (step >= minStep ? `
    <div class="action"><span class="label">${label}</span><p>${text}</p>
      <button class="btn btn-primary" id="${id}" ${busy || disabled ? 'disabled' : ''}>${button}</button></div>` : `
    <div class="action locked"><span class="label">${label}</span><p>🔒 Unlocks in Step ${minStep}.</p></div>`);

  $('#actions').innerHTML = `<h2>What do you want to do?</h2>
    <div class="actions">
      ${action(1, 'Screenshots', 'Photos of all switched-on pages and screen sizes.', 'Take screenshots', 'run-capture')}
      ${action(2, 'Before the update', baseline ? `Last baseline: ${when(baseline.createdAt)}` : 'Saves the before photos (baseline).', 'Take baseline', 'run-baseline')}
      ${action(2, 'After the update', 'Takes after photos and compares them.', 'Compare', 'run-compare', !baseline)}
    </div>
    ${step >= 1 ? `<label class="toggle watch-toggle"><input type="checkbox" id="set-showBrowser" ${showBrowser ? 'checked' : ''}> Show the browser while it works
      <span class="hint">Watch every page being loaded and prepared, e.g. whether the cookie banner gets clicked away. A bit slower.</span></label>` : ''}`;
  const watch = $('#set-showBrowser');
  if (watch) watch.onchange = async () => { await api('POST', '/api/settings', { showBrowser: watch.checked }); drawn.actions = null; refresh(); };
  for (const type of ['capture', 'baseline', 'compare']) {
    const btn = $(`#run-${type}`);
    if (btn) btn.onclick = () => run(type);
  }
}

async function run(type) {
  try { await api('POST', `/api/run/${type}`); } catch (err) { alert(err.message); }
  refresh();
}

const JOB_TEXT = { capture: 'Taking screenshots', baseline: 'Taking the before photos', compare: 'Taking the after photos and comparing' };

function renderProgress(job) {
  const el = $('#progress');
  el.hidden = !job || (job.finished && !job.error);
  if (el.hidden) return;
  if (job.error) {
    el.innerHTML = `<h2>Something went wrong</h2><p class="error">${esc(job.error)}</p>`;
    return;
  }
  const pct = Math.round((job.done / job.total) * 100);
  el.innerHTML = `<h2>${JOB_TEXT[job.type]}…</h2>
    <p class="hint">${job.done} of ${job.total} screenshots</p>
    <div class="bar"><span style="width:${pct}%"></span></div>`;
}

// ------------------------------------------------------------ results
function renderResults({ step, gallery, lastCheck }) {
  const el = $('#results');
  let html = '';
  if (lastCheck) {
    const rows = lastCheck.results.map((r) => `<tr>
      <td>${esc(r.page)}${(r.problems || []).map((p) => `<span class="problem">⚠ ${esc(p)}</span>`).join('')}</td><td>${esc(r.viewport)}</td>
      <td class="num">${r.percent != null ? r.percent + '%' : ''}</td>
      <td><span class="pill ${r.status}">${LABEL[r.status]}</span></td></tr>`).join('');
    const headline = lastCheck.changed
      ? `${lastCheck.changed} of ${lastCheck.total} screenshots look different`
      : `All ${lastCheck.total} screenshots look the same`;
    html += `<h2>Last check: ${headline}</h2>
      <p class="hint">${when(lastCheck.createdAt)}${step >= 2 ? ` · <a href="#/check/${lastCheck.id}">Open the report</a>` : ''}</p>
      <table><tr><th>Page</th><th>Size</th><th class="num">Changed</th><th>Result</th></tr>${rows}</table>`;
  }
  // The plain screenshots stay until you remove them (newest first).
  if (gallery && gallery.length) {
    html += `<div class="gallery-head"><h2>Your screenshots (${gallery.length})</h2>
      <button class="btn btn-small" id="shots-clear">Remove all</button></div>
      <p class="hint">Click to open full size.</p>
      <div class="gallery">${gallery.map((s) => `<div class="shot-tile">
        <button class="icon remove shot-del" data-shot="${esc(s.run)}/${esc(s.id)}" title="Remove this screenshot">×</button>
        ${s.ok
          ? `<a href="/img/current/${s.run}/${s.id}.png" target="_blank"><img src="/img/current/${s.run}/${s.id}.png" alt="${esc(s.id)}" loading="lazy"></a>`
          : `<div class="shot-failed"><span class="error">${esc(s.error)}</span></div>`}
        <span>${esc(s.id)} · ${when(s.createdAt)}</span>${(s.problems || []).map((p) => `<span class="problem">⚠ ${esc(p)}</span>`).join('')}
      </div>`).join('')}</div>`;
  }
  el.hidden = !html;
  el.innerHTML = html;
  el.querySelectorAll('[data-shot]').forEach((btn) => {
    btn.onclick = async () => { await api('DELETE', `/api/shots/${btn.dataset.shot}`); refresh(); };
  });
  const clear = el.querySelector('#shots-clear');
  if (clear) clear.onclick = async () => { if (confirm('Remove all screenshots from this list?')) { await api('DELETE', '/api/shots'); refresh(); } };
}

// ------------------------------------------------------------ checks overview
async function renderChecks(step) {
  const el = $('#checks');
  if (step < 2) return lockedCard(el, 2, 'All checks');
  const checks = await api('GET', '/api/checks');
  el.className = 'card';
  el.innerHTML = `<h2>All checks</h2>
    ${checks.length ? `<table><tr><th>Date</th><th>Pages</th><th>Result</th></tr>
      ${checks.map((c) => `<tr class="clickable" data-check="${c.id}">
        <td>${when(c.createdAt)}</td><td>${esc(c.pages.join(', '))}</td>
        <td><span class="pill ${c.changed ? 'changed' : 'ok'}">${c.changed ? `${c.changed} of ${c.total} changed` : 'All the same'}</span></td></tr>`).join('')}
      </table>` : '<p class="hint">No checks yet. Take a baseline, then compare.</p>'}`;
  el.querySelectorAll('[data-check]').forEach((tr) => { tr.onclick = () => { location.hash = `#/check/${tr.dataset.check}`; }; });
}

// ------------------------------------------------------------ settings (Step 1 and 2)
function renderSettings({ step, settings, pages }) {
  const el = $('#settings');
  if (step < 1) return lockedCard(el, 1, 'Settings');
  el.className = 'card';
  const vp = settings.viewports || [];
  el.innerHTML = `<h2>Settings</h2>
    <p class="hint">Saved automatically when you change a field.</p>
    <h3 class="sub-h">Screen sizes</h3>
    <table class="vp-table"><tr><th>Name</th><th>Width</th><th>Height</th><th></th></tr>
      ${vp.map((v, i) => `<tr>
        <td><input data-vp="${i}" data-key="name" value="${esc(v.name)}"></td>
        <td><input data-vp="${i}" data-key="width" type="number" value="${v.width}"></td>
        <td><input data-vp="${i}" data-key="height" type="number" value="${v.height}"></td>
        <td><button class="icon remove" data-vp-del="${i}" title="Remove" ${vp.length < 2 ? 'disabled' : ''}>×</button></td></tr>`).join('')}
    </table>
    <button class="btn btn-small" id="vp-add">+ Add screen size</button>
    <div class="fields">
      <label>Extra wait after loading <span class="unit"><input id="set-waitAfterLoad" type="number" min="0" step="500" value="${settings.waitAfterLoad}"> ms</span></label>
    </div>
    ${step >= 2 ? `<h3 class="sub-h">When is a change a problem?</h3>
    <div class="fields">
      <label>Threshold: changed pixels that are still OK <span class="unit"><input id="set-threshold" type="number" min="0" max="100" step="0.05" value="${settings.threshold}"> %</span></label>

    </div>
    <details class="per-page"><summary>Own threshold per page</summary>
      ${pages.map((p) => `<label>${esc(p.name)} <span class="unit"><input data-page-threshold="${esc(p.name)}" type="number" min="0" max="100" step="0.05" value="${p.threshold ?? ''}" placeholder="${settings.threshold}"> %</span></label>`).join('')}
      <p class="hint">Empty = the general threshold.</p>
    </details>` : `<p class="hint">🔒 The threshold unlocks in Step 2.</p>`}
    <p class="error" id="settings-error" hidden></p>`;

  const save = async (patch) => {
    $('#settings-error').hidden = true;
    try { await api('POST', '/api/settings', patch); drawn.settings = null; refresh(); } catch (err) {
      $('#settings-error').textContent = err.message;
      $('#settings-error').hidden = false;
    }
  };
  const readVp = () => vp.map((v, i) => ({
    name: el.querySelector(`[data-vp="${i}"][data-key="name"]`).value,
    width: Number(el.querySelector(`[data-vp="${i}"][data-key="width"]`).value),
    height: Number(el.querySelector(`[data-vp="${i}"][data-key="height"]`).value),
  }));
  el.querySelectorAll('[data-vp]').forEach((input) => { input.onchange = () => save({ viewports: readVp() }); });
  el.querySelectorAll('[data-vp-del]').forEach((btn) => {
    btn.onclick = () => save({ viewports: readVp().filter((_, i) => i !== Number(btn.dataset.vpDel)) });
  });
  $('#vp-add').onclick = () => save({ viewports: [...readVp(), { name: 'tablet', width: 820, height: 1180 }] });
  $('#set-waitAfterLoad').onchange = (e) => save({ waitAfterLoad: e.target.value });
  if (step >= 2) {
    $('#set-threshold').onchange = (e) => save({ threshold: e.target.value });
    el.querySelectorAll('[data-page-threshold]').forEach((input) => {
      input.onchange = async () => {
        try { await api('POST', `/api/pages/${input.dataset.pageThreshold}/threshold`, { threshold: input.value }); refresh(); } catch (err) { alert(err.message); }
      };
    });
  }
}

// ------------------------------------------------------------ Step 3: preparation per page
let prepPage = null; // the page whose preparation steps are shown
let prepChoice = null; // the snippet chosen under "Add a step", kept across redraws

const snippetName = (id) => state.snippets.find((s) => s.id === id)?.name || `Unknown snippet "${id}"`;

function renderPrep({ step, pages, snippets }) {
  const el = $('#prep');
  if (step < 3) return lockedCard(el, 3, 'Preparation');
  if (!pages.some((p) => p.name === prepPage)) prepPage = pages[0]?.name || null;
  const page = pages.find((p) => p.name === prepPage);
  el.className = 'card';
  if (!page) { el.innerHTML = '<h2>Preparation</h2><p class="hint">Add a page first.</p>'; return; }
  const steps = page.steps || [];

  el.innerHTML = `<h2>Preparation</h2>
    <p class="hint">Snippets that run on the page before every photo, from top to bottom.</p>
    <div class="picker-form">
      <select id="prep-page">${pages.map((p) => `<option value="${esc(p.name)}" ${p.name === prepPage ? 'selected' : ''}>${esc(p.name)} (${(p.steps || []).length})</option>`).join('')}</select>
    </div>
    <ol class="steps-list">${steps.map((s, i) => {
      const snippet = snippets.find((x) => x.id === s.snippet);
      return `<li>
        <span class="step-name">${esc(snippetName(s.snippet))}</span>
        ${snippet?.param ? `<input data-value="${i}" value="${esc(s.value)}" placeholder="${esc(snippet.param)}" aria-label="${esc(snippet.param)}">` : '<span class="step-fill"></span>'}
        <button class="icon" data-move="${i}:-1" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon" data-move="${i}:1" title="Move down" ${i === steps.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="icon remove" data-del="${i}" title="Remove">×</button>
      </li>`;
    }).join('') || '<li class="hint">No steps yet. The page is photographed exactly as it loads.</li>'}</ol>
    <h3 class="sub-h">Add a step</h3>
    <div class="picker-form">
      <select id="prep-add">${snippets.map((s) => `<option value="${esc(s.id)}" ${s.id === prepChoice ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <input id="prep-value" class="prep-value" placeholder="">
      <button class="btn" id="prep-add-btn">Add step</button>
    </div>
    <label class="toggle" id="prep-same-wrap"><input type="checkbox" id="prep-same" checked> on all pages of this website</label>
    <details class="per-page" id="prep-devtools"><summary>Find the selector yourself (Developer Tools)</summary>
      <ol class="hint">
        <li>Open the page in Chrome or Edge, right-click the element (e.g. the “Accept all” button) → <b>Inspect</b>.</li>
        <li>In the panel, right-click the highlighted line → <b>Copy</b> → <b>Copy selector</b>.</li>
        <li>Paste it above. For buttons, <code>text=Accept all</code> (the visible text) is often easier and more stable.</li>
        <li>Inside a frame (the panel shows <code>#document</code> above it)? Click still works. For Hide or Mask, copy the selector of the <code>&lt;iframe&gt;</code> itself.</li>
      </ol>
    </details>
    <div class="picker-form">
      <button class="btn" id="prep-recommended" title="Scroll down and back up, Stop animations, Wait for web fonts">Add recommended steps</button>
    </div>
    <p class="hint">After changing steps: try them with “Take screenshots”, then take a new baseline.</p>`;

  const save = (next) => api('PUT', `/api/pages/${page.name}/steps`, { steps: next }).then(refresh);
  $('#prep-page').onchange = (e) => { prepPage = e.target.value; drawn.prep = null; refresh(); };
  el.querySelectorAll('[data-value]').forEach((input) => {
    input.onchange = () => save(steps.map((s, i) => (i === Number(input.dataset.value) ? { ...s, value: input.value } : s)));
  });
  el.querySelectorAll('[data-move]').forEach((btn) => {
    btn.onclick = () => {
      const [i, dir] = btn.dataset.move.split(':').map(Number);
      const next = [...steps];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      save(next);
    };
  });
  el.querySelectorAll('[data-del]').forEach((btn) => { btn.onclick = () => save(steps.filter((_, i) => i !== Number(btn.dataset.del))); });
  const add = (snippet, value = '', sameDomain = false) => api('POST', `/api/pages/${page.name}/steps`, { snippet, value, sameDomain });
  // The value field only shows for snippets that need one (Click, Hide, Mask, Wait ...).
  const showValue = () => {
    const snippet = snippets.find((s) => s.id === $('#prep-add').value);
    $('#prep-value').hidden = !snippet?.param;
    $('#prep-value').placeholder = snippet?.param || '';
    const isSelector = /selector/i.test(snippet?.param || '');
    $('#prep-same-wrap').hidden = !isSelector;
    $('#prep-devtools').hidden = !isSelector;
  };
  $('#prep-add').onchange = () => { prepChoice = $('#prep-add').value; showValue(); };
  showValue();
  $('#prep-add-btn').onclick = async () => {
    const id = $('#prep-add').value;
    const snippet = snippets.find((s) => s.id === id);
    const value = $('#prep-value').value.trim();
    if (snippet?.param && !value) { $('#prep-value').focus(); return; }
    try {
      await add(id, snippet?.param ? value : '', /selector/i.test(snippet?.param || '') && $('#prep-same').checked);
      $('#prep-value').value = '';
      drawn.prep = null; refresh();
    } catch (err) { alert(err.message); }
  };
  $('#prep-value').onkeydown = (e) => { if (e.key === 'Enter') $('#prep-add-btn').click(); };
  $('#prep-recommended').onclick = async () => {
    for (const id of ['scroll', 'stop-animations', 'wait-fonts']) if (snippets.some((s) => s.id === id)) await add(id);
    refresh();
  };
}

// ------------------------------------------------------------ Step 3: element picker
function renderPicker({ step, pages, picks, pickerError }) {
  const el = $('#picker');
  if (step < 3) return lockedCard(el, 3, 'Element picker');
  el.className = 'card';
  el.innerHTML = `<h2>Element picker</h2>
    <p class="hint">Opens the page in a browser window. Click a cookie button, a slider or a chat bubble, then add it as a preparation step here.</p>
    <div class="picker-form">
      <select id="pick-page">${pages.map((p) => `<option value="${esc(p.name)}" ${p.name === prepPage ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <button class="btn btn-primary" id="pick-start">🎯 Open element picker</button>
    </div>
    <div class="pick manual">
      <div class="hint">Type it yourself (e.g. from the Developer Tools), or pick it in the browser above.</div>
      <label class="pick-field"><span>Element</span><input data-manual placeholder="text=Accept all  or  .cookie-banner button"></label>
      <div class="pick-actions">
        <button class="btn" data-add="m:click">Add as Click</button>
        <button class="btn" data-add="m:hide">Add as Hide</button>
        <button class="btn" data-add="m:mask">Add as Mask</button>
        <label class="toggle"><input type="checkbox" data-domain="m" checked> on all pages of this website</label>
      </div>
    </div>
    ${pickerError ? `<p class="picker-error">⚠ The picker could not start:<br><code>${esc(pickerError)}</code></p>` : ''}
    ${picks.length ? `<div class="picks">${picks.map((p, i) => `<div class="pick">
      <div class="pick-head"><span class="hint">${esc(p.page)} · ${esc(p.url)}</span>
        <button class="icon remove" data-pick-del="${esc(p.id)}" title="Remove from this list">×</button></div>
      <label class="pick-field"><span>Click</span><input data-click="${i}" value="${esc(p.text ? `text=${p.text}` : p.selector)}"></label>
      <label class="pick-field"><span>Hide / Mask</span><input data-sel="${i}" value="${esc(p.frame || p.selector)}"></label>
      <div class="hint">Not the right element? Change the selector here before adding it.</div>
      ${p.frame ? `<div class="hint">Inside a frame (${esc(p.frame)}): Click works directly, Hide and Mask cover the whole frame.</div>` : ''}
      <div class="pick-actions">
        <button class="btn" data-add="${i}:click">Add as Click</button>
        <button class="btn" data-add="${i}:hide">Add as Hide</button>
        <button class="btn" data-add="${i}:mask">Add as Mask</button>
        <label class="toggle"><input type="checkbox" data-domain="${i}" checked> on all pages of this website</label>
      </div></div>`).join('')}</div>` : ''}`;

  $('#pick-start').onclick = async () => {
    try { await api('POST', '/api/pick', { page: $('#pick-page').value }); } catch (err) { alert(err.message); }
  };
  el.querySelectorAll('[data-pick-del]').forEach((btn) => {
    btn.onclick = async () => { await api('DELETE', `/api/picks/${btn.dataset.pickDel}`); refresh(); };
  });
  el.querySelectorAll('[data-add]').forEach((btn) => {
    btn.onclick = async () => {
      const [i, snippet] = btn.dataset.add.split(':');
      const manual = i === 'm';
      const pick = manual ? { page: $('#pick-page').value } : picks[Number(i)];
      const field = manual ? el.querySelector('[data-manual]') : el.querySelector(snippet === 'click' ? `[data-click="${i}"]` : `[data-sel="${i}"]`);
      const value = field.value.trim();
      if (!value) { field.focus(); return; }
      if (snippet !== 'click' && value.startsWith('text=')) { alert('Hide and Mask need a CSS selector, e.g. .chat-bubble. text=… only works for Click.'); return; }
      const sameDomain = el.querySelector(`[data-domain="${i}"]`).checked;
      try {
        await api('POST', `/api/pages/${pick.page}/steps`, { snippet, value, sameDomain });
        btn.textContent = 'Added ✓';
        setTimeout(() => { btn.textContent = `Add as ${snippet[0].toUpperCase()}${snippet.slice(1)}`; }, 2000);
        prepPage = pick.page;
        refresh();
      } catch (err) { alert(err.message); }
    };
  });
}

// ------------------------------------------------------------ Step 3: snippet library
function renderSnippets({ step, snippets }) {
  const el = $('#snippets');
  if (step < 3) return lockedCard(el, 3, 'Snippets');
  el.className = 'card';
  el.innerHTML = `<h2>Snippets</h2>
    <p class="hint">The building blocks for preparation steps. Each one is JavaScript that runs inside the page;
      the variable <code>value</code> holds what you typed for the page. Change them, or write your own.</p>
    <div class="snippet-list">${snippets.map((s) => `<details class="snippet">
      <summary><b>${esc(s.name)}</b> <span class="hint">${esc(s.description)}</span></summary>
      <form data-snippet="${esc(s.id)}">
        <label>Name <input name="name" value="${esc(s.name)}"></label>
        <label>Description <input name="description" value="${esc(s.description)}"></label>
        <label>Asks for a value (empty = no value) <input name="param" value="${esc(s.param || '')}" placeholder="e.g. CSS selector"></label>
        <label>JavaScript <textarea name="code" rows="${Math.min(16, s.code.split('\n').length + 1)}" spellcheck="false">${esc(s.code)}</textarea></label>
        <div class="row"><button class="btn btn-primary" type="submit">Save</button>
          <button class="btn" type="button" data-delete="${esc(s.id)}">Delete</button></div>
      </form></details>`).join('')}</div>
    <div class="picker-form">
      <button class="btn" id="snippet-new">New snippet</button>
      <button class="btn" id="snippet-restore">Restore default snippets</button>
    </div>`;

  el.querySelectorAll('form[data-snippet]').forEach((form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      try { await api('POST', '/api/snippets', { id: form.dataset.snippet, ...data }); refresh(); } catch (err) { alert(err.message); }
    };
  });
  el.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.onclick = async () => {
      if (confirm('Delete this snippet? Pages that use it will skip it.')) { await api('DELETE', `/api/snippets/${btn.dataset.delete}`); refresh(); }
    };
  });
  $('#snippet-new').onclick = async () => {
    const name = prompt('Name of the new snippet');
    if (!name) return;
    try {
      await api('POST', '/api/snippets', { name, description: '', param: '', code: '// your JavaScript here, e.g.\n// document.querySelector(value)?.remove();' });
      refresh();
    } catch (err) { alert(err.message); }
  };
  $('#snippet-restore').onclick = async () => {
    if (confirm('Put the default snippets back? Your own snippets stay.')) { await api('POST', '/api/snippets-restore'); refresh(); }
  };
}

// ------------------------------------------------------------ check detail
const detail = { check: null, selected: null, view: 'slider' };

async function showCheck(id) {
  detail.check = await api('GET', `/api/checks/${id}`);
  if (!detail.check) { location.hash = '#/'; return; }
  const first = detail.check.results.find((r) => r.status === 'changed') || detail.check.results[0];
  detail.selected = first?.id;
  renderDetail();
}

function renderDetail() {
  const c = detail.check;
  const r = c.results.find((x) => x.id === detail.selected);
  $('#detail').innerHTML = `<a class="back" href="#/">← Back to the dashboard</a>
    <div class="detail-layout">
      <ul class="list">${c.results.map((x) => `<li data-id="${x.id}" class="${x.id === detail.selected ? 'active' : ''}">
        <span class="dot ${x.status}"></span><div><div class="name">${esc(x.page)}</div><div class="meta">${esc(x.viewport)}</div></div>
        <span class="pct ${x.status === 'changed' ? 'bad' : ''}">${x.percent != null ? x.percent + '%' : ''}</span></li>`).join('')}</ul>
      <div>${r ? shotView(c, r) : ''}</div>
    </div>`;
  $('#detail').querySelectorAll('.list li').forEach((li) => { li.onclick = () => { detail.selected = li.dataset.id; renderDetail(); }; });
  $('#detail').querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => { detail.view = b.dataset.view; renderDetail(); }; });
  const slider = $('#detail .slider');
  if (slider) setupSlider(slider);
}

function shotView(c, r) {
  const img = (kind) => `/img/checks/${c.id}/${kind}/${r.id}.png`;
  const head = `<div class="shot-head"><div>
      <span class="pill ${r.status}">${LABEL[r.status]}</span>
      <h1>${esc(r.page)} · ${esc(r.viewport)}</h1>
      <div class="meta">${r.percent != null ? `${r.percent}% different · allowed ${r.threshold}% · ` : ''}<a href="${esc(r.url)}" target="_blank">${esc(r.url)}</a></div>
      ${r.message ? `<p class="note">${esc(r.message)}</p>` : ''}
      ${(r.problems || []).map((p) => `<p class="note">⚠ ${esc(p)}</p>`).join('')}
    </div>
    <div class="tabs">${['slider', 'side', 'diff'].map((v) => `<button data-view="${v}" class="${detail.view === v ? 'active' : ''}">${{ slider: 'Slider', side: 'Side by side', diff: 'Changes' }[v]}</button>`).join('')}</div></div>`;

  if (r.status === 'new' || r.status === 'error') {
    return `${head}<div class="stage"><div class="single"><figure><figcaption>After</figcaption><img src="${img('after')}" alt=""></figure></div></div>`;
  }
  const body = {
    side: `<div class="side"><figure><figcaption>Before</figcaption><img src="${img('before')}" alt="Before"></figure>
      <figure><figcaption>After</figcaption><img src="${img('after')}" alt="After"></figure></div>`,
    diff: `<div class="single"><figure><figcaption>Changes in red</figcaption><img src="${img('diff')}" alt="Differences"></figure></div>`,
    slider: `<div class="slider"><img src="${img('after')}" alt="After"><div class="before"><img src="${img('before')}" alt="Before"></div>
      <div class="handle"></div><span class="tag l">BEFORE</span><span class="tag r">AFTER</span></div>
      <p class="hint-center">Drag across the image to compare before and after.</p>`,
  }[detail.view];
  return `${head}<div class="stage">${body}</div>`;
}

function setupSlider(el) {
  const before = el.querySelector('.before');
  const handle = el.querySelector('.handle');
  const set = (pct) => {
    pct = Math.max(0, Math.min(100, pct));
    before.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    handle.style.left = pct + '%';
  };
  const move = (e) => { const rect = el.getBoundingClientRect(); set(((e.clientX - rect.left) / rect.width) * 100); };
  let dragging = false;
  el.addEventListener('pointerdown', (e) => { dragging = true; el.setPointerCapture(e.pointerId); move(e); });
  el.addEventListener('pointermove', (e) => { if (dragging) move(e); });
  el.addEventListener('pointerup', () => { dragging = false; });
  set(50);
}

document.addEventListener('keydown', (e) => {
  if ($('#detail').hidden || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
  const ids = detail.check.results.map((r) => r.id);
  const next = ids[ids.indexOf(detail.selected) + (e.key === 'ArrowDown' ? 1 : -1)];
  if (next) { e.preventDefault(); detail.selected = next; renderDetail(); }
});

// ------------------------------------------------------------ main loop
async function refresh() {
  const s = await api('GET', '/api/state').catch(() => null);
  if (!s) return;
  const jobJustFinished = state?.job && !state.job.finished && s.job?.finished;
  state = s;
  draw('steps', { step: s.step, steps: s.steps }, renderSteps);
  draw('unlock', s.next, renderUnlock);
  codeBtn.hidden = !s.codes || s.step >= 3;
  $('#source-warning').hidden = !s.source;
  draw('error', s.configError, (msg) => { $('#config-error').hidden = !msg; $('#config-error').textContent = msg || ''; });
  draw('pages', { pages: s.pages, viewports: s.viewports }, renderPages);
  $('#add-page').hidden = s.step < 3;
  $('#add-locked').hidden = s.step >= 3;
  draw('actions', { step: s.step, job: s.job && { finished: s.job.finished }, baseline: s.baseline, showBrowser: s.settings?.showBrowser }, renderActions);
  draw('progress', s.job, renderProgress);
  draw('results', { step: s.step, gallery: s.gallery, lastCheck: s.lastCheck }, renderResults);
  draw('settings', { step: s.step, settings: s.settings, pages: s.pages.map((p) => ({ name: p.name, threshold: p.threshold })) }, renderSettings);
  draw('prep', { step: s.step, pages: s.pages, snippets: s.snippets, prepPage }, renderPrep);
  draw('picker', { step: s.step, pages: s.pages, picks: s.picks, pickerError: s.pickerError }, renderPicker);
  draw('snippets', { step: s.step, snippets: s.snippets }, renderSnippets);
  if (jobJustFinished || drawn.checks === undefined) { drawn.checks = true; renderChecks(s.step); }
}

function route() {
  window.scrollTo(0, 0);
  const m = location.hash.match(/^#\/check\/([\w-]+)$/);
  $('#home').hidden = Boolean(m);
  $('#detail').hidden = !m;
  if (m) showCheck(m[1]);
  else drawn.checks = undefined;
  refresh();
}

window.addEventListener('hashchange', route);
route();
setInterval(refresh, 1000);
