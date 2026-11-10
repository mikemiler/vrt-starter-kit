// Where everything lives on disk.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PAGES_FILE = path.join(ROOT, 'pages.json');       // your pages, managed in the dashboard
export const SNIPPETS_FILE = path.join(ROOT, 'snippets.json'); // your snippet library (Step 3)
export const SETTINGS_FILE = path.join(ROOT, 'settings.json'); // settings changed in the dashboard
export const SHOTS = path.join(ROOT, 'screenshots');
export const CURRENT = path.join(SHOTS, 'current');   // Step 1: plain screenshots
export const BASELINE = path.join(SHOTS, 'baseline'); // the "before" photos
export const CHECKS = path.join(SHOTS, 'checks');     // one folder per check

export function ensureDirs() {
  for (const dir of [SHOTS, CURRENT, BASELINE, CHECKS]) fs.mkdirSync(dir, { recursive: true });
}

export const shotFile = (dir, id) => path.join(dir, `${id}.png`);

// A check folder holds before/, after/, diff/ and check.json
export const checkDir = (checkId) => path.join(CHECKS, checkId);
