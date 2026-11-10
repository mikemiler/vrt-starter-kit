// Starts a browser for taking screenshots.
// We use the Chrome or Edge you already have, so nothing big needs downloading.
import { chromium } from 'playwright-core';

const AUTO_ORDER = ['chrome', 'msedge', 'chromium'];

export async function launchBrowser(config = {}, { headless = true } = {}) {
  const customPath = process.env.VRT_BROWSER_PATH || config.browserPath;
  const args = process.platform === 'linux' ? ['--no-sandbox'] : [];

  if (customPath) {
    const browser = await chromium.launch({ executablePath: customPath, args, headless });
    return { browser, name: `custom (${customPath})` };
  }

  const wanted = config.browser && config.browser !== 'auto' ? [config.browser] : AUTO_ORDER;
  const errors = [];
  for (const name of wanted) {
    try {
      const options = { args, headless };
      if (name !== 'chromium') options.channel = name;
      const browser = await chromium.launch(options);
      return { browser, name };
    } catch (err) {
      errors.push(`${name}: ${String(err.message).split('\n')[0]}`);
    }
  }
  const error = new Error(
    'Could not start Chrome or Edge.\n' +
    '  Please install Google Chrome (https://www.google.com/chrome/)\n' +
    '  or ask a helper. Details:\n    ' + errors.join('\n    ')
  );
  error.friendly = true;
  throw error;
}
