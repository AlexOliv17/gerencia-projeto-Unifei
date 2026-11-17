const express = require('express');
const { MESSAGES, DEFAULT_MATCH_MINUTES } = require('../constants');
const { requireActiveOrganizer } = require('../middleware/auth');
const { setFlash, render403, render404 } = require('../middleware/session');
const { getChampionship, categoriesWithIds } = require('../models/championships');
const {
  getMatch, listMatches, approvedEntries, findConflict, insertMatch, updateMatch, cancelMatch, isFedByBracket,
} = require('../models/matches');
const {
  generateTable, generateKnockout, knockoutStatus, conflictMessage,
} = require('../models/tableGenerator');
const { recordResult, listHistory } = require('../models/results');
const { validateMatchInput, validateGenerateInput, validateResultInput } = require('../validation/games');
const { formatBrDate, todayIso } = require('../validation/dates');

const router = express.Router();

const tablePath = (championshipId, categoryId) => `/my/championships/${championshipId}/games${categoryId ? `?category_id=${categoryId}` : ''}`;

/** :id is one of the organizer's championships; street runs have starts instead of games. */
function loadChampionship(req, res, next) {
  const championship = getChampionship(req.app.locals.db, Number(req.params.id));
  if (!championship) return render404(res);
  if (championship.organizer_id !== req.user.id) return render403(res);
  if (championship.sport === 'street_run') return res.redirect(`/my/championships/${championship.id}/races`);
  req.championship = championship;
  req.categories = categoriesWithIds(req.app.locals.db, championship.id);
  return next();
}

/** :id is a game of one of the organizer's championships. */
function loadMatch(req, res, next) {
  const { db } = req.app.locals;
  const match = getMatch(db, Number(req.params.id));
  if (!match) return render404(res);
  const championship = getChampionship(db, match.championship_id);
  if (championship.organizer_id !== req.user.id) return render403(res);
  req.match = match;
  req.championship = championship;
  req.categories = categoriesWithIds(db, championship.id);
  return next();
}

/** Changes need an active championship; finished or cancelled ones keep their table for reference only. */
function requireActive(req, res, next) {
  if (req.championship.status === 'active') return next();
  setFlash(req, 'error', MESSAGES.tableClosed);
  return res.redirect(tablePath(req.championship.id));
}

function selectedCategory(req, raw) {
  const id = Number(raw);
  return req.categories.find((c) => c.id === id) ?? req.categories[0];
}

router.get('/my/championships/:id/games', requireActiveOrganizer, loadChampionship, (req, res) => {
  const { db } = req.app.locals;
  const { championship } = req;
  const category = selectedCategory(req, req.query.category_id);
  res.render('games/index', {
    title: `Tabela de jogos — ${championship.name}`,
    championship,
    categories: req.categories,
    category,
    editable: championship.status === 'active',
    matches: listMatches(db, championship.id, { categoryId: category.id }),
    knockout: knockoutStatus(db, championship, category.id),
    today: todayIso(),
  });
});

// ---- Manual games: create and reschedule (RFS09 rules 1 to 3) ----

/** Manual games sort by the number in "Fase/Rodada" ("Rodada 2" → 2); named phases ("Final") go after the rounds. */
const roundNumberOf = (round) => Number(/\d+/.exec(round)?.[0] ?? 99);

function renderMatchForm(req, res, { values, errors = {}, match = null }) {
  const { championship } = req;
  res.render('games/form', {
    title: match ? 'Alterar jogo' : 'Cadastrar jogo',
    championship,
    match,
    categories: req.categories,
    entries: approvedEntries(req.app.locals.db, championship.id),
    teamsLocked: Boolean(match && isFedByBracket(req.app.locals.db, match.id)),
    values,
    errors,
    back: tablePath(championship.id, values.category_id),
  });
}

