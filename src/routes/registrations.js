const express = require('express');
const { MESSAGES, OPEN_REGISTRATION_STATUSES, REGISTRATION_STATUS } = require('../constants');
const { requireRole } = require('../middleware/auth');
const { setFlash, render403, render404 } = require('../middleware/session');
const { addOutbox } = require('../models/outbox');
const { getChampionship, categoriesWithIds } = require('../models/championships');
const { getTeam, listTeamsForSport } = require('../models/teams');
const {
  createRegistration, getRegistration, listRegistrationsByUser, approvedCount, hasOpenRegistration, cancelRegistration,
  listRegistrationsByChampionship, approveRegistration, refuseRegistration,
} = require('../models/registrations');
const { checkRequest, checkDecision } = require('../validation/registrations');

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

// ---- RFS16: the organizer reviews the requests of their own championships ----

const ORGANIZER = requireRole('organizer');

/** Same rule as managing championships (Mantis #3): only validated organizers act as organizers. */
function requireValidated(req, res, next) {
  if (req.user.status !== 'active') return res.render('championships/pending', { title: 'Cadastro em validação' });
  return next();
}

function loadOwnChampionship(req, res, next) {
  const championship = getChampionship(req.app.locals.db, Number(req.params.id));
  if (!championship) return render404(res);
  if (championship.organizer_id !== req.user.id) return render403(res);
  req.championship = championship;
  return next();
}

const reviewPath = (championshipId) => `/my/championships/${championshipId}/registrations`;

router.get('/my/championships/:id/registrations', ORGANIZER, requireValidated, loadOwnChampionship, (req, res) => {
  const { db } = req.app.locals;
  const { championship } = req;
  const categories = categoriesWithIds(db, championship.id);
  const filters = {
    category_id: typeof req.query.category_id === 'string' ? req.query.category_id : '',
    status: typeof req.query.status === 'string' ? req.query.status : '',
  };
  const criteria = {
    categoryId: categories.some((c) => String(c.id) === filters.category_id) ? Number(filters.category_id) : null,
    status: filters.status in REGISTRATION_STATUS ? filters.status : null,
  };
  res.render('registrations/review', {
    title: `Inscrições — ${championship.name}`,
    championship,
    categories: categories.map((c) => ({ ...c, approved: approvedCount(db, c.id) })),
    filters,
    registrations: listRegistrationsByChampionship(db, championship.id, criteria),
    canDecide: (r) => championship.status === 'active' && ['pending', 'waitlist'].includes(r.status),
  });
});

/** :id is a registration of one of the organizer's championships; the decision rules are checked here too. */
function loadDecision(action) {
  return (req, res, next) => {
    const { db } = req.app.locals;
    const registration = getRegistration(db, Number(req.params.id));
    if (!registration) return render404(res);
    if (registration.organizer_id !== req.user.id) return render403(res);
    const championship = getChampionship(db, registration.championship_id);
    const error = checkDecision({
      championship, registration, approvedInCategory: approvedCount(db, registration.category_id), action,
    });
    if (error) {
      setFlash(req, 'error', error);
      return res.redirect(reviewPath(championship.id));
    }
    req.registration = registration;
    req.championship = championship;
    return next();
  };
}

/** RFS18 "Resultado da inscrição": simulated e-mail to whoever made the request. */
function notifyResult(db, registration, championship, approved, reason = null) {
  const verdict = approved ? 'aprovada' : 'recusada';
  addOutbox(db, {
    type: 'registration_result',
    recipient: registration.user_email,
    subject: `Inscrição ${verdict} — ${championship.name}`,
    body: `A inscrição de ${registration.entryName} na categoria ${registration.category_name} do campeonato `
      + `${championship.name} foi ${verdict}.${reason ? ` Motivo: ${reason}` : ''}`,
    link: `/championships/${championship.id}`,
  });
}

router.post('/registrations/:id/approve', ORGANIZER, requireValidated, loadDecision('approve'), (req, res) => {
  const { db } = req.app.locals;
  approveRegistration(db, req.registration.id);
  notifyResult(db, req.registration, req.championship, true);
  setFlash(req, 'success', MESSAGES.registrationApproved);
  res.redirect(reviewPath(req.championship.id));
});

function renderRefuse(req, res, errors = {}) {
  res.render('registrations/refuse', {
    title: 'Recusar inscrição', registration: req.registration, back: reviewPath(req.championship.id), errors,
  });
}

router.get('/registrations/:id/refuse', ORGANIZER, requireValidated, loadDecision('refuse'), (req, res) => renderRefuse(req, res));

router.post('/registrations/:id/refuse', ORGANIZER, requireValidated, loadDecision('refuse'), (req, res) => {
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) {
    res.status(422);
    return renderRefuse(req, res, { reason: MESSAGES.refuseReasonRequired });
  }
  const { db } = req.app.locals;
  refuseRegistration(db, req.registration.id, reason);
  notifyResult(db, req.registration, req.championship, false, reason);
  setFlash(req, 'success', MESSAGES.registrationRefused);
  return res.redirect(reviewPath(req.championship.id));
});

module.exports = router;
