// LOGIN FIELD PICKER · pick the login form fields by clicking them.
//
//   npm run login -- <name> --pick          (or "Pick fields" in the dashboard, card Logins)
//
// Opens the login page in a visible browser with the element picker. A bar at the bottom guides you:
// click the email field, the password field, the login button. The selectors are saved into the login
// (auth.json), then we try the login once and tell you whether it worked.
// Password not visible yet (email, "Next", then password)? Switch "Picking" OFF in the top bar, type the
// email, press Next, switch it ON again and click the password field.
import { launchBrowser } from './browser.js';
import { loadConfig } from './config-loader.js';
import { PICKER_SCRIPT } from './picker.js';
import * as auth from './auth.js';

const SKIP_ID = '__vrt-guide-skip'; // the picker swallows clicks, so a click on this element arrives as a "pick"
const STAGES = [
  { key: 'emailSelector', text: '① Click the EMAIL / username field', skippable: false },
  { key: 'passwordSelector', text: '② Click the PASSWORD field', skippable: false },
  { key: 'submitSelector', text: '③ Click the LOGIN button (or skip: Enter is pressed instead)', skippable: true },
];

// Runs inside the page: the guide bar at the bottom.
const GUIDE_SCRIPT = (skipId) => {
  window.__vrtGuide = (text, skippable, tone) => {
    let el = document.getElementById('__vrt-guide');
    if (!el) {
      el = document.createElement('div');
      el.id = '__vrt-guide';
      el.setAttribute('popover', 'manual'); // top layer: stays above cookie banners
      Object.assign(el.style, { position: 'fixed', inset: 'auto', bottom: '16px', left: '50%', transform: 'translateX(-50%)', margin: '0', border: '0', overflow: 'visible', zIndex: '2147483647', font: '15px/1.4 system-ui,sans-serif', padding: '12px 16px', borderRadius: '12px', color: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,.35)', display: 'flex', gap: '12px', alignItems: 'center', maxWidth: '92vw' });
      document.body.append(el);
    }
    el.style.background = tone === 'ok' ? '#1f8a4c' : tone === 'error' ? '#b3261e' : '#1d1d1b';
    el.innerHTML = '';
    const span = document.createElement('span'); span.textContent = text; el.append(span);
    if (skippable) {
      const skip = document.createElement('button'); skip.id = skipId; skip.textContent = 'Skip';
      Object.assign(skip.style, { font: 'inherit', fontSize: '13px', padding: '5px 12px', borderRadius: '7px', border: '1px solid #666', background: '#2a2a28', color: '#fff', cursor: 'pointer' });
      el.append(skip);
    }
    try { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } catch { /* old browser: z-index only */ }
  };
};

// Returns { ok, error?, picks } once the picking and the test login are finished.
export async function pickLoginFields(config, id, { onEvent = () => {}, browser: given = null } = {}) { // `browser`: for tests
  const login = auth.resolveLogin(id);
  if (!login?.loginUrl) throw Object.assign(new Error(`There is no login "${id}" with a login page address. Save it first.`), { friendly: true });

  const browser = given || (await launchBrowser(config, { headless: false })).browser;
  try {
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    let stage = 0;
    let guide = { text: STAGES[0].text, skippable: false, tone: '' };
    const picks = {};
    const showGuide = () => page.evaluate(([g]) => window.__vrtGuide?.(g.text, g.skippable, g.tone), [guide]).catch(() => {});
    const setGuide = (next) => { guide = { skippable: false, tone: '', ...next }; return showGuide(); };

    const finished = new Promise((resolve) => {
      const advance = async () => {
        stage += 1;
        if (stage < STAGES.length) return setGuide({ text: STAGES[stage].text, skippable: STAGES[stage].skippable });
        await setGuide({ text: 'Testing the login …' });
        const result = await auth.loginWith(browser, id);
        await setGuide(result.ok
          ? { text: '✔ Login works. You can close this window.', tone: 'ok' }
          : { text: `✘ ${result.error}`, tone: 'error' });
        onEvent({ done: true, ok: result.ok, error: result.error, picks });
        setTimeout(() => resolve({ ...result, picks }), 4000);
      };

      context.exposeBinding('__vrtPicked', async (source, selector) => {
        if (stage >= STAGES.length) return;
        const { key, skippable } = STAGES[stage];
        if (selector === `#${SKIP_ID}`) { if (skippable) await advance(); return; }
        if (selector.includes('__vrt-guide') || selector.includes('__pk')) return; // our own bar
        picks[key] = selector;
        auth.saveLogin({ id, [key]: selector });
        onEvent({ field: key, selector });
        await advance();
      }).catch(() => {});
    });

    await context.addInitScript(PICKER_SCRIPT);
    await context.addInitScript(GUIDE_SCRIPT, SKIP_ID);
    page.on('domcontentloaded', () => setTimeout(showGuide, 300));
    page.on('load', () => setTimeout(showGuide, 300));
    page.on('close', () => onEvent({ done: true, ok: false, error: 'The browser window was closed.', picks }));
    await page.goto(login.loginUrl, { waitUntil: 'load', timeout: 45_000 });
    await showGuide();
    const closed = new Promise((resolve) => page.on('close', () => resolve({ ok: false, error: 'The browser window was closed.', picks })));
    return await Promise.race([finished, closed]);
  } finally {
    if (!given) await browser.close().catch(() => {});
  }
}

// Started by the dashboard ("Pick fields"): reports progress as "LOGINPICK {json}" lines.
const runDirectly = process.argv[1] && import.meta.url.endsWith('/' + process.argv[1].replace(/\\/g, '/').split('/').pop());
if (runDirectly) {
  const id = process.argv[2];
  try {
    const result = await pickLoginFields(await loadConfig(), id, { onEvent: (e) => console.log('LOGINPICK ' + JSON.stringify(e)) });
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(err.friendly ? err.message : err.stack);
    process.exit(1);
  }
}
