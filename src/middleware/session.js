const { MESSAGES } = require('../constants');

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

/** Moves the one-shot flash message from the session to the view. */
function flash(req, res, next) {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
}

function render403(res) {
  res.status(403).render('errors/403', { title: MESSAGES.forbidden });
}

function render404(res) {
  res.status(404).render('errors/404', { title: 'Página não encontrada' });
}

module.exports = { setFlash, flash, render403, render404 };
