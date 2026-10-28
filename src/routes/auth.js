const express = require('express');
const { MESSAGES } = require('../constants');
const { listCities } = require('../models/cities');
const {
  createUser, emailInUse, authenticate, findUserByEmail, setPassword,
} = require('../models/users');
const { createResetToken, findValidResetToken, consumeResetToken } = require('../models/passwordResets');
const { addOutbox } = require('../models/outbox');
const { validateUserInput, validateNewPassword, normalizeEmail } = require('../validation/users');
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

router.get('/password/forgot', (req, res) => {
  res.render('auth/forgot', { title: 'Recuperar senha' });
});

router.post('/password/forgot', (req, res) => {
  const { db } = req.app.locals;
  const user = findUserByEmail(db, normalizeEmail(req.body.email));
  if (user && user.status !== 'suspended') {
    const token = createResetToken(db, user.id);
    const link = `${req.protocol}://${req.get('host')}/password/reset/${token}`;
    addOutbox(db, {
      type: 'password_reset',
      recipient: user.email,
      subject: 'Redefinição de senha',
      body: `Olá, ${user.name}. Para redefinir sua senha, acesse o link abaixo (válido por 1 hora).`,
      link,
    });
  }
  // Same answer whether or not the e-mail exists, so the form cannot be used to discover accounts.
  setFlash(req, 'success', MESSAGES.forgotSent);
  res.redirect('/login');
});

function renderReset(res, { valid, errors = {} }) {
  if (!valid) res.locals.flash = { type: 'error', message: MESSAGES.resetInvalid };
  res.render('auth/reset', { title: 'Redefinir senha', valid, errors });
}

router.get('/password/reset/:token', (req, res) => {
  const valid = Boolean(findValidResetToken(req.app.locals.db, req.params.token));
  if (!valid) res.status(400);
  renderReset(res, { valid });
});

router.post('/password/reset/:token', (req, res) => {
  const { db } = req.app.locals;
  if (!findValidResetToken(db, req.params.token)) {
    res.status(400);
    return renderReset(res, { valid: false });
  }
  const errors = validateNewPassword(req.body.password, req.body.password_confirm);
  if (Object.keys(errors).length) {
    res.status(422);
    return renderReset(res, { valid: true, errors });
  }
  setPassword(db, consumeResetToken(db, req.params.token), req.body.password);
  setFlash(req, 'success', MESSAGES.resetDone);
  return res.redirect('/login');
});

router.post('/logout', (req, res, next) => {
  req.session.regenerate((err) => {
    if (err) return next(err);
    setFlash(req, 'success', MESSAGES.loggedOut);
    return res.redirect('/championships');
  });
});

module.exports = router;
