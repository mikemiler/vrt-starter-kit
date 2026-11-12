// Terminal commands: npm run capture | baseline | compare | check
// The dashboard (npm start) does the same with buttons. The terminal is handy
// for automation later: a schedule, a GitHub Action, a script of your own.
import { loadConfig, buildShots } from './config-loader.js';
import { ensureDirs } from './paths.js';
import * as ui from './ui.js';
import * as capture from './capture.js';
import * as compare from './compare.js';
import * as workflow from './workflow.js';
import * as auth from './auth.js';

const command = process.argv[2];

// npm run login [name] [--url=<login page>] [--email=<email>] [--password=<password>]
// With --url/--email/--password the login is saved to auth.json first; without a name every saved login is tried.
async function runLogin(config) {
  const args = process.argv.slice(3);
  const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
    const [key, ...rest] = a.slice(2).split('=');
    return [key === 'url' ? 'loginUrl' : key, rest.join('=')];
  }));
  const id = args.find((a) => !a.startsWith('--'));
  if (id && Object.keys(flags).length) auth.saveLogin({ id, ...flags });
  const ids = id ? [id] : auth.listLoginIds();
  if (!ids.length) return ui.warn('No logins yet. Example: npm run login cms -- --url=http://localhost:3150/admin/login --email=you@example.com --password=...');
  ui.title(`🔑 Logging in: ${ids.join(', ')}`);
  for (const one of ids) {
    const res = await auth.loginStandalone(config, one);
    if (res.ok) ui.ok(`${one.padEnd(20)} ${ui.dim(res.finalUrl)}`); else { ui.fail(`${one.padEnd(20)} ${ui.red(res.error)}`); process.exitCode = 1; }
  }
}

async function main() {
  const config = await loadConfig();
  if (command === 'login') return runLogin(config);
  const shots = buildShots(config);
  ensureDirs();

  if (shots.length === 0) {
    ui.warn('No pages are switched on. Add pages and switch on desktop or mobile in the dashboard (npm start).');
    return;
  }

  switch (command) {
    case 'capture': {
      if (capture.lockedUntil) return ui.locked(capture.lockedUntil, 'Taking screenshots');
      ui.title(`📸 Taking screenshots of ${shots.length} page/size combinations`);
      await capture.takeScreenshots(config, shots);
      ui.info(`Saved in the folder ${ui.bold('screenshots/current')} (one folder per run). Open it and have a look!`);
      break;
    }

    case 'baseline': {
      if (compare.lockedUntil) return ui.locked(compare.lockedUntil, 'Saving a baseline');
      ui.title('📸 Saving the BEFORE photos (baseline)');
      await compare.saveBaseline(config, shots);
      ui.info(`Next: change something, then run ${ui.cyan('npm run compare')}`);
      break;
    }

    case 'compare': {
      if (compare.lockedUntil) return ui.locked(compare.lockedUntil, 'Comparing');
      ui.title('📸 Taking the AFTER photos and comparing');
      const check = await compare.runCompare(config, shots);
      compare.printSummary(check);
      if (!workflow.lockedUntil) await workflow.afterCompare(config, check);
      break;
    }

    case 'check': {
      if (workflow.lockedUntil) return ui.locked(workflow.lockedUntil, 'The one-command update check');
      await workflow.runCheck(config, shots);
      break;
    }

    default:
      ui.warn(`Unknown command "${command}".`);
  }
}

main().catch((err) => {
  console.log('');
  ui.fail(err.friendly ? err.message : `Something went wrong: ${err.message}`);
  if (!err.friendly) console.log(ui.dim(err.stack));
  console.log('');
  process.exitCode = 1;
});
