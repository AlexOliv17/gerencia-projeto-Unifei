const express = require('express');
const { MESSAGES, OPEN_REGISTRATION_STATUSES } = require('../constants');
const { requireRole } = require('../middleware/auth');
const { setFlash, render403, render404 } = require('../middleware/session');
const { getChampionship, categoriesWithIds } = require('../models/championships');
const { getTeam, listTeamsForSport } = require('../models/teams');
const {
  createRegistration, getRegistration, listRegistrationsByUser, approvedCount, hasOpenRegistration, cancelRegistration,
} = require('../models/registrations');
const { checkRequest } = require('../validation/registrations');

const router = express.Router();

const PARTICIPANTS = requireRole('user', 'organizer');

/** The request form is only reachable while registrations are open and by someone other than the organizer. */
function blockedReason(championship, user) {
  if (championship.displayStatus !== 'open') return MESSAGES.registrationClosed;
  if (championship.organizer_id === user.id) return MESSAGES.registrationOwnChampionship;
  return null;
}

function loadChampionship(req, res, next) {
  const championship = getChampionship(req.app.locals.db, Number(req.params.id));
  if (!championship) return render404(res);
  const reason = blockedReason(championship, req.user);
  if (reason) {
    setFlash(req, 'error', reason);
    return res.redirect(`/championships/${championship.id}`);
  }
  req.championship = championship;
  return next();
}

function renderForm(req, res, values = {}) {
  const { db } = req.app.locals;
  const { championship } = req;
  const individual = championship.sport === 'street_run';
  res.render('registrations/new', {
    title: `Inscrição — ${championship.name}`,
    championship,
    individual,
    categories: categoriesWithIds(db, championship.id),
    teams: individual ? [] : listTeamsForSport(db, req.user.id, championship.sport),
    values,
  });
}

router.get('/championships/:id/register', PARTICIPANTS, loadChampionship, (req, res) => renderForm(req, res));

router.post('/championships/:id/register', PARTICIPANTS, loadChampionship, (req, res) => {
  const { db } = req.app.locals;
  const { championship } = req;
  const individual = championship.sport === 'street_run';
  const categoryId = Number(req.body.category_id);
  let team = null;
  if (!individual && req.body.team_id) {
    team = getTeam(db, Number(req.body.team_id)) ?? null;
    if (team && team.owner_id !== req.user.id) return render403(res);
  }
  const categoryIds = categoriesWithIds(db, championship.id).map((c) => c.id);
  const { error, status } = checkRequest({
    championship,
    categoryIds,
    categoryId,
    user: req.user,
    team,
    approvedInCategory: categoryIds.includes(categoryId) ? approvedCount(db, categoryId) : 0,
    hasOpen: hasOpenRegistration(db, { categoryId, teamId: team?.id, userId: req.user.id }),
  });
  if (error) {
    res.status(422);
    res.locals.flash = { type: 'error', message: error };
    return renderForm(req, res, req.body);
  }
  createRegistration(db, {
    championshipId: championship.id, categoryId, teamId: team?.id ?? null, userId: req.user.id, status,
  });
  setFlash(req, 'success', status === 'waitlist' ? MESSAGES.registrationWaitlisted : MESSAGES.registrationSent);
  return res.redirect('/my/registrations');
});

/** The person can withdraw while the deadline is open and the request still holds or waits for a place. */
const canCancel = (r) => r.championshipDisplayStatus === 'open' && OPEN_REGISTRATION_STATUSES.includes(r.status);

router.get('/my/registrations', PARTICIPANTS, (req, res) => {
  res.render('registrations/mine', {
    title: 'Minhas inscrições',
    registrations: listRegistrationsByUser(req.app.locals.db, req.user.id),
    canCancel,
  });
});

function loadOwnRegistration(req, res, next) {
  const registration = getRegistration(req.app.locals.db, Number(req.params.id));
  if (!registration) return render404(res);
  if (registration.user_id !== req.user.id) return render403(res);
  if (!canCancel(registration)) {
    const reason = OPEN_REGISTRATION_STATUSES.includes(registration.status)
      ? MESSAGES.registrationCancelClosed : MESSAGES.registrationNotCancellable;
    setFlash(req, 'error', reason);
    return res.redirect('/my/registrations');
  }
  req.registration = registration;
  return next();
}

router.get('/my/registrations/:id/cancel', PARTICIPANTS, loadOwnRegistration, (req, res) => {
  res.render('registrations/cancel', { title: 'Cancelar inscrição', registration: req.registration });
});

router.post('/my/registrations/:id/cancel', PARTICIPANTS, loadOwnRegistration, (req, res) => {
  cancelRegistration(req.app.locals.db, req.registration.id);
  setFlash(req, 'success', MESSAGES.registrationCancelled);
  res.redirect('/my/registrations');
});

module.exports = router;
