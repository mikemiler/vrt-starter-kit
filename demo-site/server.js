// The practice website: "Olive & Ash", a made-up bakery.
// It runs on your laptop (no internet needed) at http://localhost:4000
// and has a control panel at http://localhost:4000/control where you can
// break it on purpose, like a bad plugin update would.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listenLocal, answersWith } from '../src/local-listen.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DEMO_PORT || 4000);
const STATE_FILE = path.join(DIR, '.state.json');

export const SWITCHES = {
  header:  { group: 'Broken update', label: 'Header layout broken', help: 'The navigation drops below the logo after a theme update.' },
  button:  { group: 'Broken update', label: '"Order now" button gone', help: 'A JavaScript conflict hides the main call-to-action.' },
  font:    { group: 'Broken update', label: 'Wrong font', help: 'The web font fails to load, the browser falls back to a default font.' },
  plugin:  { group: 'Broken update', label: 'Plugin conflict', help: 'The product cards fall apart and the prices are gone.' },
  shift:   { group: 'For the end', label: 'Warning line on top', help: 'A PHP warning appears above the header and pushes the whole page down. Watch how much turns red.' },
  noise:   { group: 'Real life', label: 'Real-world noise', help: 'Cookie banner, rotating slider, live date, animations and lazy images. Nothing is broken, but every visit looks a little different.' },
};

const readState = () => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
};
const writeState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

const PAGES = { '/': 'index.html', '/index.html': 'index.html', '/about.html': 'about.html', '/contact.html': 'contact.html' };
const TYPES = { '.css': 'text/css', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2' };

// "Real-world noise" must look different on every visit, even though this site
// loads in a few milliseconds. Slider image and colour move on with every visit
// of a page on a device (starting at a random point), so the before and the
// after photo of the same page never match by chance.
const NOISE_COLORS = ['#fde68a', '#fecaca', '#bbf7d0', '#bfdbfe', '#e9d5ff'];
const visits = {};
const nextVisit = (key) => (visits[key] = (visits[key] ?? Math.floor(Math.random() * 15)) + 1);

function renderPage(file, userAgent = '') {
  const state = readState();
  const partial = (name) => fs.readFileSync(path.join(DIR, 'partials', name), 'utf8');
  const classes = Object.keys(SWITCHES).filter((k) => state[k]).map((k) => `break-${k}`);
  const visit = state.noise ? nextVisit(file + (/Mobile/.test(userAgent) ? ':mobile' : ':desktop')) : 0;
  const slide = visit % 3;
  const color = NOISE_COLORS[visit % NOISE_COLORS.length];
  const now = new Date();
  return fs.readFileSync(path.join(DIR, file), 'utf8')
    .replace('<!--HEADER-->', partial('header.html'))
    .replace('<!--FOOTER-->', partial('footer.html'))
    .replace('<!--NOISE-->', state.noise ? partial('noise.html') : '')
    .replace('<!--PHP-WARNING-->', state.shift ? partial('php-warning.html') : '')
    .replaceAll('{{HTML_CLASS}}', classes.join(' '))
    .replaceAll('{{SLIDE}}', String(slide))
    .replaceAll('{{NOISE_COLOR}}', color)
    .replaceAll('{{LAZY}}', state.noise ? 'lazy' : 'eager')
    .replaceAll('{{TIME}}', now.toLocaleTimeString('en-GB'))
    .replaceAll('{{NOW}}', now.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'medium' }));
}

