const { MESSAGES, DEFAULT_MATCH_MINUTES } = require('../constants');
const { parseBrDate, parseTime } = require('./dates');

const trim = (v) => (typeof v === 'string' ? v.trim() : '');

function dateInPeriod(input, field, championship, errors) {
  const raw = trim(input[field]);
  if (!raw) {
    errors[field] = MESSAGES.required;
    return null;
  }
  const iso = parseBrDate(raw);
  if (!iso) errors[field] = MESSAGES.dateInvalid;
  else if (iso < championship.start_date || iso > championship.end_date) errors[field] = MESSAGES.dateOutsidePeriod;
  return iso;
}

function timeField(input, field, errors) {
  const raw = trim(input[field]);
  if (!raw) {
    errors[field] = MESSAGES.required;
    return null;
  }
  const minutes = parseTime(raw);
  if (minutes === null) errors[field] = MESSAGES.timeInvalid;
  return minutes;
}

/** Whole number in [min, max]; blank takes the fallback. */
function boundedInt(input, field, { min, max, fallback, message }, errors) {
  const raw = trim(input[field]);
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) {
    errors[field] = message;
    return null;
  }
  return Number(raw);
}

function durationField(input, errors) {
  return boundedInt(input, 'duration_minutes', {
    min: 10, max: 300, fallback: DEFAULT_MATCH_MINUTES, message: MESSAGES.durationInvalid,
  }, errors);
}

/**
 * Tabela 05 fields of a match typed by the organizer. `entries` maps a category id to its approved entries
 * ([{ id, name }]): rule 3 means only those can play. Conflicts (rules 1 and 2) need the database and are
 * checked by the caller.
 */
function validateMatchInput(input, { championship, categoryIds, entries }) {
  const errors = {};
  const data = {};

  data.categoryId = Number(input.category_id);
  if (!categoryIds.includes(data.categoryId)) errors.category_id = MESSAGES.required;

  data.round = trim(input.round);
  if (!data.round) errors.round = MESSAGES.required;

  data.groupName = trim(input.group_name).toUpperCase() || null;
  if (data.groupName && championship.format !== 'groups_knockout') errors.group_name = MESSAGES.matchGroupOnlyGroups;
  if (championship.format === 'knockout') data.kind = 'knockout';
  else if (championship.format === 'groups_knockout') data.kind = data.groupName ? 'league' : 'knockout';
  else data.kind = 'league';

  const approved = new Set((entries.get(data.categoryId) ?? []).map((e) => e.id));
  for (const [field, key] of [['registration_a_id', 'registrationAId'], ['registration_b_id', 'registrationBId']]) {
    const raw = trim(input[field]);
    data[key] = Number(raw);
    if (!raw) errors[field] = MESSAGES.required;
    else if (!errors.category_id && !approved.has(data[key])) errors[field] = MESSAGES.matchTeamNotApproved;
  }
  if (!errors.registration_a_id && !errors.registration_b_id && data.registrationAId === data.registrationBId) {
    errors.registration_b_id = MESSAGES.matchSameTeams;
  }

  data.date = dateInPeriod(input, 'match_date', championship, errors);
  data.startTime = timeField(input, 'start_time', errors);
  data.duration = durationField(input, errors);

  data.venue = trim(input.venue);
  if (!data.venue) errors.venue = MESSAGES.required;

  return { errors, data };
}

/** Automatic table: category, first round date and time, game length, days between rounds and venue. */
function validateGenerateInput(input, { championship, categoryIds }) {
  const errors = {};
  const data = {};
  data.categoryId = Number(input.category_id);
  if (!categoryIds.includes(data.categoryId)) errors.category_id = MESSAGES.required;
  data.firstDate = dateInPeriod(input, 'first_date', championship, errors);
  data.firstTime = timeField(input, 'first_time', errors);
  data.duration = durationField(input, errors);
  data.intervalDays = boundedInt(input, 'interval_days', {
    min: 1, max: 30, fallback: 7, message: MESSAGES.intervalInvalid,
  }, errors);
  data.venue = trim(input.venue);
  if (!data.venue) errors.venue = MESSAGES.required;
  return { errors, data };
}

function score(input, field, errors, { optional = false } = {}) {
  const raw = trim(input[field]);
  if (!raw) {
    if (!optional) errors[field] = MESSAGES.required;
    return null;
  }
  if (!/^\d{1,3}$/.test(raw)) {
    errors[field] = MESSAGES.scoreInvalid;
    return null;
  }
  return Number(raw);
}

/**
 * RFS10: goals (football, futsal) or sets plus optional point totals (volleyball). A knockout game needs a winner;
 * a volleyball game always has one.
 */
function validateResultInput(input, { sport, kind }) {
  const errors = {};
  const data = { scoreA: score(input, 'score_a', errors), scoreB: score(input, 'score_b', errors), pointsA: null, pointsB: null };
  if (sport === 'volleyball') {
    data.pointsA = score(input, 'points_a', errors, { optional: true });
    data.pointsB = score(input, 'points_b', errors, { optional: true });
    if (!errors.points_a && !errors.points_b && (data.pointsA === null) !== (data.pointsB === null)) {
      errors.points_b = MESSAGES.volleyPointsBoth;
    }
  }
  if (!errors.score_a && !errors.score_b && data.scoreA === data.scoreB) {
    if (sport === 'volleyball') errors.score_b = MESSAGES.volleyDraw;
    else if (kind === 'knockout') errors.score_b = MESSAGES.knockoutDraw;
  }
  return { errors, data };
}

/** "H:MM:SS" or "HH:MM:SS" → seconds (greater than zero), else null. */
function parseFinishTime(value) {
  const match = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(trim(value));
  if (!match) return null;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return seconds > 0 ? seconds : null;
}

function formatFinishTime(seconds) {
  if (seconds == null) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

/** Street run start of one category: date within the period, time and venue. */
function validateRaceStartInput(input, { championship }) {
  const errors = {};
  const data = {
    date: dateInPeriod(input, 'start_date', championship, errors),
    startTime: timeField(input, 'start_time', errors),
    venue: trim(input.venue),
  };
  if (!data.venue) errors.venue = MESSAGES.required;
  return { errors, data };
}

module.exports = {
  validateMatchInput, validateGenerateInput, validateResultInput, validateRaceStartInput, parseFinishTime, formatFinishTime,
};
