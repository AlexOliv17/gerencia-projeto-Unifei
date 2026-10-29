const { MESSAGES, SPORTS, FORMATS } = require('../constants');
const { parseBrDate } = require('./dates');

const trim = (v) => (typeof v === 'string' ? v.trim() : '');
const optional = (v) => trim(v) || null;

/** Comma-separated list → unique, non-empty names (duplicates compared case-insensitively, first spelling wins). */
function parseCategories(value) {
  const seen = new Set();
  const result = [];
  for (const raw of trim(value).split(',')) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      result.push(name);
    }
  }
  return result;
}

function parseDateField(input, field, errors) {
  const raw = trim(input[field]);
  if (!raw) {
    errors[field] = MESSAGES.required;
    return null;
  }
  const iso = parseBrDate(raw);
  if (!iso) errors[field] = MESSAGES.dateInvalid;
  return iso;
}

/** Tabela 03 of the DRE plus the RFS05 business rules (dates and format × sport). */
function validateChampionshipInput(input, { cityIds = [] } = {}) {
  const errors = {};
  const data = {};

  data.name = trim(input.name);
  if (!data.name) errors.name = MESSAGES.required;

  data.sport = trim(input.sport);
  if (!(data.sport in SPORTS)) errors.sport = MESSAGES.required;

  data.categories = parseCategories(input.categories);
  if (!data.categories.length) errors.categories = MESSAGES.categoriesRequired;

  data.cityId = Number(input.city_id);
  if (!cityIds.includes(data.cityId)) errors.city_id = MESSAGES.required;

  data.venue = trim(input.venue);
  if (!data.venue) errors.venue = MESSAGES.required;

  data.startDate = parseDateField(input, 'start_date', errors);
  data.endDate = parseDateField(input, 'end_date', errors);
  data.registrationDeadline = parseDateField(input, 'registration_deadline', errors);
  if (data.startDate && data.endDate && data.endDate < data.startDate) errors.end_date = MESSAGES.endBeforeStart;
  if (data.startDate && data.registrationDeadline && data.registrationDeadline > data.startDate) {
    errors.registration_deadline = MESSAGES.deadlineAfterStart;
  }

  data.format = trim(input.format);
  if (!(data.format in FORMATS)) errors.format = MESSAGES.required;
  else if (data.format === 'individual' && data.sport in SPORTS && data.sport !== 'street_run') {
    errors.format = MESSAGES.individualOnlyRun;
  } else if (data.sport === 'street_run' && data.format !== 'individual') {
    errors.format = MESSAGES.runOnlyIndividual;
  }

  const slots = trim(input.max_slots);
  data.maxSlots = null;
  if (slots) {
    if (/^\d+$/.test(slots) && Number(slots) > 0) data.maxSlots = Number(slots);
    else errors.max_slots = MESSAGES.slotsInvalid;
  }

  data.rules = optional(input.rules);
  data.contact = optional(input.contact);

  return { errors, data };
}

/**
 * Reads list filters from the query string. `values` goes back to the form as typed; `criteria` holds
 * only valid filters (a malformed date is reported and ignored instead of breaking the search).
 */
function parseSearchFilters(query, fields) {
  const values = {};
  const criteria = {};
  const errors = {};
  for (const field of fields) values[field] = trim(query[field]);
  for (const [field, key] of [['date_from', 'dateFrom'], ['date_to', 'dateTo']]) {
    if (!values[field]) continue;
    const iso = parseBrDate(values[field]);
    if (iso) criteria[key] = iso;
    else errors[field] = MESSAGES.dateInvalid;
  }
  if (values.name) criteria.name = values.name;
  if (values.sport in SPORTS) criteria.sport = values.sport;
  if (values.status) criteria.status = values.status;
  if (values.category) criteria.category = values.category;
  if (values.city_id) criteria.cityId = Number(values.city_id);
  if (values.open_only) criteria.openOnly = true;
  return { values, criteria, errors };
}

module.exports = { validateChampionshipInput, parseCategories, parseSearchFilters };
