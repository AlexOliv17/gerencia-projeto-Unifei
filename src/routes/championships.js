const express = require('express');
const { render404 } = require('../middleware/session');
const { listCities } = require('../models/cities');
const { getChampionship, searchPublicChampionships } = require('../models/championships');
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
  return res.render('championships/show', { title: championship.name, championship });
});

module.exports = router;