/** Validation, then the database rules: teams locked after a result, and conflicts of team and venue. */
function checkMatch(req, match = null) {
  const { db } = req.app.locals;
  const { championship } = req;
  const entries = approvedEntries(db, championship.id);
  // A game that already has a result keeps its teams even if one of them was later removed from the approved list.
  if (match?.hasResult) {
    const list = entries.get(match.category_id) ?? [];
    for (const slot of ['a', 'b']) {
      const id = match[`registration_${slot}_id`];
      if (!list.some((e) => e.id === id)) list.push({ id, name: match[`name${slot.toUpperCase()}`], teamId: match[`team_${slot}_id`] });
    }
    entries.set(match.category_id, list);
  }
  const fixed = match && isFedByBracket(db, match.id)
    ? { categoryId: match.category_id, registrationAId: match.registration_a_id, registrationBId: match.registration_b_id }
    : null;
  const { errors, data } = validateMatchInput(req.body, {
    championship, categoryIds: req.categories.map((c) => c.id), entries, fixed,
  });
  if (match?.hasResult && (data.categoryId !== match.category_id || data.registrationAId !== match.registration_a_id
    || data.registrationBId !== match.registration_b_id)) {
    errors.registration_a_id = MESSAGES.matchTeamsLocked;
  }
  if (Object.keys(errors).length) return { errors, data };
  const list = entries.get(data.categoryId) ?? [];
  const entryA = list.find((e) => e.id === data.registrationAId);
  const entryB = list.find((e) => e.id === data.registrationBId);
  const conflict = findConflict(db, {
    championshipId: championship.id, date: data.date, startTime: data.startTime, duration: data.duration, venue: data.venue,
    teamIds: [entryA?.teamId, entryB?.teamId], ignoreId: match?.id ?? 0,
    names: new Map(list.filter((e) => e.teamId).map((e) => [e.teamId, e.name])),
  });
  if (conflict) errors[conflict.field === 'team' ? 'start_time' : 'venue'] = conflictMessage(conflict);
  return { errors, data };
}

router.get('/my/championships/:id/games/new', requireActiveOrganizer, loadChampionship, requireActive, (req, res) => {
  const category = selectedCategory(req, req.query.category_id);
  renderMatchForm(req, res, {
    values: { category_id: category?.id, venue: req.championship.venue, duration_minutes: DEFAULT_MATCH_MINUTES },
  });
});

router.post('/my/championships/:id/games/new', requireActiveOrganizer, loadChampionship, requireActive, (req, res) => {
  const { errors, data } = checkMatch(req);
  if (Object.keys(errors).length) {
    res.status(422);
    return renderMatchForm(req, res, { values: req.body, errors });
  }
  insertMatch(req.app.locals.db, req.championship.id, { ...data, roundNumber: roundNumberOf(data.round) });
  setFlash(req, 'success', MESSAGES.matchCreated);
  return res.redirect(tablePath(req.championship.id, data.categoryId));
});

function matchValues(m) {
  return {
    category_id: m.category_id, round: m.round, group_name: m.group_name ?? '', registration_a_id: m.registration_a_id ?? '',
    registration_b_id: m.registration_b_id ?? '', match_date: formatBrDate(m.match_date), start_time: m.start_time,
    duration_minutes: m.duration_minutes, venue: m.venue,
  };
}

function requireScheduled(req, res, next) {
  if (req.match.status === 'scheduled') return next();
  setFlash(req, 'error', MESSAGES.matchNotEditable);
  return res.redirect(tablePath(req.championship.id, req.match.category_id));
}

router.get('/games/:id/edit', requireActiveOrganizer, loadMatch, requireActive, requireScheduled, (req, res) => {
  renderMatchForm(req, res, { values: matchValues(req.match), match: req.match });
});

router.post('/games/:id/edit', requireActiveOrganizer, loadMatch, requireActive, requireScheduled, (req, res) => {
  const { errors, data } = checkMatch(req, req.match);
  if (Object.keys(errors).length) {
    res.status(422);
    return renderMatchForm(req, res, { values: req.body, errors, match: req.match });
  }
  updateMatch(req.app.locals.db, req.match.id, data);
  setFlash(req, 'success', MESSAGES.matchSaved);
  return res.redirect(tablePath(req.championship.id, data.categoryId));
});

// ---- Cancel ----

function requireNoResult(req, res, next) {
  if (!req.match.hasResult) return next();
  setFlash(req, 'error', MESSAGES.matchHasResult);
  return res.redirect(tablePath(req.championship.id, req.match.category_id));
}

router.get('/games/:id/cancel', requireActiveOrganizer, loadMatch, requireActive, requireScheduled, requireNoResult, (req, res) => {
  res.render('games/cancel', {
    title: 'Cancelar jogo', match: req.match, back: tablePath(req.championship.id, req.match.category_id),
  });
});

router.post('/games/:id/cancel', requireActiveOrganizer, loadMatch, requireActive, requireScheduled, requireNoResult, (req, res) => {
  cancelMatch(req.app.locals.db, req.match.id);
  setFlash(req, 'success', MESSAGES.matchCancelled);
  res.redirect(tablePath(req.championship.id, req.match.category_id));
});

