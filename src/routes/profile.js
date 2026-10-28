const express = require('express');
const { MESSAGES } = require('../constants');
const { requireLogin } = require('../middleware/auth');
const { setFlash } = require('../middleware/session');
const { listCities } = require('../models/cities');
const {
  emailInUse, updateUser, verifyPassword, setPassword, anonymizeUser,
} = require('../models/users');
const { validateUserInput, validateNewPassword } = require('../validation/users');

const router = express.Router();

router.use('/profile', requireLogin);

function renderProfile(req, res, { values, errors = {} } = {}) {
  const user = req.user;
  res.render('profile/show', {
    title: 'Meu perfil',
    cities: listCities(req.app.locals.db),
    values: values || {
      name: user.name,
      email: user.email,
      city_id: user.city_id,
      document: user.document,
      league_name: user.league_name,
    },
    errors,
  });
}

router.get('/profile', (req, res) => renderProfile(req, res));

router.post('/profile', (req, res) => {
  const { db } = req.app.locals;
  const cityIds = listCities(db).map((c) => c.id);
  const { errors, data } = validateUserInput(req.body, { mode: 'profile', role: req.user.role, cityIds });
  if (!errors.email && emailInUse(db, data.email, req.user.id)) errors.email = MESSAGES.emailTaken;

  const changingPassword = Boolean(req.body.new_password || req.body.new_password_confirm);
  if (changingPassword) {
    if (!verifyPassword(req.user, req.body.current_password)) errors.current_password = MESSAGES.currentPasswordWrong;
    Object.assign(errors, validateNewPassword(req.body.new_password, req.body.new_password_confirm, {
      password: 'new_password', confirm: 'new_password_confirm',
    }));
  }

  if (Object.keys(errors).length) {
    const { current_password: a, new_password: b, new_password_confirm: c, ...values } = req.body;
    res.status(422);
    return renderProfile(req, res, { values, errors });
  }

  updateUser(db, req.user.id, data);
  if (changingPassword) setPassword(db, req.user.id, req.body.new_password);
  setFlash(req, 'success', MESSAGES.profileSaved);
  return res.redirect('/profile');
});

router.post('/profile/delete', (req, res, next) => {
  if (!verifyPassword(req.user, req.body.delete_password)) {
    res.status(422);
    return renderProfile(req, res, { errors: { delete_password: MESSAGES.deletePasswordWrong } });
  }
  anonymizeUser(req.app.locals.db, req.user.id);
  return req.session.regenerate((err) => {
    if (err) return next(err);
    setFlash(req, 'success', MESSAGES.accountDeleted);
    return res.redirect('/championships');
  });
});

module.exports = router;