function controlPanel() {
  const state = readState();
  const rows = (group) => Object.entries(SWITCHES).filter(([, s]) => s.group === group).map(([key, s]) => `
    <label class="row">
      <input type="checkbox" name="${key}" ${state[key] ? 'checked' : ''}>
      <span><strong>${s.label}</strong><small>${s.help}</small></span>
    </label>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Control panel · Practice site</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f4f1ea;margin:0;color:#222}
  .wrap{max-width:640px;margin:40px auto;padding:0 16px}
  h1{font-size:24px;margin:0 0 4px} p{color:#666;margin:0 0 24px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#888;margin:28px 0 8px}
  .row{display:flex;gap:14px;align-items:flex-start;background:#fff;border:1px solid #e5e0d6;border-radius:10px;padding:14px 16px;margin-bottom:8px;cursor:pointer}
  .row input{width:22px;height:22px;margin-top:2px;accent-color:#d7263d;flex:none}
  .row small{display:block;color:#777;margin-top:3px;line-height:1.4}
  .bar{display:flex;gap:10px;margin-top:20px} a,button{font:inherit;font-weight:600;padding:10px 16px;border-radius:8px;border:1px solid #ccc;background:#fff;color:#222;text-decoration:none;cursor:pointer}
  a.primary{background:#222;color:#fff;border-color:#222} .saved{color:#1f8a4c;font-size:14px;align-self:center;opacity:0;transition:opacity .2s}
</style></head><body><div class="wrap">
<h1>🎛️ Practice site control panel</h1>
<p>Switch things on to simulate what a bad update can do to a client site. Changes apply immediately.</p>
<form id="f"><h2>Broken update</h2>${rows('Broken update')}<h2>Real life</h2>${rows('Real life')}<h2>For the end</h2>${rows('For the end')}</form>
<div class="bar"><a class="primary" href="/" target="_blank">Open the practice site ↗</a><button id="reset">Repair everything</button><span class="saved" id="saved">✔ Saved</span></div>
</div><script>
const f=document.getElementById('f'), saved=document.getElementById('saved');
async function save(){const s={};f.querySelectorAll('input').forEach(i=>s[i.name]=i.checked);
 await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)});
 saved.style.opacity=1;setTimeout(()=>saved.style.opacity=0,900);}
f.addEventListener('change',save);
document.getElementById('reset').onclick=()=>{f.querySelectorAll('input').forEach(i=>i.checked=false);save();};
</script></body></html>`;
}

const handler = (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (status, body, type = 'text/html; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };

  if (url.pathname === '/control') return send(200, controlPanel());
  if (url.pathname === '/api/state') {
    if (req.method === 'GET') return send(200, JSON.stringify(readState()), 'application/json');
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const incoming = JSON.parse(body || '{}');
      const next = {};
      for (const key of Object.keys(SWITCHES)) next[key] = Boolean(incoming[key]);
      writeState(next);
      const on = Object.keys(next).filter((k) => next[k]);
      console.log(`  › Practice site now: ${on.length ? on.join(', ') : 'everything normal'}`);
      send(200, JSON.stringify(next), 'application/json');
    });
    return;
  }
  if (PAGES[url.pathname]) return send(200, renderPage(PAGES[url.pathname], req.headers['user-agent']));

  const asset = url.pathname.match(/^\/assets\/([\w.-]+)$/);
  if (asset) {
    const file = path.join(DIR, 'assets', asset[1]);
    if (fs.existsSync(file)) {
      // Lazy images arrive a little late in "noise" mode, like on a slow host.
      const delay = readState().noise && asset[1].startsWith('gallery') ? 400 + Math.random() * 600 : 0;
      return setTimeout(() => send(200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream'), delay);
    }
  }
  send(404, '<h1>404 Not found</h1>');
};

// Only reachable from this laptop (HOST=0.0.0.0 opens it up, e.g. in a container).
listenLocal(handler, PORT, {
  name: 'practice site',
  envVar: 'DEMO_PORT',
  isOurs: () => answersWith(PORT, '/control', async (res) => (await res.text()).includes('Control panel · Practice site')),
  onListening: () => {
    if (process.env.QUIET) {
      console.log(`  🥐 Practice site:  http://localhost:${PORT}   (control panel: /control)`);
      return;
    }
    console.log('');
    console.log('  🥐 Practice site is running');
    console.log(`  › Website:        http://localhost:${PORT}`);
    console.log(`  › Control panel:  http://localhost:${PORT}/control`);
    console.log('  › Keep this window open. Stop with Ctrl + C.');
    console.log('');
  },
});
