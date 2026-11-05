const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { createChampionship } = require('../../src/models/championships');
const { createTeam } = require('../../src/models/teams');
const { createRegistration } = require('../../src/models/registrations');
const { addDaysIso, todayIso } = require('../../src/validation/dates');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  visit, selectByText, submit, click, flash, text, texts, exists, login, logout, forgePost,
} = require('./support/ui');

const inDays = (n) => addDaysIso(todayIso(), n);
const JOAO = 'usuario@arenalocal.com';
const MARIA = 'capita@arenalocal.com';

describe('RFS15 - Solicitar Inscrição', function () {
  let server;
  let driver;

  const db = () => server.db;
  const userId = (email) => db().prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  const teamId = (name) => db().prepare('SELECT id FROM teams WHERE name = ?').get(name).id;
  const champId = (name) => db().prepare('SELECT id FROM championships WHERE name = ?').get(name).id;
  const categoryId = (champ, name) => db().prepare(`SELECT cc.id FROM championship_categories cc
    JOIN championships c ON c.id = cc.championship_id WHERE c.name = ? AND cc.name = ?`).get(champ, name).id;

  function championship(name, overrides = {}) {
    return createChampionship(db(), userId('organizador@arenalocal.com'), {
      name, sport: 'futsal', categories: ['Única'], cityId: 1, venue: 'Quadra', startDate: inDays(30),
      endDate: inDays(31), registrationDeadline: inDays(20), format: 'knockout', maxSlots: null, rules: null,
      contact: null, allowWaitlist: false, ...overrides,
    });
  }

  function register(champ, category, team, email, status) {
    return createRegistration(db(), {
      championshipId: champId(champ), categoryId: categoryId(champ, category), teamId: team ? teamId(team) : null,
      userId: userId(email), status,
    });
  }

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    championship('Copa Vôlei Aberta', { sport: 'volleyball', format: 'round_robin', categories: ['Adulto'] });
    championship('Copa Lotada', { maxSlots: 1 });
    championship('Copa Espera', { maxSlots: 1, allowWaitlist: true });
    championship('Copa Último Dia', { registrationDeadline: todayIso() });
    register('Copa Lotada', 'Única', 'Leoas da Serra', MARIA, 'approved');
    register('Copa Espera', 'Única', 'Leoas da Serra', MARIA, 'approved');
    register('Copa Último Dia', 'Única', 'Unidos de Itajubá', JOAO, 'pending');
    register('Liga de Vôlei Santa Rita', 'Feminino', null, JOAO, 'pending');
    const pendente = db().prepare("SELECT id, city_id FROM users WHERE email = 'pendente@arenalocal.com'").get();
    createTeam(db(), pendente.id, {
      name: 'Time Pendente', sport: 'futsal', cityId: pendente.city_id, athletes: [{ name: 'Paulo', number: '1' }],
    });
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  const rowOf = async (championshipName) => {
    for (const row of await driver.findElements({ css: 'tr[data-testid="registration-row"]' })) {
      const name = (await (await row.findElement({ css: '.championship' })).getText()).trim();
      if (name === championshipName) {
        const cell = async (css) => (await (await row.findElement({ css })).getText()).trim();
        return { category: await cell('.category'), team: await cell('.team'), status: await cell('.status'), row };
      }
    }
    return null;
  };

  async function openRegisterForm(email, champ) {
    await login(driver, server.baseUrl, email, 'Senha@123');
    await visit(driver, server.baseUrl, `/championships/${champId(champ)}`);
    await click(driver, '#register-button');
  }

  it('inscreve a equipe e mostra como pendente', async function () {
    await openRegisterForm(MARIA, 'Copa Itajubá de Futsal');
    await selectByText(driver, 'team_id', 'Leoas da Serra');
    await selectByText(driver, 'category_id', 'Sub-17');
    await submit(driver);
    assert.equal(await flash(driver), 'Inscrição enviada. Aguarde a análise do organizador.');
    assert.deepEqual(await rowOf('Copa Itajubá de Futsal').then(({ category, team, status }) => ({ category, team, status })),
      { category: 'Sub-17', team: 'Leoas da Serra', status: 'Pendente' });
  });

  it('avisa quando não há equipe da modalidade', async function () {
    await openRegisterForm(JOAO, 'Copa Vôlei Aberta');
    assert.equal(await exists(driver, '#no-team-notice'), true);
    assert.equal(await exists(driver, '#create-team-link'), true);
    assert.equal(await exists(driver, '#submit'), false);
  });

  it('organizador pendente pode inscrever equipe', async function () {
    await openRegisterForm('pendente@arenalocal.com', 'Copa Itajubá de Futsal');
    await selectByText(driver, 'team_id', 'Time Pendente');
    await selectByText(driver, 'category_id', 'Sub-17');
    await submit(driver);
    assert.equal((await rowOf('Copa Itajubá de Futsal')).status, 'Pendente');
  });

  it('não aceita fora do prazo', async function () {
    const liga = champId('Liga de Vôlei Santa Rita');
    await login(driver, server.baseUrl, MARIA, 'Senha@123');
    await visit(driver, server.baseUrl, `/championships/${liga}`);
    assert.equal(await exists(driver, '#register-button'), false);
    await forgePost(driver, `/championships/${liga}/register`, {
      team_id: teamId('Vôlei Sapucaí'), category_id: categoryId('Liga de Vôlei Santa Rita', 'Feminino'),
    });
    assert.equal(await flash(driver), MESSAGES.registrationClosed);
  });

  it('não aceita a mesma equipe duas vezes na categoria', async function () {
    await openRegisterForm(JOAO, 'Copa Itajubá de Futsal');
    await selectByText(driver, 'team_id', 'Unidos de Itajubá');
    await selectByText(driver, 'category_id', 'Adulto');
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.registrationDuplicate);
  });

  it('esgota as vagas sem lista de espera', async function () {
    await openRegisterForm(JOAO, 'Copa Lotada');
    await selectByText(driver, 'team_id', 'Unidos de Itajubá');
    await selectByText(driver, 'category_id', 'Única');
    await submit(driver);
    assert.equal(await flash(driver), MESSAGES.registrationFull);
  });

  it('registra na lista de espera quando permitido', async function () {
    await openRegisterForm(JOAO, 'Copa Espera');
    await selectByText(driver, 'team_id', 'Unidos de Itajubá');
    await selectByText(driver, 'category_id', 'Única');
    await submit(driver);
    assert.equal(await flash(driver), 'Inscrição registrada na lista de espera.');
    assert.equal((await rowOf('Copa Espera')).status, 'Lista de espera');
  });

  it('inscrição individual na corrida de rua', async function () {
    await openRegisterForm(MARIA, 'Corrida Rústica de Pouso Alegre');
    assert.equal(await exists(driver, '#team_id'), false);
    await selectByText(driver, 'category_id', '10 km');
    await submit(driver);
    const row = await rowOf('Corrida Rústica de Pouso Alegre');
    assert.equal(row.team, 'Individual');
    assert.equal(row.status, 'Pendente');
  });

  it('organizador não se inscreve no próprio campeonato', async function () {
    const copa = champId('Copa Itajubá de Futsal');
    await login(driver, server.baseUrl, 'organizador@arenalocal.com', 'Senha@123');
    await visit(driver, server.baseUrl, `/championships/${copa}`);
    assert.equal(await exists(driver, '#register-button'), false);
    await forgePost(driver, `/championships/${copa}/register`, { category_id: categoryId('Copa Itajubá de Futsal', 'Adulto') });
    assert.equal(await flash(driver), MESSAGES.registrationOwnChampionship);
  });

  it('não usa equipe de outra pessoa', async function () {
    const copa = champId('Copa Vôlei Aberta');
    await login(driver, server.baseUrl, MARIA, 'Senha@123');
    await visit(driver, server.baseUrl, `/championships/${copa}`);
    await forgePost(driver, `/championships/${copa}/register`, {
      team_id: teamId('Unidos de Itajubá'), category_id: categoryId('Copa Vôlei Aberta', 'Adulto'),
    });
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    assert.equal(db().prepare('SELECT COUNT(*) AS n FROM registrations WHERE championship_id = ?').get(copa).n, 0);
  });

  it('cancela a própria inscrição dentro do prazo', async function () {
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/registrations');
    const { row } = await rowOf('Corrida Rústica de Pouso Alegre');
    await (await row.findElement({ css: '.cancel-registration' })).click();
    await click(driver, '#confirm-cancel-registration');
    assert.equal(await flash(driver), 'Inscrição cancelada.');
    assert.equal((await rowOf('Corrida Rústica de Pouso Alegre')).status, 'Cancelada');
  });

  it('cancela no último dia do prazo', async function () {
    const id = db().prepare('SELECT id FROM registrations WHERE championship_id = ?').get(champId('Copa Último Dia')).id;
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, `/my/registrations/${id}/cancel`);
    await click(driver, '#confirm-cancel-registration');
    assert.equal((await rowOf('Copa Último Dia')).status, 'Cancelada');
  });

  it('não cancela depois do prazo', async function () {
    const id = db().prepare('SELECT id FROM registrations WHERE championship_id = ? AND user_id = ?')
      .get(champId('Liga de Vôlei Santa Rita'), userId(JOAO)).id;
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/registrations');
    assert.equal(await exists(driver, `#cancel-registration-${id}`), false);
    await forgePost(driver, `/my/registrations/${id}/cancel`);
    assert.equal(await flash(driver), 'O prazo para cancelar esta inscrição terminou.');
    assert.equal(db().prepare('SELECT status FROM registrations WHERE id = ?').get(id).status, 'pending');
  });

  it('outro usuário não cancela a inscrição', async function () {
    const id = db().prepare('SELECT id FROM registrations WHERE team_id = ? AND championship_id = ?')
      .get(teamId('Unidos de Itajubá'), champId('Copa Itajubá de Futsal')).id;
    await login(driver, server.baseUrl, MARIA, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/registrations');
    await forgePost(driver, `/my/registrations/${id}/cancel`);
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    assert.equal(db().prepare('SELECT status FROM registrations WHERE id = ?').get(id).status, 'pending');
  });

  it('detalhe público mostra as equipes aprovadas', async function () {
    await visit(driver, server.baseUrl, `/championships/${champId('Copa Itajubá de Futsal')}`);
    const adulto = `#approved-category-${categoryId('Copa Itajubá de Futsal', 'Adulto')}`;
    assert.deepEqual(await texts(driver, `${adulto} li[data-testid="approved-entry"]`), ['Leoas da Serra']);
    assert.equal(await text(driver, `${adulto} .slots`), '1/16');
    assert.equal(await exists(driver, '#register-button'), false);
  });
});
