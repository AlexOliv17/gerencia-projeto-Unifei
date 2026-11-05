const { MESSAGES, TEAM_SPORTS, MAX_ATHLETES } = require('../constants');

const trim = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Tabela 08 athletes: one per line as "Nome; número". Blank lines are skipped but still counted, so the
 * line number in the error matches what the person sees in the text box.
 */
function parseAthletes(text) {
  const athletes = [];
  const numbers = new Set();
  const lines = typeof text === 'string' ? text.split(/\r?\n/) : [];
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(';');
    const name = trim(parts[0]);
    const number = trim(parts.slice(1).join(';'));
    if (parts.length < 2 || !name || !number) return { athletes: [], error: MESSAGES.athleteLineInvalid(index + 1) };
    const key = number.toLowerCase();
    if (numbers.has(key)) return { athletes: [], error: MESSAGES.athleteNumberRepeated(index + 1) };
    numbers.add(key);
    athletes.push({ name, number });
  }
  if (!athletes.length) return { athletes, error: MESSAGES.athletesRequired };
  if (athletes.length > MAX_ATHLETES) return { athletes: [], error: MESSAGES.athletesTooMany };
  return { athletes, error: null };
}

/** RFS14: name, team sport, city and the athlete list (the owner is always the logged user). */
function validateTeamInput(input, { cityIds = [] } = {}) {
  const errors = {};
  const data = {};

  data.name = trim(input.name);
  if (!data.name) errors.name = MESSAGES.required;

  data.sport = trim(input.sport);
  if (!TEAM_SPORTS.includes(data.sport)) errors.sport = MESSAGES.teamSportInvalid;

  data.cityId = Number(input.city_id);
  if (!cityIds.includes(data.cityId)) errors.city_id = MESSAGES.required;

  const { athletes, error } = parseAthletes(input.athletes);
  data.athletes = athletes;
  if (error) errors.athletes = error;

  return { errors, data };
}

module.exports = { parseAthletes, validateTeamInput };
