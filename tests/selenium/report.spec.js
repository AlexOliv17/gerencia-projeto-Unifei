const assert = require('node:assert/strict');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const { fixtures } = require('./support/fixtures');
const {
  visit, selectByText, click, text, texts, exists, login, logout,
} = require('./support/ui');

const ORGANIZER = 'organizador@arenalocal.com';

/** Downloads a file with the browser's session and returns its type, name and content as text. */
async function download(driver, path) {
  return driver.executeAsyncScript((url, done) => {
    fetch(url).then(async (r) => done({
      status: r.status, type: r.headers.get('content-type'), disposition: r.headers.get('content-disposition'), body: await r.text(),
    }));
  }, path);
}

describe('RFS22 - Gerar Relatório de Inscrições', function () {
  let server;
  let driver;
  let f;

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    f = fixtures(server.db);
    f.team('Time "Aspas"; FC');
    f.register('Copa Itajubá de Futsal', 'Time "Aspas"; FC', { category: 'Sub-17' });
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  const reportPath = (champ = 'Copa Itajubá de Futsal') => `/my/championships/${f.champId(champ)}/report`;

  async function openReport() {
    await login(driver, server.baseUrl, ORGANIZER, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/championships');
    await click(driver, `#report-${f.champId('Copa Itajubá de Futsal')}`);
  }

  it('lista as inscrições por categoria e status, com totais', async function () {
    await openReport();
    assert.deepEqual(await texts(driver, 'section[data-testid="report-category"] .category'), ['Adulto', 'Sub-17']);
    const adulto = f.categoryId('Copa Itajubá de Futsal', 'Adulto');
    assert.deepEqual(await texts(driver, `#report-category-${adulto} .entry`), ['Unidos de Itajubá', 'Leoas da Serra']);
    assert.deepEqual(await texts(driver, `#report-category-${adulto} .responsible`), ['João Torcedor', 'Maria Capitã']);
    assert.equal(await text(driver, `#totals-${adulto}`), 'Pendente: 1 · Aprovada: 1');
  });

  it('filtra por categoria e status', async function () {
    await openReport();
    await selectByText(driver, 'category_id', 'Adulto');
    await selectByText(driver, 'status', 'Aprovada');
    await click(driver, '#filter-submit');
    assert.deepEqual(await texts(driver, 'tr[data-testid="report-row"] .entry'), ['Leoas da Serra']);
  });

  it('exporta CSV com os mesmos filtros, pronto para o Excel', async function () {
    await openReport();
    await selectByText(driver, 'status', 'Aprovada');
    await click(driver, '#filter-submit');
    const href = await (await driver.findElement({ css: '#export-csv' })).getAttribute('href');
    const file = await download(driver, href);
    assert.equal(file.status, 200);
    assert.match(file.type, /^text\/csv/);
    assert.match(file.disposition, /attachment; filename="inscricoes-campeonato-\d+\.csv"/);
    const lines = file.body.replace(/^\uFEFF/, '').trim().split('\r\n');
    assert.equal(lines[0], 'Categoria;Equipe;Responsável;Status;Data do pedido;Data da decisão;Motivo da recusa');
    assert.equal(lines.length, 3);
    assert.match(lines[1], /^Adulto;Leoas da Serra;Maria Capitã;Aprovada;\d{2}\/\d{2}\/\d{4} \d{2}:\d{2};/);
    assert.match(lines[2], /^Sub-17;"Time ""Aspas""; FC";Maria Capitã;Aprovada;/);
  });

  it('exporta PDF', async function () {
    await openReport();
    const href = await (await driver.findElement({ css: '#export-pdf' })).getAttribute('href');
    const file = await download(driver, href);
    assert.equal(file.status, 200);
    assert.equal(file.type, 'application/pdf');
    assert.ok(file.body.startsWith('%PDF'));
  });

  it('só o organizador dono e validado gera o relatório', async function () {
    await login(driver, server.baseUrl, 'usuario@arenalocal.com', 'Senha@123');
    await visit(driver, server.baseUrl, reportPath());
    assert.equal(await text(driver, 'h1'), 'Acesso negado');
    await logout(driver);
    await login(driver, server.baseUrl, 'pendente@arenalocal.com', 'Senha@123');
    await visit(driver, server.baseUrl, reportPath());
    assert.equal(await text(driver, 'h1'), 'Cadastro em validação');
    const file = await download(driver, `${reportPath()}.csv`);
    assert.doesNotMatch(file.body, /Leoas da Serra/);
  });
});
