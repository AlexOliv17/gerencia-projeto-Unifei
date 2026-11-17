const config = require('./config');
const { openDatabase } = require('./db/database');
const { createApp } = require('./app');
const { runReminders } = require('./models/reminders');

const db = openDatabase(config.dbPath);
const app = createApp({ db });

/** RFS18: reminders of games, race starts and registration deadlines, checked every minute while the server runs. */
function reminders() {
  try {
    const sent = runReminders(db);
    if (sent) console.log(`[avisos] ${sent} lembrete(s) enviado(s)`);
  } catch (err) {
    console.error('[avisos] falha ao verificar lembretes', err);
  }
}
reminders();
setInterval(reminders, 60 * 1000);

app.listen(config.port, () => {
  console.log(`Arena Local rodando em http://localhost:${config.port}`);
});
