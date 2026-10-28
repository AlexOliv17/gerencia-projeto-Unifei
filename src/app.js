const path = require('node:path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const constants = require('./constants');
const { formatBrDate } = require('./validation/dates');
const { flash, loadUser, render404 } = require('./middleware/session');

function createApp({ db }) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.locals.db = db;
  app.locals.labels = constants;
  app.locals.formatBrDate = formatBrDate;

  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
  }));
  app.use(flash);
  app.use(loadUser);

  app.get('/', (req, res) => res.redirect('/championships'));
  app.use(require('./routes/auth'));
  app.use(require('./routes/championships'));

  app.use((req, res) => render404(res));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('errors/500', { title: 'Erro interno' });
  });

  return app;
}

module.exports = { createApp };
