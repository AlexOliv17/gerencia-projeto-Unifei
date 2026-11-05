const express = require('express');
const { MESSAGES } = require('../constants');
const { requireLogin, requireRole } = require('../middleware/auth');
const { setFlash, render403, render404 } = require('../middleware/session');
const { listCities } = require('../models/cities');
const {
  createTeam, getTeam, listTeamsByOwner, teamNameInUse, updateTeam, hasOpenRegistrations,
  hasApprovedInActiveChampionship, deleteTeam, canViewTeam, registrationsOfTeam,
} = require('../models/teams');
const { validateTeamInput } = require('../validation/teams');

const router = express.Router();

router.use('/my/teams', requireRole('user', 'organizer'));

function renderForm(req, res, { mode, team = null, values, errors = {} }) {
  res.render('teams/form', {
    title: mode === 'new' ? 'Nova equipe' : 'Alterar equipe',
    mode,
    team,
    cities: listCities(req.app.locals.db),
    values,
    errors,
  });
}

function formValues(team) {
  return {
    name: team.name,
    sport: team.sport,
    city_id: team.city_id,
    athletes: team.athletes.map((a) => `${a.name}; ${a.number}`).join('\n'),
  };
}

/** :id must be an existing team (404) owned by the logged user (403). */
function loadOwnTeam(req, res, next) {
  const team = getTeam(req.app.locals.db, Number(req.params.id));
  if (!team) return render404(res);
  if (team.owner_id !== req.user.id) return render403(res);
  req.team = team;
  return next();
}

/** Shared by create and edit: field rules plus the checks that need the database. */
function validate(req, team = null) {
  const { db } = req.app.locals;
  const { errors, data } = validateTeamInput(req.body, { cityIds: listCities(db).map((c) => c.id) });
  if (!errors.name && teamNameInUse(db, req.user.id, data.name, team?.id ?? null)) {
    errors.name = MESSAGES.teamNameTaken;
  }
  if (team && !errors.sport && data.sport !== team.sport && hasOpenRegistrations(db, team.id)) {
    errors.sport = MESSAGES.teamSportLocked;
  }
  return { errors, data };
}

router.get('/my/teams', (req, res) => {
  res.render('teams/index', { title: 'Minhas equipes', teams: listTeamsByOwner(req.app.locals.db, req.user.id) });
});

router.get('/my/teams/new', (req, res) => renderForm(req, res, { mode: 'new', values: {} }));

router.post('/my/teams/new', (req, res) => {
  const { errors, data } = validate(req);
  if (Object.keys(errors).length) {
    res.status(422);
    return renderForm(req, res, { mode: 'new', values: req.body, errors });
  }
  createTeam(req.app.locals.db, req.user.id, data);
  setFlash(req, 'success', MESSAGES.teamCreated);
  return res.redirect('/my/teams');
});

router.get('/my/teams/:id/edit', loadOwnTeam, (req, res) => {
  renderForm(req, res, { mode: 'edit', team: req.team, values: formValues(req.team) });
});

router.post('/my/teams/:id/edit', loadOwnTeam, (req, res) => {
  const { errors, data } = validate(req, req.team);
  if (Object.keys(errors).length) {
    res.status(422);
    return renderForm(req, res, { mode: 'edit', team: req.team, values: req.body, errors });
  }
  updateTeam(req.app.locals.db, req.team.id, data);
  setFlash(req, 'success', MESSAGES.teamSaved);
  return res.redirect('/my/teams');
});

router.get('/my/teams/:id/delete', loadOwnTeam, (req, res) => {
  res.render('teams/delete', { title: 'Excluir equipe', team: req.team });
});

router.post('/my/teams/:id/delete', loadOwnTeam, (req, res) => {
  const { db } = req.app.locals;
  if (hasApprovedInActiveChampionship(db, req.team.id)) {
    setFlash(req, 'error', MESSAGES.teamDeleteBlocked);
    return res.redirect('/my/teams');
  }
  deleteTeam(db, req.team.id);
  setFlash(req, 'success', MESSAGES.teamDeleted);
  return res.redirect('/my/teams');
});

router.get('/teams/:id', requireLogin, (req, res) => {
  const { db } = req.app.locals;
  const team = getTeam(db, Number(req.params.id));
  if (!team) return render404(res);
  if (!canViewTeam(db, req.user, team)) return render403(res);
  return res.render('teams/show', {
    title: team.name,
    team,
    registrations: registrationsOfTeam(db, team.id),
    isOwner: team.owner_id === req.user.id,
  });
});

module.exports = router;
