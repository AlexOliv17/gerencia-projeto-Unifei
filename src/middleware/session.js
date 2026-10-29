const { MESSAGES } = require('../constants');
const { findUserById } = require('../models/users');

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

/** Moves the one-shot flash message from the session to the view. */
function flash(req, res, next) {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
}

/** Loads the logged user on every request; a deleted or suspended account loses its session immediately. */
function loadUser(req, res, next) {
  req.user = null;
  res.locals.currentUser = null;
  const { userId } = req.session;
  if (!userId) return next();

  const user = findUserById(req.app.locals.db, userId);
  if (!user || user.status === 'suspended') {
    delete req.session.userId;
    return next();
  }
  req.user = user;
  res.locals.currentUser = user;
  return next();
}

function render403(res) {
  res.status(403).render('errors/403', { title: MESSAGES.forbidden });
}

function render404(res) {
  res.status(404).render('errors/404', { title: 'Página não encontrada' });
}

module.exports = { setFlash, flash, loadUser, render403, render404 };
