// npm run reset
// Puts this folder back to the state of a fresh download: Step 0, the
// practice pages, no photos, no settings, no snippets, no codes entered.
// Handy after testing, so you see exactly what everybody else sees.
import readline from 'node:readline/promises';
import { resetToStart } from '../src/steps.js';

const yes = process.argv.includes('--yes') || process.argv.includes('-y');
if (!yes) {
  console.log('\n  This resets everything to the start: Step 0, the practice pages only,');
  console.log('  no photos, no settings, no snippets. Your own pages are removed too.\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('  Type "reset" to continue: ')).trim().toLowerCase();
  rl.close();
  if (answer !== 'reset') { console.log('\n  Nothing changed.\n'); process.exit(0); }
}
try {
  await resetToStart();
  // If the dashboard is running, let it restart with the start package.
  const port = Number(process.env.DASHBOARD_PORT || 4100);
  const running = await fetch(`http://127.0.0.1:${port}/api/restart`, { method: 'POST', signal: AbortSignal.timeout(2000) })
    .then((r) => r.ok).catch(() => false);
  console.log(`\n  ✔ Back to the start.${running ? ' The dashboard restarts, reload the page in your browser.' : ''}\n`);
} catch (err) {
  console.log(`\n  ✘ ${err.message}\n`);
  process.exit(1);
}
