// The dashboard: a small website on your laptop (http://localhost:4100).
// Every button calls the same building blocks as the terminal commands.
// Started by "npm start" together with the practice site.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, buildShots } from '../config-loader.js';
import { BASELINE, CURRENT, checkDir, ensureDirs, shotFile, ROOT } from '../paths.js';
import * as pages from '../pages.js';
import * as snippets from '../snippets.js';
import * as settings from '../settings.js';
import * as steps from '../steps.js';
import * as capture from '../capture.js';
import * as gallery from '../gallery.js';
import * as compare from '../compare.js';
import * as report from '../report.js';
import * as stabilize from '../stabilize.js';
import * as workflow from '../workflow.js';
import { listenLocal, answersWith } from '../local-listen.js';

const PORT = Number(process.env.DASHBOARD_PORT || 4100);
const RESTART = 3; // exit code that tells "npm start" to restart the dashboard
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };

// Which step is unlocked right now? Read from the building blocks themselves.
const STEP = capture.lockedUntil ? 0 : (compare.lockedUntil || report.lockedUntil) ? 1
  : !stabilize.active ? 2 : 3;

const state = { job: null, lastCheck: null, picks: [], next: { n: STEP + 1, available: false } };
ensureDirs();

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

async function getState() {
  let configError = null;
  let viewports = [];
  let current = {};
  try {
    const config = await loadConfig();
    viewports = config.viewports.map((v) => v.name);
    current = Object.fromEntries(['viewports', 'waitAfterLoad', 'showBrowser', 'threshold', 'pixelSensitivity'].map((k) => [k, config[k]]));
  } catch (err) { configError = err.message; }
  return {
    step: STEP,
    steps: steps.STEPS,
    codes: steps.hasLockedSteps(),
    source: fs.existsSync(path.join(ROOT, 'instructor')), // the instructor's source folder, not the workshop copy
    next: STEP < 3 ? state.next : null,
    viewports,
    settings: current,
    pages: safe(() => pages.loadPages(), []).map((p) => ({ ...p, on: Object.fromEntries(viewports.map((v) => [v, pages.isOn(p, v)])) })),
    snippets: STEP >= 3 ? safe(() => snippets.loadSnippets(), []) : [],
    configError,
    gallery: STEP >= 1 ? gallery.loadGallery() : [],
    baseline: STEP >= 2 ? readJson(path.join(BASELINE, 'info.json')) : null,
    lastCheck: state.lastCheck,
    job: state.job,
    picks: state.picks,
    pickerError: state.pickerError || null,
  };
}

function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }

// Long tasks (taking photos) run in the background; the page asks for progress.
async function startJob(type, work) {
  if (state.job && !state.job.finished) throw Object.assign(new Error('Something is already running.'), { status: 409 });
  const config = await loadConfig();
  const shots = buildShots(config);
  if (!shots.length) throw Object.assign(new Error('Switch on at least one page (desktop or mobile) first.'), { status: 400 });
  state.job = { type, done: 0, total: shots.length, finished: false, error: null };
  const job = state.job;
  work(config, shots, ({ done }) => { job.done = done; })
    .then((result) => { job.result = result; })
    .catch((err) => { job.error = err.message; })
    .finally(() => { job.finished = true; });
}

const JOBS = {
  capture: (config, shots, progress) => capture.takeScreenshots(config, shots, progress),
  baseline: (config, shots, progress) => compare.saveBaseline(config, shots, progress),
  compare: async (config, shots, progress) => {
    const check = await compare.runCompare(config, shots, progress);
    state.lastCheck = check;
    if (!workflow.lockedUntil) await workflow.afterCompare(config, check);
    return { id: check.id };
  },
};
const JOB_STEP = { capture: 1, baseline: 2, compare: 2 };

