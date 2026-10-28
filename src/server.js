const config = require('./config');
const { openDatabase } = require('./db/database');
const { createApp } = require('./app');

const db = openDatabase(config.dbPath);
const app = createApp({ db });

app.listen(config.port, () => {
  console.log(`Arena Local rodando em http://localhost:${config.port}`);
});
