const express = require('express');
const { MESSAGES } = require('../constants');
const { requireRole } = require('../middleware/auth');
const { setFlash, render404 } = require('../middleware/session');
const { listCities } = require('../models/cities');
const { listOutbox } = require('../models/outbox');
const {
  createUser, findUserById, emailInUse, updateUser, anonymizeUser, searchUsers, isLastActiveAdmin,
} = require('../models/users');
const { validateUserInput } = require('../validation/users');
const { searchChampionships } = require('../models/championships');
const { parseSearchFilters } = require('../validation/championships');

const router = express.Router();

router.use('/admin', requireRole('admin'));

router.get('/admin/outbox', (req, res) => {
  res.render('admin/outbox', { title: 'Caixa de saída', messages: listOutbox(req.app.locals.db) });
});

router.get('/admin/championships', (req, res) => {
  const { values, criteria, errors } = parseSearchFilters(req.query, ['name', 'sport', 'status', 'date_from', 'date_to']);
  res.render('admin/championships', {
    title: 'Todos os campeonatos',
    filters: values,
    errors,
    championships: searchChampionships(req.app.locals.db, criteria),
  });
});

router.get('/admin/users', (req, res) => {
  const filters = {
    name: req.query.name || '',
    email: req.query.email || '',
    role: req.query.role || '',
    status: req.query.status || '',
  };
  res.render('admin/users', { title: 'Usuários', filters, users: searchUsers(req.app.locals.db, filters) });
});

function renderUserForm(req, res, { mode, target = null, values, errors = {} }) {
  const { password, password_confirm: confirm, ...safeValues } = values;
  res.render('admin/user-form', {
    title: mode === 'new' ? 'Novo usuário' : 'Editar usuário',
    mode,
    target,
    cities: listCities(req.app.locals.db),
    values: safeValues,
    errors,
  });
}

/** Loads :id into req.target or answers 404. */
function loadTarget(req, res, next) {
  const target = findUserById(req.app.locals.db, Number(req.params.id));
  if (!target) return render404(res);
  req.target = target;
  return next();
}

router.get('/admin/users/new', (req, res) => {
  renderUserForm(req, res, { mode: 'new', values: { role: 'user', status: 'active' } });
});

router.post('/admin/users/new', (req, res) => {
  const { db } = req.app.locals;
  const cityIds = listCities(db).map((c) => c.id);
  const { errors, data } = validateUserInput(req.body, { mode: 'adminCreate', cityIds });
  if (!errors.email && emailInUse(db, data.email)) errors.email = MESSAGES.emailTaken;
  if (Object.keys(errors).length) {
    res.status(422);
    return renderUserForm(req, res, { mode: 'new', values: req.body, errors });
  }
  createUser(db, data);
  setFlash(req, 'success', MESSAGES.userCreated);
  return res.redirect('/admin/users');
});

router.get('/admin/users/:id/edit', loadTarget, (req, res) => {
  const t = req.target;
  renderUserForm(req, res, {
    mode: 'edit',
    target: t,
    values: {
      name: t.name, email: t.email, city_id: t.city_id, role: t.role, status: t.status,
      document: t.document, league_name: t.league_name,
    },
  });
});

router.post('/admin/users/:id/edit', loadTarget, (req, res) => {
  const { db } = req.app.locals;
  const cityIds = listCities(db).map((c) => c.id);
  const { errors, data } = validateUserInput(req.body, { mode: 'adminEdit', cityIds });
  if (!errors.email && emailInUse(db, data.email, req.target.id)) errors.email = MESSAGES.emailTaken;
  const losesAdmin = data.role !== 'admin' || data.status !== 'active';
  if (!errors.role && losesAdmin && isLastActiveAdmin(db, req.target)) errors.role = MESSAGES.lastAdminDemote;
  if (Object.keys(errors).length) {
    res.status(422);
    return renderUserForm(req, res, { mode: 'edit', target: req.target, values: req.body, errors });
  }
  updateUser(db, req.target.id, data);
  setFlash(req, 'success', MESSAGES.userSaved);
  return res.redirect('/admin/users');
});

router.get('/admin/users/:id/delete', loadTarget, (req, res) => {
  res.render('admin/user-delete', { title: 'Excluir usuário', target: req.target });
});

router.post('/admin/users/:id/delete', loadTarget, (req, res) => {
  const { db } = req.app.locals;
  if (isLastActiveAdmin(db, req.target)) {
    setFlash(req, 'error', MESSAGES.lastAdmin);
    return res.redirect('/admin/users');
  }
  anonymizeUser(db, req.target.id);
  setFlash(req, 'success', MESSAGES.userDeleted);
  return res.redirect('/admin/users');
});

module.exports = router;
