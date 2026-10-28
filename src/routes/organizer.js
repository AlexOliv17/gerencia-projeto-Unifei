const express = require('express');
const { MESSAGES } = require('../constants');
const { requireActiveOrganizer, requireRole } = require('../middleware/auth');
const { setFlash } = require('../middleware/session');
const { listCities } = require('../models/cities');
const { createChampionship } = require('../models/championships');
const { validateChampionshipInput } = require('../validation/championships');

const router = express.Router();

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

router.get('/my/championships', requireRole('organizer'), (req, res) => {
  res.render('championships/mine', { title: 'Meus campeonatos' });
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

module.exports = router;
