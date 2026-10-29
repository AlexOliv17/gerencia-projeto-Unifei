const { MESSAGES, ROLES, USER_STATUS } = require('../constants');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

const trim = (v) => (typeof v === 'string' ? v.trim() : '');

function normalizeEmail(value) {
  return trim(value).toLowerCase();
}

function isValidEmail(value) {
  return EMAIL.test(value);
}

/** Keeps only digits; a CPF has 11 and a CNPJ 14, anything else is null. */
function normalizeDocument(value) {
  const digits = trim(value).replace(/\D/g, '');
  return digits.length === 11 || digits.length === 14 ? digits : null;
}

const ALLOWED_ROLES = {
  register: ['user', 'organizer'],
  adminCreate: Object.keys(ROLES),
  adminEdit: Object.keys(ROLES),
};

/**
 * Validates the user form for a given mode:
 * - register: self sign-up (no admin role, status derived from role)
 * - adminCreate / adminEdit: admin forms (role and status chosen; no password on edit)
 * - profile: own data (role fixed by options.role; password handled separately)
 */
function validateUserInput(input, { mode, role: currentRole, cityIds = [] }) {
  const errors = {};
  const data = {};

  data.name = trim(input.name);
  if (!data.name) errors.name = MESSAGES.required;

  data.email = normalizeEmail(input.email);
  if (!data.email) errors.email = MESSAGES.required;
  else if (!isValidEmail(data.email)) errors.email = MESSAGES.emailInvalid;

  if (mode === 'register' || mode === 'adminCreate') {
    data.password = typeof input.password === 'string' ? input.password : '';
    if (!data.password) errors.password = MESSAGES.required;
    else if (data.password.length < MIN_PASSWORD) errors.password = MESSAGES.passwordShort;
    if (data.password && input.password_confirm !== data.password) errors.password_confirm = MESSAGES.passwordMismatch;
  }

  data.cityId = Number(input.city_id);
  if (!cityIds.includes(data.cityId)) errors.city_id = MESSAGES.required;

  let role = currentRole;
  if (mode !== 'profile') {
    role = trim(input.role);
    if (!ALLOWED_ROLES[mode].includes(role)) errors.role = MESSAGES.required;
    data.role = role;
  }

  if (mode === 'register') {
    data.status = role === 'organizer' ? 'pending' : 'active';
  } else if (mode === 'adminCreate' || mode === 'adminEdit') {
    data.status = trim(input.status);
    if (!(data.status in USER_STATUS)) errors.status = MESSAGES.required;
  }

  if (role === 'organizer') {
    data.document = normalizeDocument(input.document);
    if (!data.document) errors.document = MESSAGES.documentInvalid;
    data.leagueName = trim(input.league_name);
    if (!data.leagueName) errors.league_name = MESSAGES.required;
  } else {
    data.document = null;
    data.leagueName = null;
  }

  return { errors, data };
}

/** Errors for a new password + confirmation pair, keyed by the given field names. */
function validateNewPassword(password, confirm, fields = { password: 'password', confirm: 'password_confirm' }) {
  const errors = {};
  if (!password) errors[fields.password] = MESSAGES.required;
  else if (password.length < MIN_PASSWORD) errors[fields.password] = MESSAGES.passwordShort;
  else if (confirm !== password) errors[fields.confirm] = MESSAGES.passwordMismatch;
  return errors;
}

module.exports = {
  normalizeEmail, isValidEmail, normalizeDocument, validateUserInput, validateNewPassword, MIN_PASSWORD,
};