// The element picker opens a visible browser; it reports what you click.
function startPicker(url, pageName) {
  state.pickerError = null;
  const child = spawn(process.execPath, [path.join(ROOT, 'src', 'picker.js'), url], {
    cwd: ROOT, env: { ...process.env, PICK_JSON: '1' },
  });
  // If the picker can't start (e.g. no Chrome/Edge found), show why in the dashboard.
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; process.stderr.write(chunk); });
  child.on('error', (err) => { state.pickerError = err.message; });
  child.on('exit', (code) => {
    if (code) state.pickerError = errors.trim().split(/\r?\n/).filter(Boolean).slice(-4).join('\n') || `The picker stopped (code ${code}).`;
  });
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('PICK ')) continue;
      try { state.picks = [{ ...JSON.parse(line.slice(5)), page: pageName, id: `p${Date.now()}${Math.floor(Math.random() * 1000)}` }, ...state.picks].slice(0, 8); } catch { /* ignore */ }
    }
  });
}

const step4 = () => { if (STEP < 3) throw Object.assign(new Error('Not unlocked yet.'), { status: 403 }); };

// ---------------------------------------------------------------- routes
function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function sendFile(res, file) {
  if (!fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); } });
  });
}

const ID = '([\\w.-]+)';
const routes = [
  ['GET', '/api/state', async () => getState()],
  ['POST', '/api/pages', async (req) => { // own client sites come in Step 3
    if (STEP < 3) throw Object.assign(new Error('Your own client sites come in Step 3.'), { status: 403 });
    return pages.addPage((await readBody(req)).url);
  }],
  ['POST', `/api/pages/${ID}`, async (req, [name]) => {
    const { viewport, on } = await readBody(req);
    const all = (await loadConfig()).viewports.map((v) => v.name);
    if (!all.includes(viewport)) throw Object.assign(new Error('Unknown screen size.'), { status: 400 });
    return pages.setDevice(name, viewport, on, all);
  }],
  ['DELETE', `/api/pages/${ID}`, async (req, [name]) => pages.removePage(name)],
  ['POST', `/api/pages/${ID}/threshold`, async (req, [name]) => pages.setThreshold(name, (await readBody(req)).threshold)],
  ['POST', '/api/settings', async (req) => settings.saveSettings(await readBody(req))],
  ['POST', '/api/pages-all', async (req) => {
    const { viewport, on } = await readBody(req);
    return pages.setDeviceForAll(viewport, on, (await loadConfig()).viewports.map((v) => v.name));
  }],
  ['POST', '/api/run/(capture|baseline|compare)', async (req, [type]) => {
    if (STEP < JOB_STEP[type]) throw Object.assign(new Error('Not unlocked yet.'), { status: 403 });
    await startJob(type, JOBS[type]);
    return { started: type };
  }],
  ['GET', '/api/checks', async () => (STEP >= 2 ? report.listChecks() : [])],
  ['GET', `/api/checks/${ID}`, async (req, [id]) => (STEP >= 2 ? report.getCheck(id) : null)],
  ['DELETE', `/api/shots/${ID}/${ID}`, async (req, [run, id]) => gallery.removeShot(run, id)],
  ['DELETE', '/api/shots', async () => gallery.removeAll()],
  ['DELETE', `/api/picks/${ID}`, async (req, [id]) => { state.picks = state.picks.filter((p) => p.id !== id); return { removed: id }; }],
  ['POST', '/api/pick', async (req) => {
    step4();
    const { page: name } = await readBody(req);
    const page = pages.loadPages().find((p) => p.name === name);
    if (!page) throw Object.assign(new Error('Choose a page first.'), { status: 400 });
    startPicker(page.url, page.name);
    return { started: true };
  }],
  // Step 3: preparation steps per page, and the snippet library
  ['PUT', `/api/pages/${ID}/steps`, async (req, [name]) => { step4(); return pages.setSteps(name, (await readBody(req)).steps); }],
  ['POST', `/api/pages/${ID}/steps`, async (req, [name]) => {
    step4();
    const { snippet, value, sameDomain } = await readBody(req);
    return pages.addStep(name, { snippet, value }, { sameDomain, libraryOrder: snippets.loadSnippets().map((s) => s.id) });
  }],
  ['POST', '/api/snippets', async (req) => { step4(); return snippets.saveSnippet(await readBody(req)); }],
  ['DELETE', `/api/snippets/${ID}`, async (req, [id]) => { step4(); return snippets.deleteSnippet(id); }],
  ['POST', '/api/snippets-restore', async () => { step4(); return snippets.restoreDefaults(); }],
  // npm run reset asks the running dashboard to start fresh.
  ['POST', '/api/restart', async (req, params, res) => {
    send(res, 200, { restarting: true });
    setTimeout(() => process.exit(RESTART), 300);
    return undefined;
  }],
  // Fallback: unlock with a code word shown by the instructor.
  ['POST', '/api/unlock-code', async (req, params, res) => {
    const step = await steps.unlockWithCode((await readBody(req)).code || '');
    send(res, 200, { step, source: 'unlock code' });
    setTimeout(() => process.exit(RESTART), 300);
    return undefined;
  }],
  // Unlock the next step, or jump to any step (forwards or back) via the badges.
  ['POST', '/api/switch', async (req, params, res) => {
    const { step = STEP + 1 } = await readBody(req);
    const source = await steps.switchTo(Number(step), STEP);
    if (!source) throw Object.assign(new Error('This step is not available yet.'), { status: 409 });
    send(res, 200, { step, source });
    setTimeout(() => process.exit(RESTART), 300); // restart with the new building blocks
    return undefined;
  }],
];

