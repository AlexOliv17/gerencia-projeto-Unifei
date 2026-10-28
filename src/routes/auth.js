const express = require('express');
const { MESSAGES } = require('../constants');
const { listCities } = require('../models/cities');
const { createUser, emailInUse } = require('../models/users');
const { validateUserInput } = require('../validation/users');
const { setFlash } = require('../middleware/session');

const router = express.Router();

function renderRegister(res, { values = {}, errors = {} } = {}) {
  const { password, password_confirm: confirm, ...safeValues } = values;
  res.render('auth/register', {
    title: 'Cadastro',
    cities: listCities(res.app.locals.db),
    values: safeValues,
    errors,
  });
}

router.get('/register', (req, res) => renderRegister(res));

router.post('/register', (req, res) => {
  const { db } = req.app.locals;
  const cityIds = listCities(db).map((c) => c.id);
  const { errors, data } = validateUserInput(req.body, { mode: 'register', cityIds });
  if (!errors.email && emailInUse(db, data.email)) errors.email = MESSAGES.emailTaken;
  if (Object.keys(errors).length) {
    res.status(422);
    return renderRegister(res, { values: req.body, errors });
  }
  createUser(db, data);
  setFlash(req, 'success', data.role === 'organizer' ? MESSAGES.registeredOrganizer : MESSAGES.registeredUser);
  return res.redirect('/login');
});

router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Entrar', values: {} });
});

module.exports = router;
