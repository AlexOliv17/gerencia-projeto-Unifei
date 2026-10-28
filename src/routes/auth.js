const express = require('express');
const { MESSAGES } = require('../constants');
const { listCities } = require('../models/cities');
const { createUser, emailInUse, authenticate } = require('../models/users');
const { validateUserInput, normalizeEmail } = require('../validation/users');
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

const LOGIN_ERRORS = {
  invalid: MESSAGES.loginInvalid,
  locked: MESSAGES.loginLocked,
  suspended: MESSAGES.loginSuspended,
};

router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Entrar', values: {} });
});

router.post('/login', (req, res, next) => {
  const result = authenticate(req.app.locals.db, normalizeEmail(req.body.email), req.body.password);
  if (result.error) {
    res.locals.flash = { type: 'error', message: LOGIN_ERRORS[result.error] };
    return res.status(401).render('auth/login', { title: 'Entrar', values: { email: req.body.email } });
  }
  // New session id on login prevents session fixation.
  return req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = result.user.id;
    return res.redirect('/championships');
  });
});

router.post('/logout', (req, res, next) => {
  req.session.regenerate((err) => {
    if (err) return next(err);
    setFlash(req, 'success', MESSAGES.loggedOut);
    return res.redirect('/championships');
  });
});

module.exports = router;
