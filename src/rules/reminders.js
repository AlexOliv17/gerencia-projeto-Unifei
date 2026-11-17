const HOUR = 60 * 60 * 1000;

/** Local date and "HH:MM" → Date (the server's time zone, as everywhere else in the app). */
function startOf(dateIso, time = '00:00') {
  const [y, m, d] = dateIso.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

/** Registrations close at the end of the deadline day (RFS15: "hoje ≤ prazo"). */
function deadlineEnd(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(y, m - 1, d + 1);
}

/**
 * Tabela 09, "Jogo ou prova próximo": the reminder due at `now` for an event starting at `start` — '2h' within two
 * hours, '24h' within a day, null when it is further away or already started. A run that missed the 24 h window
 * (server down) only sends the 2 h reminder.
 */
function matchReminder(start, now) {
  const left = start.getTime() - now.getTime();
  if (left <= 0) return null;
  if (left <= 2 * HOUR) return '2h';
  if (left <= 24 * HOUR) return '24h';
  return null;
}

/** Tabela 09, "Encerramento de inscrições": due within 48 h of the end of the deadline day. */
function closingReminderDue(deadline, now) {
  const left = deadlineEnd(deadline).getTime() - now.getTime();
  return left > 0 && left <= 48 * HOUR;
}

module.exports = { startOf, deadlineEnd, matchReminder, closingReminderDue };
