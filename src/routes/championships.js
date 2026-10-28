const express = require('express');

const router = express.Router();

router.get('/championships', (req, res) => {
  res.render('championships/index', { title: 'Campeonatos' });
});

module.exports = router;
