const fs = require('node:fs');
const path = require('node:path');
const { activeDrivers } = require('./driver');

const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'evidence', 'screenshots');

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

exports.mochaHooks = {
  async afterEach() {
    if (this.currentTest.state !== 'failed') return;
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const drivers = activeDrivers();
    for (const [i, driver] of drivers.entries()) {
      try {
        const png = await driver.takeScreenshot();
        const suffix = drivers.length > 1 ? `-${i + 1}` : '';
        fs.writeFileSync(path.join(SCREENSHOT_DIR, `${slug(this.currentTest.fullTitle())}${suffix}.png`), png, 'base64');
      } catch {
        // the browser may already be gone; the failure itself is what matters
      }
    }
  },
};
