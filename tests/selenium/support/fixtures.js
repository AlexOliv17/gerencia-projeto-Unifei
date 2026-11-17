const { createChampionship } = require('../../../src/models/championships');
const { createTeam } = require('../../../src/models/teams');
const { createRegistration } = require('../../../src/models/registrations');
const { insertMatch } = require('../../../src/models/matches');
const { addDaysIso, todayIso, parseTime } = require('../../../src/validation/dates');

/** Test data straight into the database: championships, teams, approved entries and games for the R03 specs. */
function fixtures(db) {
  const inDays = (n) => addDaysIso(todayIso(), n);
  const userId = (email) => db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  const champId = (name) => db.prepare('SELECT id FROM championships WHERE name = ?').get(name).id;
  const categoryId = (champ, name) => db.prepare(`SELECT cc.id FROM championship_categories cc
    JOIN championships c ON c.id = cc.championship_id WHERE c.name = ? AND cc.name = ?`).get(champ, name).id;
  const teamId = (name) => db.prepare('SELECT id FROM teams WHERE name = ? AND deleted_at IS NULL').get(name).id;

  function championship(name, overrides = {}, owner = 'organizador@arenalocal.com') {
    return createChampionship(db, userId(owner), {
      name, sport: 'futsal', categories: ['Única'], cityId: 1, venue: 'Ginásio Teste', startDate: inDays(5),
      endDate: inDays(60), registrationDeadline: inDays(1), format: 'round_robin', maxSlots: null, rules: null,
      contact: null, allowWaitlist: false, ...overrides,
    });
  }

  function team(name, { owner = 'capita@arenalocal.com', sport = 'futsal' } = {}) {
    return createTeam(db, userId(owner), { name, sport, cityId: 1, athletes: [{ name: `Atleta ${name}`, number: '1' }] });
  }

  /** Entry of a team (or, with team null, of the person `user`) in the championship's category. */
  function register(champ, teamName, { category = 'Única', status = 'approved', user = 'capita@arenalocal.com' } = {}) {
    const owner = teamName ? db.prepare('SELECT owner_id FROM teams WHERE id = ?').get(teamId(teamName)).owner_id : userId(user);
    return createRegistration(db, {
      championshipId: champId(champ), categoryId: categoryId(champ, category), teamId: teamName ? teamId(teamName) : null,
      userId: owner, status,
    });
  }

  function game(champ, a, b, {
    category = 'Única', day = 10, time = '19:00', duration = 60, venue = 'Ginásio Teste', round = 'Rodada 1', kind = 'league',
    group = null, next = null, slot = null,
  } = {}) {
    return insertMatch(db, champId(champ), {
      categoryId: categoryId(champ, category), kind, round, roundNumber: Number(/\d+/.exec(round)?.[0] ?? 1), groupName: group,
      registrationAId: a, registrationBId: b, date: inDays(day), startTime: parseTime(time), duration, venue,
      nextMatchId: next, nextSlot: slot,
    });
  }

  /** Stores a result straight in the database (games the test only needs as already played). */
  function result(matchId, scoreA, scoreB) {
    db.prepare('UPDATE matches SET score_a = ?, score_b = ?, result_updated_at = ?, result_updated_by = ? WHERE id = ?')
      .run(scoreA, scoreB, new Date().toISOString(), userId('organizador@arenalocal.com'), matchId);
  }

  return {
    inDays, userId, champId, categoryId, teamId, championship, team, register, game, result,
  };
}

module.exports = { fixtures };
