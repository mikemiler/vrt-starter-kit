# VRT Starter Kit

**Your own visual regression testing tool for WordPress client sites.**
Built for the *Confident Updates* workshop.

Before a WordPress update, take a photo of every client page. After the update, take
another one. Let the computer compare both and show you exactly what changed.
That's visual regression testing, and today you build your own tool for it.

No programming skills needed. You work in a dashboard in your browser.

---

## Get ready (we do this together at the start of the workshop)

You don't have to prepare anything. If you want to save time, you can do steps 1 to 3 at home.

### 1. Install Node.js

Download the **LTS** version from [nodejs.org](https://nodejs.org) and install it like
any other program. You need version 20 or newer.

### 2. Make sure you have Chrome or Edge

Edge is already on every Windows laptop. On a Mac, install
[Google Chrome](https://www.google.com/chrome/) if you don't have it.

### 3. Download this project

- **Easiest:** download **vrt-starter-kit.zip** from the
  [latest release](https://github.com/mikemiler/vrt-starter-kit/releases/latest)
  and unzip it into your Documents folder. Everything is included.
- **With git:** `git clone https://github.com/mikemiler/vrt-starter-kit.git`

### 4. Start it

Double-click the start file in the folder:

- **Mac:** `Start (Mac).command`. The first time, macOS blocks it ("not opened").
  Click **Done**, open **System Settings → Privacy & Security**, scroll down and click
  **Open Anyway** next to the message about the file, then confirm with your password.
  After that, a double-click is enough.
- **Windows:** `Start (Windows).bat`. If a blue "Windows protected your PC" box appears,
  click **More info**, then **Run anyway**.

Prefer the terminal? Open one in the folder and type `npm start`. Same result.

The first start installs what's missing by itself. Then the practice website starts
and the **dashboard** opens in your browser (<http://localhost:4100>).
Keep the terminal window open. Everything else happens with buttons: add your pages,
switch desktop and mobile on or off, take before and after photos, look at the results,
unlock the next step.

Something doesn't work? Run `npm run doctor`. It checks your laptop and tells you
what to fix.

Practice website: <http://localhost:4000> · Control panel to break it:
<http://localhost:4000/control>

### 5. Bring 3 to 5 client URLs

Pages you maintain, publicly reachable (no login pages). Ideal: one with a cookie banner,
one with a slider or animations, and one "boring" page.

## Settings

Everything is set in the dashboard: pages, screen sizes, threshold, and **snippets**
(small, editable JavaScript steps per page for cookie banners, sliders and other
moving parts). You never have to open a file. Only Slack and an unusual browser
location are set in `config.js`.

---

## After the workshop: your update routine

1. **Before** you update: click **Take baseline** in the dashboard
2. Update WordPress, plugins, theme
3. **After** the update: click **Compare**
4. Look at everything red in the report

The same works in the terminal, handy for automation:

| Command | What it does |
|---|---|
| `npm run baseline` | Saves the before photos |
| `npm run check` | Takes after photos, compares, tells you the result |
| `npm run capture` | Takes plain screenshots |
| `npm run pick <url>` | Element picker, without the dashboard |
| `npm run doctor` | Checks your laptop is ready |
| `npm run reset` | Back to the start: Step 0, practice pages only, no photos |

More ideas in the `examples` folder: run it on a schedule, in GitHub Actions,
or with Playwright Test.

## Troubleshooting

- **"Could not start Chrome or Edge":** install Google Chrome. If it's installed in
  an unusual place, put the full path into `browserPath` in `config.js`.
- **"Site not reachable":** is `npm start` still running in the terminal window?
- **"config.js has a mistake":** usually a missing comma or quote. Compare with the
  examples in the comments.
- **"npm is not recognized" / "command not found: npm":** Node.js is not installed yet,
  or the terminal was open during the installation. Close it and open a new one.
- **Corporate laptop without permissions?** Use GitHub Codespaces: on GitHub click
  **Code → Codespaces → Create codespace**. Everything is preinstalled.

License: MIT. Built for the *Confident Updates* workshop by Mike Miler, founder of [WebChange Detector](https://www.webchangedetector.com).
