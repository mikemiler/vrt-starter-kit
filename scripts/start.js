// npm start
// Starts the practice site and the dashboard together. Keep this window open.
// The dashboard restarts by itself when a new step is unlocked or a file in
// src/ changes, so you never have to restart anything by hand.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/paths.js';

const RESTART = 3;
const children = new Set();
let dashboard = null;
let firstStart = true;
let stopping = false;

function run(script, env = {}) {
  const child = spawn(process.execPath, [path.join(ROOT, script)], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env },
  });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}

function startDashboard() {
  dashboard = run('src/dashboard/server.js', firstStart ? {} : { NO_OPEN: '1' });
  firstStart = false;
  dashboard.on('exit', (code) => {
    if (stopping) return;
    if (code === RESTART || dashboard.restartRequested) setTimeout(startDashboard, 200);
    else console.log('\n  The dashboard stopped. Press Ctrl + C and run "npm start" again.\n');
  });
}

// Is the dashboard in the middle of taking photos? Then a restart would cut
// the check off halfway, so we wait until it is done.
async function dashboardBusy() {
  const port = Number(process.env.DASHBOARD_PORT || 4100);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/state`, { signal: AbortSignal.timeout(1500) });
    const { job } = await res.json();
    return Boolean(job && !job.finished);
  } catch { return false; }
}

async function restartDashboard() {
  if (!dashboard || dashboard.exitCode !== null) return;
  if (await dashboardBusy()) { timer = setTimeout(restartDashboard, 2000); return; }
  dashboard.restartRequested = true;
  dashboard.kill();
}

// First start: check Node.js and install the packages if they are missing,
// so "npm start" is the only command anyone has to type.
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.log(`\n  Your Node.js (${process.version}) is too old. Install the LTS version from https://nodejs.org,`);
  console.log('  close this window, open a new one and run "npm start" again.\n');
  process.exit(1);
}
const needed = ['playwright-core', 'pixelmatch', 'pngjs'];
if (needed.some((name) => !fs.existsSync(path.join(ROOT, 'node_modules', name, 'package.json')))) {
  console.log('\n  First start: installing the packages (about 15 MB, takes a minute) ...\n');
  const res = spawnSync('npm', ['install', '--no-fund', '--no-audit'], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    console.log('\n  Installing failed. Check your internet connection, or ask for a USB stick.\n');
    process.exit(1);
  }
}

console.log('\n  VRT Starter Kit is starting. Keep this window open, stop with Ctrl + C.\n');
if (fs.existsSync(path.join(ROOT, 'instructor'))) {
  console.log('  ⚠️  SOURCE FOLDER: this is where the tool is built, not the workshop copy.');
  console.log('      In the workshop, start the attendee folder instead.\n');
}
run('demo-site/server.js', { QUIET: '1' });
startDashboard();

// A building block changed (unlocked from the terminal, or edited): restart.
let timer = null;
try {
  fs.watch(path.join(ROOT, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(restartDashboard, 800);
  });
} catch { /* watching is a convenience only */ }

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    for (const child of children) child.kill();
    process.exit(0);
  });
}
