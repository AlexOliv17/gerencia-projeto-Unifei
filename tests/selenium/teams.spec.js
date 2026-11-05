const assert = require('node:assert/strict');
const { MESSAGES } = require('../../src/constants');
const { createTeam } = require('../../src/models/teams');
const { startTestServer } = require('./support/server');
const { buildDriver, quitDriver } = require('./support/driver');
const {
  visit, fill, selectByText, submit, click, flash, fieldError, text, texts, exists, value, login, logout, forgePost,
} = require('./support/ui');

const JOAO = 'usuario@arenalocal.com';
const MARIA = 'capita@arenalocal.com';

describe('RFS14 - Manter Equipe', function () {
  let server;
  let driver;
  let disposableId;
  let editableId;

  before(async function () {
    server = await startTestServer();
    driver = await buildDriver();
    const { db } = server;
    const joao = db.prepare('SELECT id, city_id FROM users WHERE email = ?').get(JOAO);
    const athletes = [{ name: 'Rui Pires', number: '1' }, { name: 'Caio Leme', number: '2' }];
    disposableId = createTeam(db, joao.id, { name: 'Time Descartável', sport: 'futsal', cityId: joao.city_id, athletes });
    editableId = createTeam(db, joao.id, { name: 'Time Editável', sport: 'football', cityId: joao.city_id, athletes });
    const sub17 = db.prepare(`SELECT cc.id, cc.championship_id FROM championship_categories cc
      JOIN championships c ON c.id = cc.championship_id
      WHERE c.name = 'Copa Itajubá de Futsal' AND cc.name = 'Sub-17'`).get();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO registrations (championship_id, category_id, team_id, user_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)`).run(sub17.championship_id, sub17.id, disposableId, joao.id, now, now);
  });

  after(async function () {
    await quitDriver(driver);
    await server?.close();
  });

  afterEach(async function () {
    if (await exists(driver, '#nav-logout')) await logout(driver);
  });

  const teamId = (name) => server.db.prepare('SELECT id FROM teams WHERE name = ? AND deleted_at IS NULL').get(name)?.id;
  const listedNames = () => texts(driver, 'tr[data-testid="team-row"] .name');

  async function openNewTeamForm(email = JOAO) {
    await login(driver, server.baseUrl, email, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/teams');
    await click(driver, '#new-team');
  }

  async function fillTeam({ name, sport = 'Futsal', city = 'Itajubá', athletes }) {
    await fill(driver, { name, athletes });
    await selectByText(driver, 'sport', sport);
    await selectByText(driver, 'city_id', city);
  }

  it('cadastra equipe e lista em Minhas equipes', async function () {
    await openNewTeamForm();
    await fillTeam({ name: 'Raposas', athletes: 'Ana Souza; 10\nBia Lima; 7\nCaio Reis; 9' });
    await submit(driver);
    assert.equal(await flash(driver), 'Equipe cadastrada com sucesso.');
    assert.ok((await listedNames()).includes('Raposas'));
    const athletes = await texts(driver, `#team-${teamId('Raposas')} .athletes`);
    assert.deepEqual(athletes, ['3']);
  });

  it('rejeita atleta sem número e mantém os dados', async function () {
    await openNewTeamForm();
    await fillTeam({ name: 'Sem Número', athletes: 'Ana Souza; 10\nBia Lima' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'athletes'), MESSAGES.athleteLineInvalid(2));
    assert.equal(await value(driver, 'name'), 'Sem Número');
    assert.equal(teamId('Sem Número'), undefined);
  });

  it('rejeita número repetido', async function () {
    await openNewTeamForm();
    await fillTeam({ name: 'Repetidos', athletes: 'Ana; 1\nBia; 2\nCaio; 1' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'athletes'), MESSAGES.athleteNumberRepeated(3));
  });

  it('rejeita nome repetido do mesmo responsável', async function () {
    await openNewTeamForm();
    await fillTeam({ name: 'unidos de itajubá', athletes: 'Ana; 1' });
    await submit(driver);
    assert.equal(await fieldError(driver, 'name'), 'Você já tem uma equipe com este nome.');
  });

  it('não oferece Corrida de rua como modalidade', async function () {
    await openNewTeamForm();
    assert.deepEqual(await texts(driver, '#sport option'), ['Selecione', 'Futebol', 'Futsal', 'Vôlei']);
  });

  it('altera a equipe', async function () {
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/teams');
    await click(driver, `#edit-team-${editableId}`);
    assert.equal(await value(driver, 'athletes'), 'Rui Pires; 1\nCaio Leme; 2');
    await fill(driver, { name: 'Time Editado', athletes: 'Rui Pires; 1\nCaio Leme; 2\nNovo Atleta; 3' });
    await submit(driver);
    assert.equal(await flash(driver), 'Equipe atualizada com sucesso.');
    await click(driver, `#view-team-${editableId}`);
    assert.equal(await text(driver, '#team-name'), 'Time Editado');
    assert.deepEqual(await texts(driver, 'li[data-testid="athlete"]'), ['Rui Pires — 1', 'Caio Leme — 2', 'Novo Atleta — 3']);
  });

  it('não muda a modalidade com inscrição ativa', async function () {
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, `/my/teams/${teamId('Unidos de Itajubá')}/edit`);
    await selectByText(driver, 'sport', 'Vôlei');
    await submit(driver);
    assert.equal(await fieldError(driver, 'sport'), 'A modalidade não pode mudar enquanto a equipe tiver inscrições ativas.');
    assert.equal(server.db.prepare('SELECT sport FROM teams WHERE id = ?').get(teamId('Unidos de Itajubá')).sport, 'futsal');
  });

  it('exclui equipe sem inscrição aprovada e cancela as pendentes', async function () {
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/teams');
    await click(driver, `#delete-team-${disposableId}`);
    await click(driver, '#confirm-delete');
    assert.equal(await flash(driver), 'Equipe excluída.');
    assert.equal((await listedNames()).includes('Time Descartável'), false);
    const statuses = server.db.prepare('SELECT status FROM registrations WHERE team_id = ?').all(disposableId);
    assert.deepEqual(statuses.map((r) => r.status), ['cancelled']);
    assert.equal(server.db.prepare('SELECT COUNT(*) AS n FROM team_athletes WHERE team_id = ?').get(disposableId).n, 0);
  });

  it('não exclui equipe com inscrição aprovada em campeonato ativo', async function () {
    const leoas = teamId('Leoas da Serra');
    await login(driver, server.baseUrl, MARIA, 'Senha@123');
    await visit(driver, server.baseUrl, '/my/teams');
    await click(driver, `#delete-team-${leoas}`);
    await click(driver, '#confirm-delete');
    assert.equal(await flash(driver), 'Esta equipe tem inscrição aprovada em campeonato ativo e não pode ser excluída.');
    assert.ok((await listedNames()).includes('Leoas da Serra'));
  });

  it('outro usuário não vê nem altera a equipe', async function () {
    const unidos = teamId('Unidos de Itajubá');
    await login(driver, server.baseUrl, MARIA, 'Senha@123');
    for (const path of [`/teams/${unidos}`, `/my/teams/${unidos}/edit`, `/my/teams/${unidos}/delete`]) {
      await visit(driver, server.baseUrl, path);
      assert.equal(await text(driver, 'h1'), MESSAGES.forbidden, path);
    }
    await forgePost(driver, `/my/teams/${unidos}/delete`);
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    assert.equal(teamId('Unidos de Itajubá'), unidos);
  });

  it('organizador do campeonato vê a equipe inscrita', async function () {
    await login(driver, server.baseUrl, 'organizador@arenalocal.com', 'Senha@123');
    await visit(driver, server.baseUrl, `/teams/${teamId('Unidos de Itajubá')}`);
    assert.equal(await text(driver, '#team-name'), 'Unidos de Itajubá');
    assert.equal((await texts(driver, 'li[data-testid="athlete"]')).length, 6);
    assert.deepEqual(await texts(driver, 'tr[data-testid="team-registration-row"] .status'), ['Pendente']);
  });

  it('administrador não tem equipes', async function () {
    await login(driver, server.baseUrl, 'admin@arenalocal.com', 'Admin@123');
    await visit(driver, server.baseUrl, '/my/teams');
    assert.equal(await text(driver, 'h1'), MESSAGES.forbidden);
    assert.equal(await exists(driver, '#nav-my-teams'), false);
  });

  it('equipe inexistente responde página não encontrada', async function () {
    await login(driver, server.baseUrl, JOAO, 'Senha@123');
    await visit(driver, server.baseUrl, '/teams/99999');
    assert.equal(await text(driver, 'h1'), 'Página não encontrada');
  });
});
