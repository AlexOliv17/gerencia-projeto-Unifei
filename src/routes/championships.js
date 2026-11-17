const express = require('express');
const { render404 } = require('../middleware/session');
const { listCities } = require('../models/cities');
const { getChampionship, searchPublicChampionships, categoriesWithIds } = require('../models/championships');
const { approvedEntriesByCategory } = require('../models/registrations');
const { listMatches, lastResultUpdate } = require('../models/matches');
const { categoryStandings } = require('../models/standings');
const { getRaceStart, listRunners } = require('../models/races');
const { raceRanking } = require('../rules/standings');
const { parseSearchFilters } = require('../validation/championships');

const router = express.Router();

const PUBLIC_FILTERS = ['city_id', 'sport', 'category', 'date_from', 'date_to', 'open_only'];

router.get('/championships', (req, res) => {
  const { values, criteria, errors } = parseSearchFilters(req.query, PUBLIC_FILTERS);
  // RFS12: on a first visit (no filters submitted) a logged user sees their own city by default.
  if (req.user && Object.keys(req.query).length === 0) {
    values.city_id = String(req.user.city_id);
    criteria.cityId = req.user.city_id;
  }
  res.render('championships/index', {
    title: 'Campeonatos',
    cities: listCities(req.app.locals.db),
    filters: values,
    errors,
    championships: searchPublicChampionships(req.app.locals.db, criteria),
  });
});

router.get('/championships/:id', (req, res) => {
  const championship = getChampionship(req.app.locals.db, Number(req.params.id));
  if (!championship) return render404(res);
  const { user } = req;
  const canRegister = Boolean(user) && ['user', 'organizer'].includes(user.role)
    && championship.displayStatus === 'open' && championship.organizer_id !== user.id;
  return res.render('championships/show', {
    title: championship.name,
    championship,
    canRegister,
    approved: approvedEntriesByCategory(req.app.locals.db, championship.id),
  });
});

/** RFS13: public table of one category — upcoming games, results and standings (or the race ranking). */
router.get('/championships/:id/table', (req, res) => {
  const { db } = req.app.locals;
  const championship = getChampionship(db, Number(req.params.id));
  if (!championship) return render404(res);
  const categories = categoriesWithIds(db, championship.id);
  const category = categories.find((c) => c.id === Number(req.query.category_id)) ?? categories[0];
  const run = championship.sport === 'street_run';
  const matches = run ? [] : listMatches(db, championship.id, { categoryId: category.id });
  return res.render('championships/table', {
    title: `Tabela e classificação — ${championship.name}`,
    championship,
    categories,
    category,
    upcoming: matches.filter((m) => !m.hasResult),
    results: matches.filter((m) => m.hasResult && m.status === 'scheduled'),
    standings: run ? [] : categoryStandings(db, championship, category.id),
    start: run ? getRaceStart(db, category.id) : null,
    ranking: run ? raceRanking(listRunners(db, category.id)) : [],
    lastUpdate: lastResultUpdate(db, championship.id, category.id),
  });
});

module.exports = router;
