// Settings changed in the dashboard (screen sizes, threshold, ...), stored in
// settings.json. Anything not saved there uses the defaults in config-loader.js.
import fs from 'node:fs';
import { SETTINGS_FILE } from './paths.js';

const problem = (message) => Object.assign(new Error(message), { friendly: true });

export function loadSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return {};
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
}

const between = (value, min, max, label) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw problem(`${label} must be a number between ${min} and ${max}.`);
  return n;
};

// Checks every value before saving, so a typo can never break a check run.
export function saveSettings(patch) {
  const next = { ...loadSettings() };
  if ('threshold' in patch) next.threshold = between(patch.threshold, 0, 100, 'The threshold');
  if ('pixelSensitivity' in patch) next.pixelSensitivity = between(patch.pixelSensitivity, 0, 1, 'The pixel sensitivity');
  if ('waitAfterLoad' in patch) next.waitAfterLoad = between(patch.waitAfterLoad, 0, 30000, 'The waiting time');
  if ('showBrowser' in patch) next.showBrowser = Boolean(patch.showBrowser);
  if ('viewports' in patch) {
    const viewports = (patch.viewports || []).map((v) => ({
      name: String(v.name || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      width: between(v.width, 200, 3840, 'The width'),
      height: between(v.height, 200, 3000, 'The height'),
    }));
    if (!viewports.length) throw problem('Keep at least one screen size.');
    if (viewports.some((v) => !v.name)) throw problem('Every screen size needs a name.');
    if (new Set(viewports.map((v) => v.name)).size !== viewports.length) throw problem('Screen size names must be unique.');
    next.viewports = viewports;
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2) + '\n');
  return next;
}
