// Small helpers for friendly, colourful terminal output.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));

export const green = wrap('32');
export const red = wrap('31');
export const yellow = wrap('33');
export const cyan = wrap('36');
export const dim = wrap('2');
export const bold = wrap('1');

export const ok = (msg) => console.log(`  ${green('✔')} ${msg}`);
export const fail = (msg) => console.log(`  ${red('✘')} ${msg}`);
export const warn = (msg) => console.log(`  ${yellow('!')} ${msg}`);
export const info = (msg) => console.log(`  ${cyan('›')} ${msg}`);

export function title(text) {
  console.log('');
  console.log(bold(text));
  console.log(dim('─'.repeat(Math.min(60, text.length + 10))));
}

export function locked(stepNumber, what) {
  console.log('');
  console.log(`  🔒 ${bold(what)} is not unlocked yet.`);
  console.log(`     It arrives in ${bold('Step ' + stepNumber)} of the workshop.`);
  console.log(`     When we get there, click "Unlock" in the dashboard (or run ${cyan('npm run step ' + stepNumber)}).`);
  console.log('');
}
