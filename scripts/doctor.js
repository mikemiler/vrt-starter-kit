// npm run doctor
// Checks that your laptop is ready for the workshop. Green = good, red = ask for help.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import * as ui from '../src/ui.js';
import { ROOT, SHOTS } from '../src/paths.js';

let problems = 0;
const bad = (msg, fix) => { problems++; ui.fail(msg); if (fix) console.log('      ' + ui.yellow('→ ' + fix)); };

ui.title('🩺 Checking your laptop for the workshop');

// 1. Node.js version
const major = Number(process.versions.node.split('.')[0]);
if (major >= 20) ui.ok(`Node.js ${process.versions.node}`);
else bad(`Node.js ${process.versions.node} is too old (need 20 or newer)`, 'Install the LTS version from https://nodejs.org');

// 2. Packages installed
let chromium = null;
try {
  ({ chromium } = await import('playwright-core'));
  await import('pixelmatch');
  await import('pngjs');
  ui.ok('Packages installed');
} catch {
  bad('Packages are missing', 'Run: npm install');
}

// 3. Settings file readable
try {
  const { default: config } = await import(new URL('../config.js', import.meta.url));
  ui.ok('config.js is readable');
} catch (err) {
  bad('config.js has a mistake: ' + err.message.split('\n')[0], 'Look for a missing comma or quote');
}

// 4. Can we write files?
try {
  fs.mkdirSync(SHOTS, { recursive: true });
  const probe = path.join(SHOTS, '.write-test');
  fs.writeFileSync(probe, 'ok');
  fs.rmSync(probe);
  ui.ok('Can save screenshots in this folder');
} catch {
  bad('Cannot write in this folder', 'Move the project into your Documents folder and try again');
}

// 5. Browser starts and takes a test photo
if (chromium) {
  const { launchBrowser } = await import('../src/browser.js');
  let config = {};
  try { config = (await import(new URL('../config.js', import.meta.url))).default; } catch {}
  try {
    const { browser, name } = await launchBrowser(config);
    const page = await browser.newPage({ viewport: { width: 400, height: 200 } });
    await page.setContent('<h1 style="font-family:sans-serif">Hello workshop 👋</h1>');
    const png = await page.screenshot();
    await browser.close();
    if (png.length > 1000) ui.ok(`Browser works (${name}) and took a test screenshot`);
    else bad('The browser started but the screenshot was empty');
  } catch (err) {
    bad('Could not start Chrome or Edge', 'Install Google Chrome from https://www.google.com/chrome/ and run npm run doctor again');
    console.log(ui.dim('      ' + String(err.message).split('\n').slice(0, 3).join('\n      ')));
  }
}

// 6. Ports for the practice site (4000) and the report (4100)
for (const [port, what] of [[4000, 'practice site'], [4100, 'report']]) {
  const free = await new Promise((resolve) => {
    const srv = net.createServer().once('error', () => resolve(false))
      .once('listening', () => srv.close(() => resolve(true))).listen(port, '127.0.0.1');
  });
  if (free) ui.ok(`Port ${port} is free for the ${what}`);
  else ui.warn(`Port ${port} is in use. If the ${what} is already running, that's fine.`);
}

// 7. Internet (only needed for your own client sites)
try {
  const res = await fetch('https://example.com', { signal: AbortSignal.timeout(5000) });
  if (res.ok) ui.ok('Internet connection works');
  else ui.warn('Internet seems limited. The practice site still works offline.');
} catch {
  ui.warn('No internet right now. The practice site still works offline.');
}

console.log('');
if (problems === 0) {
  console.log(ui.green(ui.bold('  ✔ All green! You are ready for the workshop. See you there.')));
} else {
  console.log(ui.red(ui.bold(`  ✘ ${problems} thing(s) need fixing. Follow the yellow hints, or ask a helper.`)));
  process.exitCode = 1;
}
console.log(ui.dim(`  (Project folder: ${ROOT})`));
console.log('');
