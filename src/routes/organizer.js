const express = require('express');
const { MESSAGES } = require('../constants');
const { requireActiveOrganizer, requireRole } = require('../middleware/auth');
const { setFlash, render403, render404 } = require('../middleware/session');
const { listCities } = require('../models/cities');
const { notify } = require('../models/notifications');
const { championshipAudience } = require('../models/audience');
const {
  createChampionship, getChampionship, searchChampionships, updateChampionship, finishChampionship,
  cancelChampionship, canManage, categoriesInUse,
} = require('../models/championships');
const { championshipHasGames } = require('../models/matches');
const { validateChampionshipInput, parseSearchFilters } = require('../validation/championships');
const { formatBrDate } = require('../validation/dates');

const router = express.Router();

const LIST_FILTERS = ['name', 'sport', 'status', 'date_from', 'date_to'];

function renderForm(req, res, { mode, championship = null, values, errors = {} }) {
  res.render('championships/form', {
    title: mode === 'new' ? 'Novo campeonato' : 'Alterar campeonato',
    mode,
    championship,
    cities: listCities(req.app.locals.db),
    values,
    errors,
  });
}

function formValues(c) {
  return {
    name: c.name,
    sport: c.sport,
    categories: c.categories.join(', '),
    city_id: c.city_id,
    venue: c.venue,
    start_date: formatBrDate(c.start_date),
    end_date: formatBrDate(c.end_date),
    registration_deadline: formatBrDate(c.registration_deadline),
    format: c.format,
    max_slots: c.max_slots ?? '',
    rules: c.rules ?? '',
    contact: c.contact ?? '',
    allow_waitlist: c.allow_waitlist ? 'on' : '',
    points_win: c.points_win,
    points_draw: c.points_draw,
    points_loss: c.points_loss,
  };
}

/**
 * Organizers must be validated (active) to manage championships; :id must exist (404),
 * be manageable by the user (403) and still be active (403).
 */
function loadManageable(req, res, next) {
  if (req.user.role === 'organizer' && req.user.status !== 'active') {
    return res.render('championships/pending', { title: 'Cadastro em validação' });
  }
  const championship = getChampionship(req.app.locals.db, Number(req.params.id));
  if (!championship) return render404(res);
  if (!canManage(req.user, championship) || championship.status !== 'active') return render403(res);
  req.championship = championship;
  return next();
}

/** Editing is the owner's job only; the admin can finish or cancel but not rewrite a championship. */
function requireOwner(req, res, next) {
  if (req.championship.organizer_id !== req.user.id) return render403(res);
  return next();
}

const backToList = (user) => (user.role === 'admin' ? '/admin/championships' : '/my/championships');

router.get('/my/championships', requireRole('organizer'), (req, res) => {
  const { values, criteria, errors } = parseSearchFilters(req.query, LIST_FILTERS);
  const championships = searchChampionships(req.app.locals.db, { ...criteria, organizerId: req.user.id });
  res.render('championships/mine', { title: 'Meus campeonatos', filters: values, errors, championships });
});

router.get('/my/championships/new', requireActiveOrganizer, (req, res) => {
  renderForm(req, res, { mode: 'new', values: {} });
});

router.post('/my/championships/new', requireActiveOrganizer, (req, res) => {
  const { db } = req.app.locals;
  const { errors, data } = validateChampionshipInput(req.body, { cityIds: listCities(db).map((c) => c.id) });
  if (Object.keys(errors).length) {
    res.status(422);
    return renderForm(req, res, { mode: 'new', values: req.body, errors });
  }
  createChampionship(db, req.user.id, data);
  setFlash(req, 'success', MESSAGES.champCreated);
  return res.redirect('/my/championships');
});

router.get('/my/championships/:id/edit', requireRole('organizer'), loadManageable, requireOwner, (req, res) => {
  renderForm(req, res, { mode: 'edit', championship: req.championship, values: formValues(req.championship) });
});

router.post('/my/championships/:id/edit', requireRole('organizer'), loadManageable, requireOwner, (req, res) => {
  const { db } = req.app.locals;
  const cities = listCities(db);
  const { errors, data } = validateChampionshipInput(req.body, { cityIds: cities.map((c) => c.id) });
  // Registered teams were checked against the current sport (RFS15 rule 2), so it is frozen once there are any.
  const inUse = categoriesInUse(db, req.championship.id);
  if (!errors.sport && inUse.length && data.sport !== req.championship.sport) errors.sport = MESSAGES.championshipSportLocked;
  // Games were generated for the current format (league tables, groups or bracket), so it is frozen once there are any.
  if (!errors.format && data.format !== req.championship.format && championshipHasGames(db, req.championship.id)) {
    errors.format = MESSAGES.championshipFormatLocked;
  }
  if (!errors.categories) {
    const kept = new Set(data.categories.map((name) => name.toLowerCase()));
    const removed = inUse.find((name) => !kept.has(name.toLowerCase()));
    if (removed) errors.categories = MESSAGES.categoryInUse(removed);
  }
  if (Object.keys(errors).length) {
    res.status(422);
    return renderForm(req, res, { mode: 'edit', championship: req.championship, values: req.body, errors });
  }
  const { changedSchedule } = updateChampionship(db, req.championship.id, data);
  if (changedSchedule) {
    const city = cities.find((c) => c.id === data.cityId).name;
    notify(db, {
      userIds: championshipAudience(db, req.championship.id),
      type: 'schedule_changed',
      outboxType: 'championship_changed',
      exceptUserId: req.user.id,
      link: `/championships/${req.championship.id}`,
      title: `Alteração no campeonato ${data.name}`,
      body: `O campeonato ${data.name} foi alterado: de ${formatBrDate(data.startDate)} a ${formatBrDate(data.endDate)}, `
        + `inscrições até ${formatBrDate(data.registrationDeadline)}, local ${data.venue} (${city}).`,
    });
  }
  setFlash(req, 'success', MESSAGES.champSaved);
  return res.redirect('/my/championships');
});

router.get('/championships/:id/finish', requireRole('organizer', 'admin'), loadManageable, (req, res) => {
  res.render('championships/finish', { title: 'Encerrar campeonato', championship: req.championship, back: backToList(req.user) });
});

router.post('/championships/:id/finish', requireRole('organizer', 'admin'), loadManageable, (req, res) => {
  finishChampionship(req.app.locals.db, req.championship.id);
  setFlash(req, 'success', MESSAGES.champFinished);
  res.redirect(backToList(req.user));
});

function renderCancel(req, res, errors = {}) {
  res.render('championships/cancel', {
    title: 'Cancelar campeonato', championship: req.championship, back: backToList(req.user), errors,
  });
}

router.get('/championships/:id/cancel', requireRole('organizer', 'admin'), loadManageable, (req, res) => renderCancel(req, res));

router.post('/championships/:id/cancel', requireRole('organizer', 'admin'), loadManageable, (req, res) => {
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) {
    res.status(422);
    return renderCancel(req, res, { reason: MESSAGES.cancelReasonRequired });
  }
  const { db } = req.app.locals;
  cancelChampionship(db, req.championship.id, reason);
  notify(db, {
    userIds: championshipAudience(db, req.championship.id),
    type: 'cancellation',
    outboxType: 'championship_cancelled',
    exceptUserId: req.user.id,
    link: `/championships/${req.championship.id}`,
    title: `Campeonato ${req.championship.name} cancelado`,
    body: `O campeonato ${req.championship.name} foi cancelado. Motivo: ${reason}`,
  });
  setFlash(req, 'success', MESSAGES.champCancelled);
  return res.redirect(backToList(req.user));
});

module.exports = router;
