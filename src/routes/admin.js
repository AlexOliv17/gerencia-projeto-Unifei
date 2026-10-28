const express = require('express');
const { requireRole } = require('../middleware/auth');
const { listOutbox } = require('../models/outbox');

const router = express.Router();

router.use('/admin', requireRole('admin'));

router.get('/admin/outbox', (req, res) => {
  res.render('admin/outbox', { title: 'Caixa de saída', messages: listOutbox(req.app.locals.db) });
});

module.exports = router;
