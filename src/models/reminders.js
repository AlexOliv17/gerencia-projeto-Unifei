const { formatBrDate, addDaysIso } = require('../validation/dates');
const { startOf, matchReminder, closingReminderDue } = require('../rules/reminders');
const { getMatch } = require('./matches');
const { championshipFollowers } = require('./follows');
const { matchAudience, raceAudience } = require('./audience');
const { notify } = require('./notifications');

const pad = (n) => String(n).padStart(2, '0');
const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WHEN = { '24h': 'em 24 horas', '2h': 'em 2 horas' };

/**
 * RFS18 scheduled notices (Tabela 09): games and race starts 24 h and 2 h ahead, and the end of registrations 48 h
 * ahead for followed championships. Safe to run as often as wanted: the dedupe key (event, its date and time,
 * window) keeps each person from getting the same reminder twice, and a rescheduled event gets new reminders.
 * Returns how many notices went out.
 */
function runReminders(db, now = new Date()) {
  const today = localIso(now);
  const soon = addDaysIso(today, 2);
  let sent = 0;

  const games = db.prepare(`SELECT m.id FROM matches m JOIN championships c ON c.id = m.championship_id
    WHERE m.status = 'scheduled' AND c.status = 'active' AND m.score_a IS NULL AND m.registration_a_id IS NOT NULL
      AND m.registration_b_id IS NOT NULL AND m.match_date BETWEEN ? AND ?`).all(today, soon);
  for (const { id } of games) {
    const m = getMatch(db, id);
    const window = matchReminder(startOf(m.match_date, m.start_time), now);
    if (!window) continue;
    sent += notify(db, {
      userIds: matchAudience(db, m),
      type: 'match_upcoming',
      title: `Jogo ${WHEN[window]}: ${m.nameA} x ${m.nameB}`,
      body: `${m.nameA} x ${m.nameB} (${m.round}) em ${formatBrDate(m.match_date)} às ${m.start_time}, ${m.venue}.`,
      link: `/championships/${m.championship_id}/table?category_id=${m.category_id}`,
      dedupeKey: `match:${m.id}:${m.match_date}T${m.start_time}:${window}`,
    });
  }

  const starts = db.prepare(`SELECT rs.*, cc.name AS category_name, c.name AS championship_name FROM race_starts rs
    JOIN championships c ON c.id = rs.championship_id JOIN championship_categories cc ON cc.id = rs.category_id
    WHERE rs.status = 'scheduled' AND c.status = 'active' AND rs.start_date BETWEEN ? AND ?`).all(today, soon);
  for (const s of starts) {
    const window = matchReminder(startOf(s.start_date, s.start_time), now);
    if (!window) continue;
    sent += notify(db, {
      userIds: raceAudience(db, s.championship_id, s.category_id),
      type: 'match_upcoming',
      title: `Largada ${WHEN[window]}: ${s.championship_name} (${s.category_name})`,
      body: `Largada da categoria ${s.category_name} em ${formatBrDate(s.start_date)} às ${s.start_time}, ${s.venue}.`,
      link: `/championships/${s.championship_id}/table?category_id=${s.category_id}`,
      dedupeKey: `race:${s.category_id}:${s.start_date}T${s.start_time}:${window}`,
    });
  }

  const closing = db.prepare(`SELECT id, name, registration_deadline FROM championships
    WHERE status = 'active' AND registration_deadline BETWEEN ? AND ?`).all(today, soon);
  for (const c of closing) {
    if (!closingReminderDue(c.registration_deadline, now)) continue;
    sent += notify(db, {
      userIds: championshipFollowers(db, c.id),
      type: 'registration_closing',
      title: `Inscrições terminando: ${c.name}`,
      body: `As inscrições do campeonato ${c.name} terminam em ${formatBrDate(c.registration_deadline)}.`,
      link: `/championships/${c.id}`,
      dedupeKey: `closing:${c.id}:${c.registration_deadline}`,
    });
  }
  return sent;
}

module.exports = { runReminders };