const handler = async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    for (const [method, pattern, handler] of routes) {
      const match = req.method === method && url.pathname.match(new RegExp(`^${pattern}$`));
      if (!match) continue;
      const result = await handler(req, match.slice(1), res);
      if (result !== undefined) send(res, 200, result ?? null);
      return;
    }

    // Photos: /img/current/<id>.png, /img/baseline/<id>.png, /img/checks/<check>/<before|after|diff>/<id>.png
    let m = url.pathname.match(/^\/img\/current\/([\w-]+)\/([\w-]+)\.png$/);
    if (m) return sendFile(res, gallery.fileOf(m[1], m[2]));
    m = url.pathname.match(/^\/img\/baseline\/([\w-]+)\.png$/);
    if (m) return sendFile(res, shotFile(BASELINE, m[1]));
    m = url.pathname.match(/^\/img\/checks\/([\w-]+)\/(before|after|diff)\/([\w-]+)\.png$/);
    if (m) return sendFile(res, shotFile(path.join(checkDir(m[1]), m[2]), m[3]));

    if (req.method === 'GET') {
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (/^[\w.-]+$/.test(file)) return sendFile(res, path.join(PUBLIC, file));
    }
    send(res, 404, { error: 'Not found' });
  } catch (err) {
    send(res, err.status || (err.friendly ? 400 : 500), { error: err.message });
  }
};

// (No polling: steps are unlocked with code words, the dashboard does not ask
// git or GitHub every few seconds any more.)

// Only reachable from this laptop, never from other devices in the WiFi.
// (HOST=0.0.0.0 opens it up, e.g. inside a container.)
listenLocal(handler, PORT, {
  name: 'dashboard',
  envVar: 'DASHBOARD_PORT',
  isOurs: () => answersWith(PORT, '/api/state', async (res) => 'steps' in (await res.json())),
  onListening: () => {
    const link = `http://localhost:${PORT}`;
    console.log(`  📊 Dashboard:      ${link}   (Step ${STEP} unlocked)`);
    if (!process.env.NO_OPEN) {
      const cmd = process.platform === 'darwin' ? `open "${link}"`
        : process.platform === 'win32' ? `start "" "${link}"` : `xdg-open "${link}"`;
      exec(cmd, () => {});
    }
  },
});
