const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const drivers = new Set();

/** Chrome driver: headless unless HEADLESS=false. Registered so failing tests get a screenshot. */
async function buildDriver() {
  const options = new chrome.Options().windowSize({ width: 1280, height: 900 });
  if (process.env.HEADLESS !== 'false') options.addArguments('--headless=new');
  options.addArguments('--disable-search-engine-choice-screen', '--no-first-run', '--password-store=basic');
  // Chrome's password manager pops suggestions over password fields and swallows keystrokes/clicks.
  options.addArguments('--disable-features=PasswordLeakDetection,PasswordGeneration,AutofillServerCommunication');
  options.setUserPreferences({
    credentials_enable_service: false,
    'profile.password_manager_enabled': false,
    'profile.password_manager_leak_detection': false,
    'autofill.profile_enabled': false,
  });
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  drivers.add(driver);
  return driver;
}

async function quitDriver(driver) {
  if (!driver) return;
  drivers.delete(driver);
  await driver.quit();
}

function activeDrivers() {
  return [...drivers];
}

module.exports = { buildDriver, quitDriver, activeDrivers };