// ---- Automatic table and knockout stage ----

function renderGenerate(req, res, { values, errors = {}, knockout = false }) {
  res.render('games/generate', {
    title: knockout ? 'Gerar mata-mata' : 'Gerar tabela',
    championship: req.championship,
    categories: req.categories,
    knockout,
    values,
    errors,
    back: tablePath(req.championship.id, values.category_id),
  });
}

function generateDefaults(req) {
  const category = selectedCategory(req, req.query.category_id);
  return {
    category_id: category?.id, first_date: formatBrDate(req.championship.start_date), first_time: '19:00',
    duration_minutes: DEFAULT_MATCH_MINUTES, interval_days: 7, venue: req.championship.venue,
  };
}

function handleGenerate(knockout) {
  return (req, res) => {
    const { db } = req.app.locals;
    const { errors, data } = validateGenerateInput(req.body, {
      championship: req.championship, categoryIds: req.categories.map((c) => c.id),
    });
    let result = {};
    if (!Object.keys(errors).length) {
      result = (knockout ? generateKnockout : generateTable)(db, req.championship, data);
    }
    if (Object.keys(errors).length || result.error) {
      res.status(422);
      if (result.error) res.locals.flash = { type: 'error', message: result.error };
      return renderGenerate(req, res, { values: req.body, errors, knockout });
    }
    setFlash(req, 'success', MESSAGES.generateDone(result.created));
    return res.redirect(tablePath(req.championship.id, data.categoryId));
  };
}

router.get('/my/championships/:id/games/generate', requireActiveOrganizer, loadChampionship, requireActive, (req, res) => {
  renderGenerate(req, res, { values: generateDefaults(req) });
});
router.post('/my/championships/:id/games/generate', requireActiveOrganizer, loadChampionship, requireActive, handleGenerate(false));

router.get('/my/championships/:id/games/knockout', requireActiveOrganizer, loadChampionship, requireActive, (req, res) => {
  renderGenerate(req, res, { values: generateDefaults(req), knockout: true });
});
router.post('/my/championships/:id/games/knockout', requireActiveOrganizer, loadChampionship, requireActive, handleGenerate(true));

// ---- Results (RFS10) and history ----

function requireResultable(req, res, next) {
  const { match } = req;
  let error = null;
  if (!match.registration_a_id || !match.registration_b_id) error = MESSAGES.resultTeamsMissing;
  else if (match.match_date > todayIso()) error = MESSAGES.resultTooEarly;
  if (!error) return next();
  setFlash(req, 'error', error);
  return res.redirect(tablePath(req.championship.id, match.category_id));
}

function renderResult(req, res, { values, errors = {} }) {
  res.render('games/result', {
    title: 'Resultado do jogo',
    championship: req.championship,
    match: req.match,
    values,
    errors,
    back: tablePath(req.championship.id, req.match.category_id),
  });
}

const RESULT_GUARDS = [requireActiveOrganizer, loadMatch, requireActive, requireScheduled, requireResultable];

router.get('/games/:id/result', ...RESULT_GUARDS, (req, res) => {
  const m = req.match;
  renderResult(req, res, {
    values: { score_a: m.score_a ?? '', score_b: m.score_b ?? '', points_a: m.points_a ?? '', points_b: m.points_b ?? '' },
  });
});

router.post('/games/:id/result', ...RESULT_GUARDS, (req, res) => {
  const { errors, data } = validateResultInput(req.body, { sport: req.championship.sport, kind: req.match.kind });
  if (Object.keys(errors).length) {
    res.status(422);
    return renderResult(req, res, { values: req.body, errors });
  }
  const { error } = recordResult(req.app.locals.db, req.match.id, data, req.user.id);
  if (error) {
    res.status(422);
    res.locals.flash = { type: 'error', message: error };
    return renderResult(req, res, { values: req.body });
  }
  setFlash(req, 'success', MESSAGES.resultSaved);
  return res.redirect(tablePath(req.championship.id, req.match.category_id));
});

router.get('/games/:id/history', requireActiveOrganizer, loadMatch, (req, res) => {
  res.render('games/history', {
    title: 'Histórico do resultado',
    match: req.match,
    history: listHistory(req.app.locals.db, { matchId: req.match.id }),
    back: tablePath(req.championship.id, req.match.category_id),
  });
});

module.exports = router;
