const express = require('express');
const { MESSAGES } = require('../constants');
const { requireRole } = require('../middleware/auth');
const { setFlash, render404 } = require('../middleware/session');
const { getChampionship } = require('../models/championships');
const { getTeam } = require('../models/teams');
const {
  follow, unfollow, followedChampionshipIds, followedTeams,
} = require('../models/follows');
const { listMatches, teamMatches } = require('../models/matches');
const { listRaceStarts } = require('../models/races');
const { todayIso } = require('../validation/dates');

const router = express.Router();

const FOLLOWERS = requireRole('user', 'organizer');

/** Back to the page the button was on; only local paths are accepted. */
function backTo(req, fallback) {
  const back = typeof req.body.back === 'string' ? req.body.back : '';
  return back.startsWith('/') && !back.startsWith('//') ? back : fallback;
}

router.post('/championships/:id/follow', FOLLOWERS, (req, res) => {
  const championship = getChampionship(req.app.locals.db, Number(req.params.id));
  if (!championship) return render404(res);
  if (championship.status === 'cancelled') {
    setFlash(req, 'error', MESSAGES.followCancelled);
  } else {
    follow(req.app.locals.db, req.user.id, { championshipId: championship.id });
    setFlash(req, 'success', MESSAGES.followedChampionship);
  }
  return res.redirect(backTo(req, `/championships/${championship.id}`));
});

router.post('/championships/:id/unfollow', FOLLOWERS, (req, res) => {
  const championship = getChampionship(req.app.locals.db, Number(req.params.id));
  if (!championship) return render404(res);
  unfollow(req.app.locals.db, req.user.id, { championshipId: championship.id });
  setFlash(req, 'success', MESSAGES.unfollowed);
  return res.redirect(backTo(req, `/championships/${championship.id}`));
});

router.post('/teams/:id/follow', FOLLOWERS, (req, res) => {
  const team = getTeam(req.app.locals.db, Number(req.params.id));
  if (!team) return render404(res);
  follow(req.app.locals.db, req.user.id, { teamId: team.id });
  setFlash(req, 'success', MESSAGES.followedTeam(team.name));
  return res.redirect(backTo(req, '/my/following'));
});

router.post('/teams/:id/unfollow', FOLLOWERS, (req, res) => {
  const team = getTeam(req.app.locals.db, Number(req.params.id));
  if (!team) return render404(res);
  unfollow(req.app.locals.db, req.user.id, { teamId: team.id });
  setFlash(req, 'success', MESSAGES.unfollowed);
  return res.redirect(backTo(req, '/my/following'));
});

/** RFS17 personal area: followed championships with what comes next, followed teams with games and results. */
router.get('/my/following', FOLLOWERS, (req, res) => {
  const { db } = req.app.locals;
  const today = todayIso();
  const championships = followedChampionshipIds(db, req.user.id).map((id) => {
    const championship = getChampionship(db, id);
    const next = championship.sport === 'street_run'
      ? listRaceStarts(db, id).filter((s) => s.status === 'scheduled' && s.start_date >= today)
        .map((s) => ({ date: s.start_date, time: s.start_time, label: `Largada ${s.category_name}`, venue: s.venue }))
      : listMatches(db, id).filter((m) => m.status === 'scheduled' && !m.hasResult && m.match_date >= today)
        .sort((a, b) => (a.match_date + a.start_time).localeCompare(b.match_date + b.start_time))
        .map((m) => ({ date: m.match_date, time: m.start_time, label: `${m.nameA} x ${m.nameB}`, venue: m.venue }));
    return { ...championship, next: next.slice(0, 3) };
  });
  const teams = followedTeams(db, req.user.id).map((team) => {
    const games = teamMatches(db, team.id);
    return {
      ...team,
      upcoming: games.filter((m) => !m.hasResult && m.match_date >= today).slice(0, 3),
      results: games.filter((m) => m.hasResult).reverse().slice(0, 3),
    };
  });
  res.render('follows/index', { title: 'Acompanhando', championships, teams });
});

module.exports = router;
