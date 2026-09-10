/* Where Playwright lives differs by machine: a checkout with node_modules, a
   container with it installed image-wide, or somewhere a caller names. Try each
   in turn so no suite carries a path that is right on only one of them. */
const CANDIDATES = [
  process.env.PLAYWRIGHT_MODULE,          // an explicit override wins
  'playwright',                           // the repo's own node_modules
  '/opt/node22/lib/node_modules/playwright/index.mjs'
].filter(Boolean);

export async function playwright() {
  const failures = [];
  for (const where of CANDIDATES) {
    try { return await import(where); } catch (e) { failures.push(where + ': ' + e.message); }
  }
  throw new Error('Playwright not found. Tried:\n  ' + failures.join('\n  ') +
                  '\nInstall it with "npm install", or set PLAYWRIGHT_MODULE.');
}
