// =====================================================================
//  VRT STARTER KIT  ·  technical settings
//
//  Everything you need in the workshop is in the dashboard (npm start):
//  pages, screen sizes, threshold, snippets. This file only holds a few
//  technical settings you normally don't need.
//
//  Lines starting with // are comments. Every setting ends with a comma.
// =====================================================================

export default {

  // -------------------------------------------------------------------
  //  STEP 5 · Get notified
  // -------------------------------------------------------------------
  //  Paste a Slack "Incoming Webhook" URL to get a message after each check.
  //  Leave empty ('') to turn it off.
  slackWebhook: '',


  // -------------------------------------------------------------------
  //  Browser (only if "npm run doctor" can't find Chrome or Edge)
  // -------------------------------------------------------------------
  //  Which browser to use: 'auto', 'chrome', 'msedge' or 'chromium'.
  browser: 'auto',
  //  Full path to a browser program, only if 'auto' can't find yours.
  browserPath: '',
};
