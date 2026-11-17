const express = require('express');
const { MESSAGES, NOTIFICATION_TYPES } = require('../constants');
const { requireRole } = require('../middleware/auth');
const { setFlash } = require('../middleware/session');
const {
  listNotifications, markAllRead, preferences, savePreferences,
} = require('../models/notifications');

const router = express.Router();

const RECEIVERS = requireRole('user', 'organizer');

/** "Meus avisos": newest first; opening the page marks them as read (the ones that were unread stay highlighted once). */
router.get('/my/notifications', RECEIVERS, (req, res) => {
  const { db } = req.app.locals;
  const notifications = listNotifications(db, req.user.id);
  markAllRead(db, req.user.id);
  res.render('notifications/index', { title: 'Meus avisos', notifications, unreadCount: 0 });
});

router.get('/my/notifications/preferences', RECEIVERS, (req, res) => {
  res.render('notifications/preferences', {
    title: 'Preferências de avisos', prefs: preferences(req.app.locals.db, req.user.id), types: NOTIFICATION_TYPES,
  });
});

router.post('/my/notifications/preferences', RECEIVERS, (req, res) => {
  const enabled = new Set(Object.keys(NOTIFICATION_TYPES).filter((type) => req.body[type]));
  savePreferences(req.app.locals.db, req.user.id, enabled);
  setFlash(req, 'success', MESSAGES.preferencesSaved);
  res.redirect('/my/notifications/preferences');
});

module.exports = router;
