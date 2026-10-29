// Loads your settings (dashboard, plus Slack/browser from config.js), pages and snippets and turns them
// into a list of "shots": every page in every screen size that is switched on.
// Gives beginner-friendly errors when a file has a typo.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { ROOT } from './paths.js';
import { loadPages, isOn } from './pages.js';
import { loadSnippets } from './snippets.js';
import { loadSettings } from './settings.js';

// Defaults. Screen sizes, threshold & co. can be changed in the dashboard
// (saved in settings.json); Slack and the browser in config.js.
const DEFAULTS = {
  viewports: [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ],
  waitAfterLoad: 1000,
  showBrowser: false,
  threshold: 0,
  pixelSensitivity: 0.1,
  slackWebhook: '',
  browser: 'auto',
  browserPath: '',
};

// Settings a single page in pages.json is allowed to override.
const PAGE_OVERRIDES = ['threshold', 'pixelSensitivity', 'waitAfterLoad'];

function friendly(message) {
  const err = new Error(message);
  err.friendly = true;
  return err;
}

export async function loadConfig() {
  const file = path.join(ROOT, 'config.js');
  let userConfig;
  try {
    // Cache-busting query so the dashboard always reads the latest version.
    userConfig = (await import(pathToFileURL(file).href + '?t=' + Date.now())).default;
  } catch (err) {
    throw friendly('Your config.js has a mistake (usually a missing comma, quote or bracket). '
      + 'The computer says: ' + String(err.message || err).split('\n')[0]);
  }

  let pages;
  try {
    pages = loadPages();
  } catch (err) {
    throw friendly('Your pages.json has a mistake: ' + String(err.message).split('\n')[0]);
  }

  const names = new Set();
  for (const page of pages) {
    if (!page || !page.url || !page.name) throw friendly(`Every page needs a "name" and a "url": ${JSON.stringify(page)}`);
    if (!/^https?:\/\//.test(page.url)) throw friendly(`The url "${page.url}" must start with http:// or https://`);
    if (!/^[a-zA-Z0-9_-]+$/.test(page.name)) throw friendly(`The name "${page.name}" may only contain letters, numbers, - and _.`);
    if (names.has(page.name)) throw friendly(`The name "${page.name}" is used twice. Names must be unique.`);
    names.add(page.name);
  }
  let snippets;
  try {
    snippets = loadSnippets();
  } catch (err) {
    throw friendly('Your snippets.json has a mistake: ' + String(err.message).split('\n')[0]);
  }
  let settings;
  try {
    settings = loadSettings();
  } catch (err) {
    throw friendly('Your settings.json has a mistake: ' + String(err.message).split('\n')[0]);
  }
  return { ...DEFAULTS, ...userConfig, ...settings, pages, snippets };
}

// Every page in every switched-on screen size, with page-level overrides applied.
export function buildShots(config) {
  const shots = [];
  for (const page of config.pages) {
    const settings = {};
    for (const key of PAGE_OVERRIDES) settings[key] = page[key] ?? config[key];
    for (const viewport of config.viewports.filter((v) => isOn(page, v.name))) {
      shots.push({
        id: `${page.name}-${viewport.name}`,
        page: page.name,
        url: page.url,
        viewport,
        settings,
        steps: page.steps || [], // Step 3: snippets to run before the photo
      });
    }
  }
  return shots;
}
