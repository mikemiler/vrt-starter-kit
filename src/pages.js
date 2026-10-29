// The list of pages to check, stored in pages.json.
// The dashboard adds, removes and ticks pages here. You can also edit the file by hand.
import fs from 'node:fs';
import { PAGES_FILE } from './paths.js';

export function loadPages() {
  if (!fs.existsSync(PAGES_FILE)) return [];
  return JSON.parse(fs.readFileSync(PAGES_FILE, 'utf8'));
}

function savePages(pages) {
  fs.writeFileSync(PAGES_FILE, JSON.stringify(pages, null, 2) + '\n');
  return pages;
}

// Turns "https://www.example.com/about/" into "example-com-about".
function nameFromUrl(url) {
  const { hostname, pathname } = new URL(url);
  const slug = (hostname.replace(/^www\./, '') + pathname)
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'page';
}

const problem = (message) => Object.assign(new Error(message), { friendly: true });

// Same website? www.example.com and example.com count as one.
export const siteOf = (url) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return ''; } };

export function addPage(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) url = (/^(localhost|127\.)/.test(url) ? 'http://' : 'https://') + url;
  try { new URL(url); } catch { throw problem(`"${rawUrl}" is not a valid web address.`); }

  const pages = loadPages();
  if (pages.some((p) => p.url === url)) throw problem('This page is already in the list.');
  let name = nameFromUrl(url);
  for (let i = 2; pages.some((p) => p.name === name); i++) name = `${nameFromUrl(url)}-${i}`;
  // Steps that were added "on all pages of this website" come along automatically.
  const siteSteps = [];
  for (const p of pages) {
    if (siteOf(p.url) !== siteOf(url)) continue;
    for (const s of p.steps || []) if (s.site && !siteSteps.some((x) => x.snippet === s.snippet && x.value === s.value)) siteSteps.push(s);
  }
  pages.push(siteSteps.length ? { name, url, steps: siteSteps } : { name, url }); // all screen sizes on
  return savePages(pages);
}

// Is this page photographed in this screen size (desktop, mobile, ...)?
// Missing entries mean "on". An old "enabled": false switches all sizes off.
export function isOn(page, viewport) {
  if (page.devices && viewport in page.devices) return page.devices[viewport] !== false;
  return page.enabled !== false;
}

// Switch one screen size of one page on or off.
export function setDevice(name, viewport, on, allViewports = []) {
  return savePages(loadPages().map((p) => {
    if (p.name !== name) return p;
    const devices = Object.fromEntries(allViewports.map((v) => [v, isOn(p, v)]));
    devices[viewport] = Boolean(on);
    const { enabled, ...rest } = p; // replaced by "devices"
    return { ...rest, devices };
  }));
}

// Switch one screen size on or off for all pages at once.
export function setDeviceForAll(viewport, on, allViewports = []) {
  for (const p of loadPages()) setDevice(p.name, viewport, on, allViewports);
  return loadPages();
}

// A page's own threshold (empty = use the general one). Step 2.
export function setThreshold(name, value) {
  const empty = value === null || value === undefined || String(value).trim() === '';
  const n = Number(value);
  if (!empty && (!Number.isFinite(n) || n < 0 || n > 100)) throw problem('The threshold must be a number between 0 and 100.');
  return savePages(loadPages().map((p) => {
    if (p.name !== name) return p;
    const { threshold, ...rest } = p;
    return empty ? rest : { ...rest, threshold: n };
  }));
}

export function removePage(name) {
  return savePages(loadPages().filter((p) => p.name !== name));
}

// ---------------------------------------------------------------- Step 3
// Every page can have its own preparation steps: snippets from the library,
// each with a value, run in order before the photo.

export function setSteps(name, steps) {
  const clean = (Array.isArray(steps) ? steps : [])
    .filter((s) => s && s.snippet)
    .map((s) => ({ snippet: String(s.snippet), value: String(s.value ?? '') }));
  return savePages(loadPages().map((p) => (p.name === name ? { ...p, steps: clean } : p)));
}

// Adds a step at its natural place: in the order of the snippet library
// (scroll, click, wait, hide, ..., mask last). With sameDomain it is added to
// every page on the same website, handy for cookie banners.
export function addStep(name, step, { sameDomain = false, libraryOrder = [] } = {}) {
  const pages = loadPages();
  const target = pages.find((p) => p.name === name);
  if (!target) throw problem(`There is no page "${name}".`);
  const site = siteOf(target.url);
  const rank = (s) => { const i = libraryOrder.indexOf(s.snippet); return i < 0 ? libraryOrder.length : i; };

  return savePages(pages.map((p) => {
    if (p.name !== name && !(sameDomain && siteOf(p.url) === site)) return p;
    const steps = [...(p.steps || [])];
    if (steps.some((s) => s.snippet === step.snippet && s.value === step.value)) return p; // already there
    let at = steps.findIndex((s) => rank(s) > rank(step));
    if (at < 0) at = steps.length;
    steps.splice(at, 0, sameDomain ? { snippet: step.snippet, value: String(step.value ?? ''), site: true } : { snippet: step.snippet, value: String(step.value ?? '') });
    return { ...p, steps };
  }));
}
