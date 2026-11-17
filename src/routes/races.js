const express = require('express');
const { MESSAGES } = require('../constants');
const { requireActiveOrganizer } = require('../middleware/auth');
const { setFlash, render403, render404 } = require('../middleware/session');
const { getChampionship, categoriesWithIds } = require('../models/championships');
const {
  listRaceStarts, getRaceStart, saveRaceStart, cancelRaceStart, listRunners,
} = require('../models/races');
const { recordFinishTimes, listHistory } = require('../models/results');
const { notify } = require('../models/notifications');
const { raceAudience } = require('../models/audience');
const { validateRaceStartInput, parseFinishTime, formatFinishTime } = require('../validation/games');
const { formatBrDate, todayIso } = require('../validation/dates');

const router = express.Router();

const racesPath = (championshipId) => `/my/championships/${championshipId}/races`;

/** :id is one of the organizer's street runs (team championships have games instead). */
function loadRun(req, res, next) {
  const { db } = req.app.locals;
  const championship = getChampionship(db, Number(req.params.id));
  if (!championship) return render404(res);
  if (championship.organizer_id !== req.user.id) return render403(res);
  if (championship.sport !== 'street_run') return res.redirect(`/my/championships/${championship.id}/games`);
  req.championship = championship;
  if (req.params.categoryId) {
    req.category = categoriesWithIds(db, championship.id).find((c) => c.id === Number(req.params.categoryId));
    if (!req.category) return render404(res);
    req.start = getRaceStart(db, req.category.id);
  }
  return next();
}

function requireActive(req, res, next) {
  if (req.championship.status === 'active') return next();
  setFlash(req, 'error', MESSAGES.tableClosed);
  return res.redirect(racesPath(req.championship.id));
}

const GUARDS = [requireActiveOrganizer, loadRun];

router.get('/my/championships/:id/races', ...GUARDS, (req, res) => {
  res.render('races/index', {
    title: `Largadas — ${req.championship.name}`,
    championship: req.championship,
    editable: req.championship.status === 'active',
    starts: listRaceStarts(req.app.locals.db, req.championship.id),
    today: todayIso(),
  });
});

function renderStart(req, res, { values, errors = {} }) {
  res.render('races/form', {
    title: req.start ? 'Alterar largada' : 'Cadastrar largada',
    championship: req.championship,
    category: req.category,
    values,
    errors,
    back: racesPath(req.championship.id),
  });
}

router.get('/my/championships/:id/races/:categoryId/start', ...GUARDS, requireActive, (req, res) => {
  const { start, championship } = req;
  renderStart(req, res, {
    values: start
      ? { start_date: formatBrDate(start.start_date), start_time: start.start_time, venue: start.venue }
      : { start_date: formatBrDate(championship.start_date), venue: championship.venue },
  });
});

router.post('/my/championships/:id/races/:categoryId/start', ...GUARDS, requireActive, (req, res) => {
  const { errors, data } = validateRaceStartInput(req.body, { championship: req.championship });
  if (Object.keys(errors).length) {
    res.status(422);
    return renderStart(req, res, { values: req.body, errors });
  }
  const { db } = req.app.locals;
  const before = req.start;
  saveRaceStart(db, req.championship.id, req.category.id, data);
  const after = getRaceStart(db, req.category.id);
  if (before?.status === 'scheduled' && (after.start_date !== before.start_date || after.start_time !== before.start_time
    || after.venue !== before.venue)) {
    notify(db, {
      userIds: raceAudience(db, req.championship.id, req.category.id),
      type: 'schedule_changed',
      outboxType: 'race_changed',
      exceptUserId: req.user.id,
      title: `Largada alterada: ${req.championship.name} (${req.category.name})`,
      body: `A largada da categoria ${req.category.name} agora é em ${formatBrDate(after.start_date)} às ${after.start_time}, ${after.venue}.`,
      link: `/championships/${req.championship.id}/table?category_id=${req.category.id}`,
    });
  }
  setFlash(req, 'success', MESSAGES.raceSaved);
  return res.redirect(racesPath(req.championship.id));
});

function requireScheduledStart(req, res, next) {
  if (req.start?.status === 'scheduled') return next();
  setFlash(req, 'error', MESSAGES.raceMissing);
  return res.redirect(racesPath(req.championship.id));
}

router.get('/my/championships/:id/races/:categoryId/cancel', ...GUARDS, requireActive, requireScheduledStart, (req, res) => {
  res.render('races/cancel', {
    title: 'Cancelar largada', championship: req.championship, category: req.category, start: req.start,
    back: racesPath(req.championship.id),
  });
});

router.post('/my/championships/:id/races/:categoryId/cancel', ...GUARDS, requireActive, requireScheduledStart, (req, res) => {
  const { db } = req.app.locals;
  cancelRaceStart(db, req.category.id);
  notify(db, {
    userIds: raceAudience(db, req.championship.id, req.category.id),
    type: 'cancellation',
    outboxType: 'race_cancelled',
    exceptUserId: req.user.id,
    title: `Largada cancelada: ${req.championship.name} (${req.category.name})`,
    body: `A largada da categoria ${req.category.name} de ${formatBrDate(req.start.start_date)} foi cancelada.`,
    link: `/championships/${req.championship.id}/table?category_id=${req.category.id}`,
  });
  setFlash(req, 'success', MESSAGES.raceCancelled);
  res.redirect(racesPath(req.championship.id));
});

/** Finish times only after the start date, and only for a scheduled start. */
function requireStarted(req, res, next) {
  if (req.start.start_date <= todayIso()) return next();
  setFlash(req, 'error', MESSAGES.raceTooEarly);
  return res.redirect(racesPath(req.championship.id));
}

function renderTimes(req, res, { values, errors = {} }) {
  const { db } = req.app.locals;
  res.render('races/results', {
    title: `Tempos — ${req.category.name}`,
    championship: req.championship,
    category: req.category,
    start: req.start,
    runners: listRunners(db, req.category.id),
    history: listHistory(db, { championshipId: req.championship.id }),
    values,
    errors,
    back: racesPath(req.championship.id),
  });
}

const TIME_GUARDS = [...GUARDS, requireActive, requireScheduledStart, requireStarted];

router.get('/my/championships/:id/races/:categoryId/results', ...TIME_GUARDS, (req, res) => {
  const values = {};
  for (const r of listRunners(req.app.locals.db, req.category.id)) values[`time_${r.id}`] = formatFinishTime(r.seconds);
  renderTimes(req, res, { values });
});

router.post('/my/championships/:id/races/:categoryId/results', ...TIME_GUARDS, (req, res) => {
  const { db } = req.app.locals;
  const runners = listRunners(db, req.category.id);
  const errors = {};
  const times = new Map();
  for (const runner of runners) {
    const raw = typeof req.body[`time_${runner.id}`] === 'string' ? req.body[`time_${runner.id}`].trim() : '';
    if (!raw) continue;
    const seconds = parseFinishTime(raw);
    if (seconds === null) errors[`time_${runner.id}`] = MESSAGES.finishTimeInvalid;
    else times.set(runner.id, seconds);
  }
  if (Object.keys(errors).length) {
    res.status(422);
    return renderTimes(req, res, { values: req.body, errors });
  }
  const changed = recordFinishTimes(db, req.championship.id, runners, times, req.user.id);
  setFlash(req, changed ? 'success' : 'error', changed ? MESSAGES.raceTimesSaved(changed) : MESSAGES.raceNoChanges);
  return res.redirect(racesPath(req.championship.id));
});

module.exports = router;
