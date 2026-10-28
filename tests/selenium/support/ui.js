const { By, until } = require('selenium-webdriver');

const WAIT_MS = 5000;

/** Always starts from a blank page: driver.get to the URL already open (e.g. after a POST) may return before reloading. */
async function visit(driver, baseUrl, path) {
  await driver.get('about:blank');
  await driver.get(baseUrl + path);
}

async function find(driver, css) {
  return driver.wait(until.elementLocated(By.css(css)), WAIT_MS, `elemento ${css} não encontrado`);
}

/** Clears and types into inputs/textareas by id: fill(driver, { name: 'Maria', email: '...' }). */
async function fill(driver, values) {
  for (const [id, value] of Object.entries(values)) {
    const input = await find(driver, `#${id}`);
    await input.clear();
    await input.sendKeys(String(value));
  }
}

async function selectByText(driver, id, text) {
  const select = await find(driver, `#${id}`);
  const options = await select.findElements(By.css('option'));
  for (const option of options) {
    if ((await option.getText()).trim() === text) {
      await option.click();
      return;
    }
  }
  throw new Error(`opção "${text}" não existe em #${id}`);
}

async function selectedText(driver, id) {
  const option = await find(driver, `#${id} option:checked`);
  return (await option.getText()).trim();
}

/**
 * Any error while touching the old element means its document is gone. until.stalenessOf only
 * accepts StaleElementReferenceError, but mid-navigation Chrome may answer "Node with given id
 * does not belong to the document" instead.
 */
async function isDetached(element) {
  try {
    await element.isEnabled();
    return false;
  } catch {
    return true;
  }
}

/** Clicks the button and waits until the old page is gone and the next one finished loading. */
async function click(driver, css) {
  const button = await find(driver, css);
  await button.click();
  await driver.wait(() => isDetached(button), WAIT_MS, `a página não mudou após clicar em ${css}`);
  await driver.wait(async () => (await driver.executeScript('return document.readyState')) === 'complete', WAIT_MS);
}

async function submit(driver) {
  await click(driver, '#submit');
}

async function text(driver, css) {
  return (await (await find(driver, css)).getText()).trim();
}

async function texts(driver, css) {
  const elements = await driver.findElements(By.css(css));
  return Promise.all(elements.map(async (e) => (await e.getText()).trim()));
}

async function exists(driver, css) {
  return (await driver.findElements(By.css(css))).length > 0;
}

async function value(driver, id) {
  return (await find(driver, `#${id}`)).getAttribute('value');
}

const flash = (driver) => text(driver, '#flash');
const fieldError = (driver, field) => text(driver, `#error-${field}`);

async function login(driver, baseUrl, email, password) {
  await visit(driver, baseUrl, '/login');
  await fill(driver, { email, password });
  await submit(driver);
}

async function logout(driver) {
  await click(driver, '#nav-logout');
}

module.exports = {
  visit, find, fill, selectByText, selectedText, click, submit, text, texts, exists, value,
  flash, fieldError, login, logout,
};
