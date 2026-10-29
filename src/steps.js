// Unlocking the building blocks of the workshop, step by step.
// Used by the dashboard ("Unlock" button) and by "npm run step <number>".
// Your config.js and pages.json are never touched, only src/ and examples/.
//
// Where a step comes from (first one that works):
//   1. a local "_steps" folder (USB stick, no internet needed)
//   2. the locked steps in the ZIP, opened with a code word (works offline)
//   3. git (if you cloned the repository)
//   4. download from GitHub (if you downloaded the ZIP)
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from './paths.js';

const exec = promisify(execFile);
const UPDATED = ['src', 'examples']; // the only folders that change

export const STEPS = {
  0: 'Start',
  1: 'Taking screenshots',
  2: 'Before and after',
  3: 'Stop false alarms',
};
const LAST = Math.max(...Object.keys(STEPS).map(Number));

const repo = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).workshop?.repo;
const tarUrl = (n) => `https://codeload.github.com/${repo()}/tar.gz/refs/tags/step-${n}`;
const hasGit = () => fs.existsSync(path.join(ROOT, '.git'));
const git = (...args) => exec('git', args, { cwd: ROOT, timeout: 30_000 });
const hasRepo = () => repo() && !repo().startsWith('YOUR-');


// Is step n published yet? Cheap enough to ask every few seconds.
export async function isAvailable(n) {
  if (!STEPS[n]) return false;
  if (fs.existsSync(path.join(ROOT, '_steps', `step-${n}`))) return true;
  if (knownCodes()[n]) return true;
  if (hasGit()) {
    try {
      const { stdout } = await git('ls-remote', '--tags', 'origin', `refs/tags/step-${n}`);
      if (stdout.trim()) return true;
    } catch { /* offline or no remote: try the local tag */ }
    try { await git('rev-parse', '--verify', '--quiet', `refs/tags/step-${n}`); return true; } catch { /* not there */ }
    return false;
  }
  if (!hasRepo()) return false;
  const res = await fetch(tarUrl(n), { method: 'HEAD', signal: AbortSignal.timeout(8_000) }).catch(() => null);
  return Boolean(res && res.ok);
}

export async function unlock(n) {
  if (!STEPS[n]) throw new Error(`There is no step ${n}.`);
  return fromLocalFolder(n) || (await fromCode(n)) || (await fromGit(n)) || (await fromDownload(n)) || null;
}

const problem = (message) => Object.assign(new Error(message), { friendly: true, status: 409 });

// Jump to any step, forwards or back (the step badges in the dashboard).
// Going back locks the later building blocks again; pages and snippets stay.
export async function switchTo(n, current) {
  if (!STEPS[n]) throw problem(`There is no step ${n}.`);
  if (n > current && !(await isAvailable(n))) throw problem(`Step ${n} is not available yet.`);

  // The instructor's own copy holds the full version: protect unsaved work,
  // and the last step means the latest commit, not a possibly older tag.
  if (fs.existsSync(path.join(ROOT, 'instructor')) && hasGit()) {
    if (current === LAST) { // leaving the full version: it must be saved in git
      const { stdout } = await git('status', '--porcelain', '--', ...UPDATED);
      if (stdout.trim()) throw problem('You have uncommitted changes in src/ or examples/. Commit them first, then switch steps.');
    }
    if (n === LAST) {
      for (const dir of UPDATED) {
        fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
        await git('checkout', 'HEAD', '--', dir);
      }
      return 'your latest commit';
    }
  }
  return unlock(n);
}

function copyFolders(fromRoot) {
  for (const dir of UPDATED) {
    const from = path.join(fromRoot, dir);
    if (!fs.existsSync(from)) continue;
    fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
    fs.cpSync(from, path.join(ROOT, dir), { recursive: true });
  }
}

function fromLocalFolder(n) {
  const dir = path.join(ROOT, '_steps', `step-${n}`);
  if (!fs.existsSync(dir)) return null;
  copyFolders(dir);
  return 'local _steps folder';
}

async function fromGit(n) {
  if (!hasGit()) return null;
  await git('fetch', 'origin', '--tags', '--force', '--quiet').catch(() => {});
  try { await git('rev-parse', '--verify', '--quiet', `refs/tags/step-${n}`); } catch { return null; }
  for (const dir of UPDATED) {
    // Replace the whole folder, so files of later steps disappear when going back.
    fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
    await git('checkout', `step-${n}`, '--', dir).catch(() => {}); // examples/ only exists from step 5
  }
  return 'git';
}

