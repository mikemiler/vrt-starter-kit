// LOGIN TO A SYSTEM · for pages behind a login (an admin panel, a client area).
//
// A "login" is a named set of credentials plus the address of its login form.
// Before taking photos we log in once per login, in a real browser, and keep the
// browser session (cookies + local storage) in .auth/<id>.json. Every page that
// uses that login is then photographed already logged in.
//
// Where the credentials live (local only: auth.json and .auth/ are git-ignored):
//   - auth.json, written by the dashboard ("Logins") or by "npm run login", or by hand
//   - environment variables, which win over auth.json (handy for CI):
//       VRT_LOGIN_<ID>_URL, VRT_LOGIN_<ID>_EMAIL, VRT_LOGIN_<ID>_PASSWORD
//     (<ID> upper-case, every other character becomes "_", e.g. "my-cms" -> MY_CMS).
//     A ".env" file in this folder is read too.
// Passwords are only ever written to those git-ignored files and never sent to the dashboard page.
import fs from 'node:fs';
import path from 'node:path';
import { AUTH_FILE, AUTH_DIR } from './paths.js';
import { launchBrowser } from './browser.js';

try { process.loadEnvFile?.(path.join(path.dirname(AUTH_FILE), '.env')); } catch { /* no .env file: fine */ }

const problem = (message) => Object.assign(new Error(message), { friendly: true });

const DEFAULT_SELECTORS = {
  emailSelector: 'input[type="email"], input[name="email"], input[name="username"], input[name="log"], #field-email, #user_login, input[autocomplete="username"]',
  passwordSelector: 'input[type="password"]',
  submitSelector: 'button[type="submit"], input[type="submit"]',
};
const LOGIN_TIMEOUT = 25_000;

export const isValidId = (id) => /^[a-zA-Z0-9_-]+$/.test(String(id || ''));
const envKey = (id, field) => `VRT_LOGIN_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_${field}`;
export const stateFile = (id) => path.join(AUTH_DIR, `${id}.json`);

function readFile() {
  if (!fs.existsSync(AUTH_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); } catch (err) {
    throw problem('Your auth.json has a mistake: ' + String(err.message).split('\n')[0]);
  }
}

function writeFile(logins) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(logins, null, 2) + '\n', { mode: 0o600 });
}

// The login with environment overrides applied. null if there is no such login.
export function resolveLogin(id) {
  const stored = readFile()[id];
  const env = (field) => process.env[envKey(id, field)];
  const hasEnv = ['URL', 'EMAIL', 'PASSWORD'].some((f) => env(f));
  if (!stored && !hasEnv) return null;
  return {
    id,
    ...DEFAULT_SELECTORS,
    ...stored,
    ...(env('URL') && { loginUrl: env('URL') }),
    ...(env('EMAIL') && { email: env('EMAIL') }),
    ...(env('PASSWORD') && { password: env('PASSWORD') }),
  };
}

export const listLoginIds = () => Object.keys(readFile());

export const sessionTime = (id) => {
  try { return fs.statSync(stateFile(id)).mtime.toISOString(); } catch { return null; }
};

// What the dashboard may see: everything except the password.
export function publicLogins() {
  return listLoginIds().map((id) => {
    const { loginUrl, email, password, emailSelector, passwordSelector, submitSelector } = resolveLogin(id);
    const custom = (value, key) => (value && value !== DEFAULT_SELECTORS[key] ? value : '');
    return {
      id, loginUrl: loginUrl || '', email: email || '', hasPassword: Boolean(password),
      emailSelector: custom(emailSelector, 'emailSelector'),
      passwordSelector: custom(passwordSelector, 'passwordSelector'),
      submitSelector: custom(submitSelector, 'submitSelector'),
      session: sessionTime(id),
    };
  });
}

export function saveLogin(input) {
  const id = String(input.id || '').trim();
  if (!isValidId(id)) throw problem('The login name may only contain letters, numbers, - and _.');
  const logins = readFile();
  const old = logins[id] || {};
  const next = { ...old };
  if ('loginUrl' in input) {
    const url = String(input.loginUrl || '').trim();
    try { if (!/^https?:$/.test(new URL(url).protocol)) throw new Error(); } catch { throw problem(`"${url}" is not a valid login address (it must start with http:// or https://).`); }
    next.loginUrl = url;
  }
  if ('email' in input) next.email = String(input.email || '').trim();
  if (input.password) next.password = String(input.password); // an empty password keeps the saved one
  for (const key of Object.keys(DEFAULT_SELECTORS)) {
    if (key in input) { const v = String(input[key] || '').trim(); if (v) next[key] = v; else delete next[key]; }
  }
  if (!next.loginUrl) throw problem('A login needs the address of its login page.');
  logins[id] = next;
  writeFile(logins);
  return id;
}

export function deleteLogin(id) {
  const logins = readFile();
  delete logins[id];
  writeFile(logins);
  fs.rmSync(stateFile(id), { force: true });
}

// Logs in with an already running browser and saves the session.
// Returns { ok, error?, finalUrl? }; never throws for "wrong password" style problems.
export async function loginWith(browser, id) {
  const login = resolveLogin(id);
  if (!login) return { ok: false, error: `There is no login "${id}". Add it in the dashboard (Logins) or run: npm run login ${id}` };
  const missing = ['loginUrl', 'email', 'password'].filter((k) => !login[k]);
  if (missing.length) return { ok: false, error: `Login "${id}" is missing: ${missing.join(', ')}.` };

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
  try {
    const page = await context.newPage();
    await page.goto(login.loginUrl, { waitUntil: 'load', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    const startPath = new URL(page.url()).pathname;

    const email = page.locator(login.emailSelector).first();
    const password = page.locator(login.passwordSelector).first();
    try {
      await email.fill(login.email, { timeout: 10_000 });
      await password.fill(login.password, { timeout: 10_000 });
    } catch {
      return { ok: false, error: `Could not find the login form on ${login.loginUrl}. Set the field selectors for "${id}".` };
    }
    await Promise.all([
      page.locator(login.submitSelector).first().click({ timeout: 10_000 }).catch(() => password.press('Enter')),
    ]);
    // Logged in = we left the login page, or the password field is gone.
    const left = await page.waitForFunction(
      (from) => location.pathname !== from || !document.querySelector('input[type="password"]'),
      startPath, { timeout: LOGIN_TIMEOUT },
    ).then(() => true).catch(() => false);
    if (!left) return { ok: false, error: `Login "${id}" did not complete: still on the login page. Wrong email or password?` };
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    fs.mkdirSync(AUTH_DIR, { recursive: true });
    await context.storageState({ path: stateFile(id) });
    fs.chmodSync(stateFile(id), 0o600);
    return { ok: true, finalUrl: page.url() };
  } catch (err) {
    return { ok: false, error: String(err.message || err).split('\n')[0] };
  } finally {
    await context.close();
  }
}

// Logs in once per id for a capture run. Returns { [id]: { ok, error? } }.
export async function ensureSessions(browser, ids) {
  const sessions = {};
  for (const id of ids) sessions[id] = await loginWith(browser, id);
  return sessions;
}

// Opens its own browser: for "npm run login" and the dashboard's "Log in now".
export async function loginStandalone(config, id) {
  const { browser } = await launchBrowser(config, { headless: !config.showBrowser });
  try { return await loginWith(browser, id); } finally { await browser.close(); }
}
