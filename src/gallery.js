// The list of plain screenshots in the dashboard ("Take screenshots").
// Every run gets its own folder in screenshots/current, so earlier photos stay
// until you remove them. gallery.json remembers which photos exist.
import fs from 'node:fs';
import path from 'node:path';
import { CURRENT } from './paths.js';

const FILE = path.join(CURRENT, 'gallery.json');
const safe = (s) => /^[\w-]+$/.test(String(s));

export function loadGallery() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}
const save = (list) => { fs.mkdirSync(CURRENT, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(list, null, 2)); return list; };

// A new folder for the next run, e.g. screenshots/current/20261029-230712
export function newRun() {
  const run = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const dir = path.join(CURRENT, run);
  fs.mkdirSync(dir, { recursive: true });
  return { run, dir };
}

// Newest photos first.
export function addRun(run, createdAt, results) {
  const entries = results.map(({ id, ok, error, problems }) => ({ run, id, createdAt, ok, error, problems }));
  return save([...entries, ...loadGallery()]);
}

export const fileOf = (run, id) => (safe(run) && safe(id) ? path.join(CURRENT, run, `${id}.png`) : null);

export function removeShot(run, id) {
  const file = fileOf(run, id);
  if (file) fs.rmSync(file, { force: true });
  const list = save(loadGallery().filter((s) => !(s.run === run && s.id === id)));
  if (safe(run) && !list.some((s) => s.run === run)) fs.rmSync(path.join(CURRENT, run), { recursive: true, force: true });
  return list;
}

export function removeAll() {
  for (const run of new Set(loadGallery().map((s) => s.run))) if (safe(run)) fs.rmSync(path.join(CURRENT, run), { recursive: true, force: true });
  return save([]);
}
