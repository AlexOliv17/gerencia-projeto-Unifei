const { MESSAGES } = require('../constants');
const { formatFinishTime } = require('../validation/games');
const { getMatch } = require('./matches');

function addHistory(db, { championshipId, matchId = null, registrationId = null, description, userId }) {
  db.prepare(`INSERT INTO result_history (championship_id, match_id, registration_id, description, changed_by, changed_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(championshipId, matchId, registrationId, description, userId, new Date().toISOString());
}

function scoreLine(match, { scoreA, scoreB, pointsA, pointsB }) {
  const points = pointsA != null ? ` (pontos ${pointsA} x ${pointsB})` : '';
  return `${match.nameA} ${scoreA} x ${scoreB} ${match.nameB}${points}`;
}

const winnerOf = (match, scoreA, scoreB) => (scoreA > scoreB ? match.registration_a_id : match.registration_b_id);

/**
 * RFS10: records or corrects a result, with who and when on the game and a line in the history (RNF04). In a bracket
 * (RFS11 rule 2) the winner takes their slot in the next game; changing the winner is refused once that game has
 * a result. Returns { error } or {}.
 */
function recordResult(db, matchId, data, userId) {
  return db.transaction(() => {
    const match = getMatch(db, matchId);
    const next = match.next_match_id ? getMatch(db, match.next_match_id) : null;
    if (next) {
      const winner = winnerOf(match, data.scoreA, data.scoreB);
      const previous = match.hasResult ? winnerOf(match, match.score_a, match.score_b) : null;
      if (previous !== winner && next.hasResult) return { error: MESSAGES.resultWinnerLocked };
      db.prepare(`UPDATE matches SET registration_${match.next_slot}_id = ?, updated_at = ? WHERE id = ?`)
        .run(winner, new Date().toISOString(), next.id);
    }
    const now = new Date().toISOString();
    db.prepare(`UPDATE matches SET score_a = ?, score_b = ?, points_a = ?, points_b = ?, result_updated_at = ?,
      result_updated_by = ?, updated_at = ? WHERE id = ?`)
      .run(data.scoreA, data.scoreB, data.pointsA, data.pointsB, now, userId, now, matchId);
    const after = scoreLine(match, data);
    const description = match.hasResult
      ? `Resultado corrigido: ${scoreLine(match, {
        scoreA: match.score_a, scoreB: match.score_b, pointsA: match.points_a, pointsB: match.points_b,
      })} → ${after}`
      : `Resultado registrado: ${after}`;
    addHistory(db, { championshipId: match.championship_id, matchId, description, userId });
    return {};
  })();
}

/** Street run: saves the finish times that changed. `times` maps registration id → seconds. Returns how many changed. */
function recordFinishTimes(db, championshipId, runners, times, userId) {
  return db.transaction(() => {
    let changed = 0;
    const now = new Date().toISOString();
    for (const runner of runners) {
      const seconds = times.get(runner.id);
      if (seconds == null || seconds === runner.seconds) continue;
      db.prepare(`INSERT INTO race_results (registration_id, finish_seconds, updated_at, updated_by) VALUES (?, ?, ?, ?)
        ON CONFLICT (registration_id) DO UPDATE SET finish_seconds = excluded.finish_seconds, updated_at = excluded.updated_at,
        updated_by = excluded.updated_by`).run(runner.id, seconds, now, userId);
      const description = runner.seconds == null
        ? `Tempo registrado: ${runner.name} ${formatFinishTime(seconds)}`
        : `Tempo corrigido: ${runner.name} ${formatFinishTime(runner.seconds)} → ${formatFinishTime(seconds)}`;
      addHistory(db, { championshipId, registrationId: runner.id, description, userId });
      changed += 1;
    }
    return changed;
  })();
}

/** History of a game (matchId) or of a championship's finish times (championshipId), newest first. */
function listHistory(db, { matchId = null, championshipId = null }) {
  const where = matchId ? 'h.match_id = ?' : 'h.championship_id = ? AND h.registration_id IS NOT NULL';
  return db.prepare(`SELECT h.*, users.name AS changed_by_name FROM result_history h JOIN users ON users.id = h.changed_by
    WHERE ${where} ORDER BY h.changed_at DESC, h.id DESC`).all(matchId ?? championshipId);
}

module.exports = { recordResult, recordFinishTimes, listHistory, addHistory };
