// npm run step <number>
// Unlocks the next building block from the terminal.
// The easier way: the "Unlock" button in the dashboard (npm start).
import { STEPS, unlock } from '../src/steps.js';
import * as ui from '../src/ui.js';

const n = Number(process.argv[2]);
if (!STEPS[n]) {
  console.log(`\n  Please add the step number, for example: ${ui.cyan('npm run step 1')}\n`);
  process.exit(1);
}

const source = await unlock(n);
if (!source) {
  ui.fail(`Step ${n} is not available yet.`);
  console.log('      ' + ui.yellow('→ Wait until we finish this part together, then try again.'));
  console.log('      ' + ui.yellow('→ No internet? Ask a helper for the USB stick.'));
  process.exit(1);
}
console.log('');
console.log(`  🔓 ${ui.bold(`Step ${n} unlocked: ${STEPS[n]}`)} ${ui.dim('(' + source + ')')}`);
console.log('     Your config.js and pages were not changed.');
console.log('     If the dashboard is running, it restarts by itself.');
console.log('');
