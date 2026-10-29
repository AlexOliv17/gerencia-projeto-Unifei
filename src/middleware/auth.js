const { render403 } = require('./session');

function requireLogin(req, res, next) {
  if (!req.user) return res.redirect('/login');
  return next();
}

/** Visitors go to the login page; logged users without one of the roles get 403. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (!roles.includes(req.user.role)) return render403(res);
    return next();
  };
}

/** Organizers still pending validation see an explanation instead of the championship form. */
function requireActiveOrganizer(req, res, next) {
  if (!req.user) return res.redirect('/login');
  if (req.user.role !== 'organizer') return render403(res);
  if (req.user.status !== 'active') return res.render('championships/pending', { title: 'Cadastro em validação' });
  return next();
}

module.exports = { requireLogin, requireRole, requireActiveOrganizer };