// ---- Fallback: unlock codes. The ZIP contains every step, encrypted.
// The instructor shows the code for a step; the dashboard decrypts it.
const LOCKED = path.join(ROOT, '_locked');
const CODES_FILE = path.join(LOCKED, 'codes.json'); // codes you already entered

const knownCodes = () => { try { return { 0: 'start', ...JSON.parse(fs.readFileSync(CODES_FILE, 'utf8')) }; } catch { return { 0: 'start' }; } };

function decrypt(file, code) {
  const data = fs.readFileSync(file);
  if (data.subarray(0, 3).toString() !== 'CU2') return null;
  const salt = data.subarray(3, 19), iv = data.subarray(19, 31), tag = data.subarray(31, 47);
  try {
    const key = crypto.scryptSync(String(code).trim().toLowerCase(), salt, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data.subarray(47)), decipher.final()]);
    const len = plain.readUInt32BE(0);
    const { codes } = JSON.parse(plain.subarray(4, 4 + len).toString());
    return { tar: plain.subarray(4 + len), codes };
  } catch { return null; } // wrong code
}

export const hasLockedSteps = () => fs.existsSync(LOCKED);

// Which step does this code open? Unlocks it and remembers the code.
export async function unlockWithCode(code) {
  if (!hasLockedSteps()) throw problem('This copy has no locked steps. Ask the instructor for help.');
  for (let n = LAST; n >= 1; n--) { // step 0 is not unlocked by code
    const file = path.join(LOCKED, `step-${n}.locked`);
    if (!fs.existsSync(file)) continue;
    const opened = decrypt(file, code);
    if (!opened) continue;
    await extractArchive(opened.tar);
    fs.writeFileSync(CODES_FILE, JSON.stringify({ ...knownCodes(), ...opened.codes, [n]: String(code).trim() }, null, 2));
    return n;
  }
  throw problem('This code does not fit. Check the spelling, e.g. maple.');
}

async function fromCode(n) {
  const code = knownCodes()[n];
  const file = path.join(LOCKED, `step-${n}.locked`);
  if (!code || !fs.existsSync(file)) return null;
  const opened = decrypt(file, code);
  if (!opened) return null;
  await extractArchive(opened.tar);
  return 'unlock code';
}

async function extractArchive(buffer, extraFiles = []) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-starter-kit-'));
  const archive = path.join(tmp, 'step.tar.gz');
  fs.writeFileSync(archive, buffer);
  await exec('tar', ['-xzf', archive, '-C', tmp]);
  const folder = fs.readdirSync(tmp).find((f) => fs.statSync(path.join(tmp, f)).isDirectory());
  copyFolders(path.join(tmp, folder));
  for (const file of extraFiles) { // e.g. pages.json and config.js for a full reset
    const from = path.join(tmp, folder, file);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(ROOT, file));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Back to the very start, exactly like a fresh download: step 0, the practice
// pages, no photos, no settings, no snippets, no codes entered.
export async function resetToStart() {
  const file = path.join(LOCKED, 'step-0.locked');
  if (!fs.existsSync(file)) throw problem('Reset only works in the workshop copy (the folder from the ZIP), not in the source folder.');
  const opened = decrypt(file, 'start');
  if (!opened) throw problem('The start package could not be opened.');
  await extractArchive(opened.tar, ['pages.json', 'config.js']);
  for (const p of ['screenshots', 'settings.json', 'snippets.json', path.join('demo-site', '.state.json')]) {
    fs.rmSync(path.join(ROOT, p), { recursive: true, force: true });
  }
  fs.writeFileSync(CODES_FILE, '{}');
}

async function fromDownload(n) {
  if (!hasRepo()) return null;
  return (await extractFrom(tarUrl(n))) ? 'download from GitHub' : null;
}

async function extractFrom(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res || !res.ok) return false;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-starter-kit-'));
  const archive = path.join(tmp, 'step.tar.gz');
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  await exec('tar', ['-xzf', archive, '-C', tmp]); // tar is built into macOS and Windows 10+
  const folder = fs.readdirSync(tmp).find((f) => fs.statSync(path.join(tmp, f)).isDirectory());
  copyFolders(path.join(tmp, folder));
  fs.rmSync(tmp, { recursive: true, force: true });
  return true;
}
